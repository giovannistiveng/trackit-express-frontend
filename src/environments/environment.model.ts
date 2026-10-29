export type NivelLog = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface FeatureFlags {
  /** Brecha 1: GET /api/conductores/me. */
  conductorMe: boolean;
  /** Brecha 2: GET /api/zonas. */
  zonasEndpoint: boolean;
  /** Brecha 3: GET /api/clientes/envios. */
  clienteEnviosEndpoint: boolean;
  /** Brecha 4: GET /api/conductores/envios/disponibles. */
  disponiblesEndpoint: boolean;
  /** Brecha 5: POST /api/envios/:id/iniciar-ruta. */
  iniciarRutaEndpoint: boolean;
  /** Brecha 6: GET /api/conductores/pendientes. */
  pendientesEndpoint: boolean;
  /** Brecha 7: POST /api/envios/:id/evidencia. */
  evidenciaUpload: boolean;
  /** Brecha 8: POST/GET /api/envios/:id/ubicacion. */
  ubicacion: boolean;
  /** Brecha 9: calificado/calificación en la trazabilidad. */
  reputacion: boolean;
  /** Brecha 10: observation en POST /api/conductores/aprobar. */
  motivoRechazo: boolean;
  /** Brecha 11: GET /api/admin/dashboard/metrics y /api/admin/auditoria. */
  adminDashboard: boolean;
  /** Brecha 12: categoría de vehículo en el envío. */
  categoriaEnvio: boolean;
}

export interface ConductorDemo {
  idUsuario: number;
  idConductor: number;
  estadoAprobacion: 'Pendiente' | 'Aprobado' | 'Rechazado';
}

export interface AppEnvironment {
  production: boolean;
  apiBaseUrl: string;
  features: FeatureFlags;
  cloudinary: { cloudName: string; uploadPreset: string };
  logs: { nivelMinimo: NivelLog; enviarAlServidor: boolean; consola: boolean };
  demo: { conductores: ConductorDemo[] };
}
