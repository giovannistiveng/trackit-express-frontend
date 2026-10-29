import { AppEnvironment } from './environment.model';

/**
 * Producción. Cambia apiBaseUrl por la URL pública del backend antes de compilar
 * (o sirve frontend y backend en el mismo dominio con /api detrás de un proxy).
 */
export const environment: AppEnvironment = {
  production: true,
  apiBaseUrl: '/api',
  logs: { nivelMinimo: 'INFO', enviarAlServidor: true, consola: false },
};
