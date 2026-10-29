import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { ApiError } from '../http/api-error';
import { SessionService } from './session.service';

const RUTAS_PUBLICAS = ['/auth/login', '/auth/register'];

/**
 * Agrega Authorization: Bearer <token> a las peticiones de la API. Si la respuesta es 401/403
 * (fuera de login y registro), cierra la sesión y lleva a /login con un aviso.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(APP_CONFIG);
  const session = inject(SessionService);
  const router = inject(Router);
  if (!req.url.startsWith(config.apiBaseUrl)) return next(req);

  const token = session.token();
  const peticion = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  const esPublica = RUTAS_PUBLICAS.some((r) => req.url.startsWith(config.apiBaseUrl + r));

  return next(peticion).pipe(
    catchError((e: unknown) => {
      if (
        !esPublica &&
        e instanceof ApiError &&
        (e.status === 401 || e.status === 403) &&
        session.estaAutenticado()
      ) {
        session.cerrar('rechazada');
        void router.navigate(['/login'], { queryParams: { motivo: 'sesion' } });
      }
      return throwError(() => e);
    }),
  );
};
