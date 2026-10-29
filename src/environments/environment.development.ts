import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000/api',
  logs: { nivelMinimo: 'DEBUG', enviarAlServidor: true, consola: true },
};
