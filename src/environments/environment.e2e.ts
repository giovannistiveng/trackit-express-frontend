import { AppEnvironment } from './environment.model';

/**
 * Pruebas de punta a punta (Playwright): la API va por el proxy del servidor de desarrollo
 * (e2e/proxy.conf.json → backend en el puerto 3300), así que no hace falta CORS.
 */
export const environment: AppEnvironment = {
  production: false,
  apiBaseUrl: '/api',
  logs: { nivelMinimo: 'WARN', enviarAlServidor: false, consola: true },
};
