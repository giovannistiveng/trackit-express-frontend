import { ErrorHandler, Injectable, inject } from '@angular/core';
import { LoggerPort } from '../ports';
import { recortarStack } from './sanitize';

/** Registra como ERROR todo error no capturado (con el stack recortado a 15 líneas). */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly log = inject(LoggerPort);

  handleError(error: unknown): void {
    const e = error instanceof Error ? error : new Error(String(error));
    this.log.error('ErrorHandler', `Error no controlado: ${e.message}`, {
      stack: recortarStack(e.stack),
    });
  }
}
