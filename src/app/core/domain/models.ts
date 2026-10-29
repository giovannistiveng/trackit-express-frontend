/** Rol tal como lo devuelve el backend: "1" Administrador, "2" Cliente, "3" Conductor. */
export type Rol = '1' | '2' | '3';
export const ROL = { ADMIN: '1', CLIENTE: '2', CONDUCTOR: '3' } as const satisfies Record<
  string,
  Rol
>;

export const ESTADOS_ENVIO = [
  'Pendiente',
  'Asignado',
  'En Ruta',
  'Entregado',
  'Cancelado',
] as const;
export type EstadoEnvio = (typeof ESTADOS_ENVIO)[number];
/** Recorrido normal de un envío (Cancelado lo interrumpe). */
export const RECORRIDO_ENVIO = [
  'Pendiente',
  'Asignado',
  'En Ruta',
  'Entregado',
] as const satisfies readonly EstadoEnvio[];

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
  /** Tiempo estimado del trayecto, en minutos. */
  duracionMin?: number;
  /** false si alguna dirección no se encontró y la distancia es aproximada. */
  distanciaExacta?: boolean;
}

export interface Coordenadas {
  lat: number;
  lon: number;
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
  calificacion?: number | null;
  comentario?: string | null;
  distanciaKm?: number | null;
  /** Indicaciones del cliente para el conductor. */
  notas?: string | null;
  motivoCancelacion?: string | null;
  origenCoords?: Coordenadas | null;
  destinoCoords?: Coordenadas | null;
  /** Solo en la vista del conductor: lo que gana por el servicio. */
  gananciaConductor?: number;
}

/** Datos para dibujar el mapa de seguimiento. */
export interface Seguimiento {
  idEnvio: number;
  estado: EstadoEnvio;
  origen: { direccion: string; coords: Coordenadas | null };
  destino: { direccion: string; coords: Coordenadas | null };
  ultima: Ubicacion | null;
  recorrido: Ubicacion[];
  /** La última posición tiene menos de 2 minutos. */
  enVivo: boolean;
  distanciaRestanteKm: number | null;
  etaMinutos: number | null;
}

export const TIPOS_NOTIFICACION = [
  'envio_aceptado',
  'ruta_iniciada',
  'envio_entregado',
  'envio_cancelado',
  'conductor_aprobado',
  'conductor_rechazado',
  'calificacion_recibida',
] as const;
export type TipoNotificacion = (typeof TIPOS_NOTIFICACION)[number];

export interface Notificacion {
  id: number;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  idEnvio: number | null;
  leida: boolean;
  fecha: Date;
}

export interface PerfilUsuario {
  id: number;
  nombre: string;
  correo: string;
  rol: Rol;
  nombreRol: string;
  telefono: string | null;
  fechaRegistro: Date | null;
}

export interface ResumenConductor {
  completados: number;
  ingresosTotal: number;
  ingresosMes: number;
  calificacionPromedio: number | null;
  totalCalificaciones: number;
  servicioActivo: number | null;
}

/** Envío visto desde el panel de administración. */
export interface EnvioAdmin extends Envio {
  cliente: { nombre: string; correo: string };
  conductorNombre: string | null;
  zona: string;
}

export interface FiltroEnviosAdmin {
  estado?: EstadoEnvio;
  idZona?: number;
  texto?: string;
  pagina: number;
  tamano: number;
}

export const ASUNTOS_CONTACTO = ['General', 'Empresas', 'Conductores', 'Soporte'] as const;
export type AsuntoContacto = (typeof ASUNTOS_CONTACTO)[number];

export interface MensajeContacto {
  nombre: string;
  correo: string;
  telefono?: string;
  asunto: AsuntoContacto;
  mensaje: string;
}

export interface MensajeContactoRecibido extends MensajeContacto {
  id: number;
  atendido: boolean;
  fecha: Date;
}

export interface EstadisticasPublicas {
  enviosEntregados: number;
  conductoresActivos: number;
  zonasCubiertas: number;
  calificacionPromedio: number;
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
  cancelados: number;
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
