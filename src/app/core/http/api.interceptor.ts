import {
  HttpErrorResponse,
  HttpEvent,
  HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, retry, tap, throwError, timeout, TimeoutError, timer } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { LoggerPort } from '../ports';
import { ApiError, SIN_CONEXION, TIEMPO_AGOTADO } from './api-error';

export const TIEMPO_MAXIMO_MS = 15_000;

function sinQuery(url: string): string {
  return url.split('?')[0];
}

function aApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof TimeoutError)
    return new ApiError(408, 'Tiempo de espera agotado', TIEMPO_AGOTADO);
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return new ApiError(0, 'Sin conexión', SIN_CONEXION);
    const cuerpo = err.error as { error?: unknown } | string | null;
    const mensaje =
      cuerpo && typeof cuerpo === 'object' && typeof cuerpo.error === 'string'
        ? cuerpo.error
        : typeof cuerpo === 'string' && cuerpo.length < 300
          ? cuerpo
          : err.statusText || 'Error';
    return new ApiError(err.status, mensaje);
  }
  return new ApiError(-1, err instanceof Error ? err.message : 'Error desconocido');
}

/**
 * Para toda petición a la API: tiempo máximo de 15 s, un reintento solo en GET
 * (ante red caída o 5xx), errores normalizados a ApiError y registro en el log.
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(APP_CONFIG);
  const log = inject(LoggerPort);
  if (!req.url.startsWith(config.apiBaseUrl)) return next(req);

  const inicio = Date.now();
  const ruta = `${req.method} ${sinQuery(req.url.slice(config.apiBaseUrl.length)) || '/'}`;
  const esGet = req.method === 'GET';

  const flujo: Observable<HttpEvent<unknown>> = next(req).pipe(
    req.reportProgress ? (o) => o : timeout(TIEMPO_MAXIMO_MS),
    esGet
      ? retry({
          count: 1,
          delay: (e: unknown) =>
            e instanceof TimeoutError ||
            (e instanceof HttpErrorResponse && (e.status === 0 || e.status >= 500))
              ? timer(500)
              : throwError(() => e),
        })
      : (o) => o,
  );

  return flujo.pipe(
    tap((ev) => {
      if (ev instanceof HttpResponse)
        log.debug('HTTP', `${ruta} → ${ev.status} (${Date.now() - inicio} ms)`);
    }),
    catchError((e: unknown) => {
      const err = aApiError(e);
      const msg = `${ruta} → ${err.status} ${err.message} (${Date.now() - inicio} ms)`;
      if (err.status >= 400 && err.status < 500 && err.status !== 408) log.warn('HTTP', msg);
      else log.error('HTTP', msg);
      return throwError(() => err);
    }),
  );
};
