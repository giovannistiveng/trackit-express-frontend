import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: false,
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
  logs: { nivelMinimo: 'DEBUG', enviarAlServidor: true, consola: true },
  demo: {
    // Mientras no exista GET /api/conductores/me (flag conductorMe), aquí se relaciona
    // cada usuario conductor con su fila de la tabla Conductor. Ver docs/demo-conductor.sql.
    conductores: [{ idUsuario: 2, idConductor: 1, estadoAprobacion: 'Aprobado' }],
  },
};
