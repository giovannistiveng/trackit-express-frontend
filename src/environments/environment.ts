import { AppEnvironment } from './environment.model';

/** Producción. Las brechas del backend siguen simuladas hasta que existan sus endpoints. */
export const environment: AppEnvironment = {
  production: true,
  apiBaseUrl: 'http://localhost:3000/api',
  features: {
    conductorMe: false,
    zonasEndpoint: false,
    clienteEnviosEndpoint: false,
    disponiblesEndpoint: false,
    iniciarRutaEndpoint: false,
    pendientesEndpoint: false,
    evidenciaUpload: false,
    ubicacion: false,
    reputacion: false,
    motivoRechazo: false,
    adminDashboard: false,
    categoriaEnvio: false,
  },
  cloudinary: { cloudName: '', uploadPreset: '' },
  logs: { nivelMinimo: 'INFO', enviarAlServidor: true, consola: false },
  demo: {
    conductores: [],
  },
};
