import { ErrorHandler, Injectable, inject } from '@angular/core';
import { LoggerPort } from '../ports';
import { recortarStack } from './sanitize';

/** Errores que nacen en extensiones del navegador: no son de la app y no se registran. */
const ORIGEN_EXTENSION = /(chrome|moz|safari-web|ms-browser)-extension:\/\//;
/** Un mismo error repetido dentro de esta ventana se registra una sola vez. */
export const VENTANA_REPETIDOS_MS = 10_000;

/**
 * Registra como ERROR todo error no capturado (con el stack recortado a 15 líneas).
 * Ignora los que vienen de extensiones y agrupa los repetidos para no inundar los logs.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly log = inject(LoggerPort);
  private readonly vistos = new Map<string, number>();

  handleError(error: unknown, ahora = Date.now()): void {
    const e = error instanceof Error ? error : new Error(String(error));
    if (esDeExtension(e)) return;
    const clave = `${e.name}:${e.message}`;
    const ultimo = this.vistos.get(clave);
    if (ultimo !== undefined && ahora - ultimo < VENTANA_REPETIDOS_MS) return;
    this.vistos.set(clave, ahora);
    if (this.vistos.size > 50) this.vistos.delete(this.vistos.keys().next().value as string);
    this.log.error('ErrorHandler', `Error no controlado: ${e.message}`, {
      stack: recortarStack(e.stack),
    });
  }
}

/** true si todas las líneas con ubicación del stack apuntan a una extensión del navegador. */
export function esDeExtension(e: Error): boolean {
  const lineas = (e.stack ?? '').split('\n').filter((l) => /:\d+:\d+\)?\s*$/.test(l));
  return lineas.length > 0 && lineas.every((l) => ORIGEN_EXTENSION.test(l));
}
