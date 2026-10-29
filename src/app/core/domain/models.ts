/** Rol tal como lo devuelve el backend: "1" Administrador, "2" Cliente, "3" Conductor. */
export type Rol = '1' | '2' | '3';
export const ROL = { ADMIN: '1', CLIENTE: '2', CONDUCTOR: '3' } as const satisfies Record<
  string,
  Rol
>;

export const ESTADOS_ENVIO = ['Pendiente', 'Asignado', 'En Ruta', 'Entregado'] as const;
export type EstadoEnvio = (typeof ESTADOS_ENVIO)[number];

export type EstadoAprobacion = 'Pendiente' | 'Aprobado' | 'Rechazado';

export const CATEGORIAS_VEHICULO = ['Moto Express', 'Motocarro', 'Camioneta'] as const;
export type CategoriaVehiculo = (typeof CATEGORIAS_VEHICULO)[number];

export const TIPOS_DOCUMENTO = ['Cédula', 'SOAT', 'Licencia'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const TIPOS_CARGA = ['Documentos', 'Mercancía General', 'Carga Pesada', 'Acarreo'] as const;

/** Sugerencias para origen y destino (sin autocompletado de terceros). */
export const LUGARES_FRECUENTES = [
  'Casco Urbano',
  'Vereda Pekín',
  'Vereda Novillero',
  'Silvania',
  'Pasca',
  'Bogotá',
];

export interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  rol: Rol;
}

export interface Sesion {
  token: string;
  usuario: Usuario;
  /** Expiración del JWT en milisegundos desde epoch (claim exp). */
  expiraEn: number;
}

export interface RegistroUsuario {
  nombre: string;
  correo: string;
  password: string;
  rol: Extract<Rol, '2' | '3'>;
}

export interface Zona {
  id: number;
  nombre: string;
  tarifaBase: number;
}

export interface SolicitudCotizacion {
  origen: string;
  destino: string;
  idZona: number;
}

export interface Cotizacion {
  distanciaKm: number;
  tarifaBase: number;
  tarifaTotal: number;
  moneda: 'COP';
}

export interface CambioEstado {
  estado: EstadoEnvio;
  fecha: Date;
}

export interface Envio {
  id: number;
  origen: string;
  destino: string;
  tipoCarga: string;
  tarifa: number;
  estado: EstadoEnvio;
  idCliente: number;
  idConductor: number | null;
  idZona: number;
  /** Solo presente en las vistas del cliente dueño del envío. */
  pin?: string;
  categoria?: CategoriaVehiculo | null;
  fechaCreacion?: Date;
  fechaUltimoCambio?: Date;
  /** Cronológico: del más antiguo al más reciente. */
  historial: CambioEstado[];
  conductor?: ConductorResumen;
  /** true si el cliente ya lo calificó (el backend lo informa en la trazabilidad y el historial). */
  calificado?: boolean;
}

export interface ConductorResumen {
  nombre: string;
  vehiculo?: CategoriaVehiculo;
  placa?: string;
  calificacionPromedio?: number;
}

export interface Vehiculo {
  id: number;
  placa: string;
  categoria: CategoriaVehiculo;
}

export interface PerfilConductor {
  idConductor: number;
  estadoAprobacion: EstadoAprobacion;
  motivoRechazo?: string | null;
  vehiculo?: Vehiculo;
}

export interface DocumentoConductor {
  id?: number;
  tipo: TipoDocumento;
  urlArchivo: string;
}

export type EventoCarga =
  { tipo: 'progreso'; porcentaje: number } | { tipo: 'completo'; documento: DocumentoConductor };

export interface ConductorPostulante {
  idConductor: number;
  nombre: string;
  correo: string;
  estadoAprobacion: EstadoAprobacion;
  motivoRechazo?: string | null;
  documentos: DocumentoConductor[];
}

export interface Ubicacion {
  lat: number;
  lon: number;
  capturadoEn: string;
}

export interface MetricasAdmin {
  enviosTotales: number;
  enviosActivos: number;
  entregados: number;
  ingresosCop: number;
  conductoresAprobados: number;
  conductoresPendientes: number;
  calificacionPromedio: number;
  porZona: { zona: string; envios: number }[];
  porEstado: { estado: EstadoEnvio; envios: number }[];
}

export interface RegistroAuditoria {
  id: number;
  fecha: Date;
  usuario: string;
  accion: string;
  entidad: string;
  detalle: string;
}

export interface FiltroAuditoria {
  texto?: string;
  accion?: string;
  pagina: number;
  tamano: number;
}

export interface Pagina<T> {
  items: T[];
  total: number;
  pagina: number;
  tamano: number;
}
