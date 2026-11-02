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

/** Sugerencias rápidas para origen y destino (además del buscador del mapa). */
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

/** Zona de cobertura: círculo en el mapa con un recargo fijo. */
export interface Zona {
  id: number;
  nombre: string;
  /** Recargo de la zona en COP (antes "tarifa base"). */
  tarifaBase: number;
  centro?: Coordenadas | null;
  radioKm?: number;
  activa?: boolean;
  descripcion?: string | null;
}

export type DatosZona = Pick<
  Zona,
  'nombre' | 'tarifaBase' | 'centro' | 'radioKm' | 'descripcion'
> & {
  activa?: boolean;
};

/** Precio de un vehículo: banderazo + km × porKm + minutos × porMinuto, nunca menos del mínimo. */
export interface TarifaVehiculo {
  categoria: CategoriaVehiculo;
  banderazo: number;
  porKm: number;
  porMinuto: number;
  minimo: number;
}

export interface TarifasPublicas {
  tarifas: TarifaVehiculo[];
  /** Fracción, p. ej. 0,2 = 20 %. */
  recargoNocturno: number;
  horarioNocturno: string;
}

/** Partidas del precio de un envío, en COP. */
export interface DesgloseTarifa {
  categoria: CategoriaVehiculo;
  banderazo: number;
  distancia: number;
  tiempo: number;
  recargoZona: number;
  recargoNocturno: number;
  minimoAplicado: boolean;
  total: number;
}

export interface OpcionVehiculo {
  categoria: CategoriaVehiculo;
  tarifaTotal: number;
  minimoAplicado: boolean;
}

/** Resultado del buscador de direcciones (OpenStreetMap). */
export interface SugerenciaDireccion {
  nombre: string;
  detalle: string;
  coords: Coordenadas;
}

export interface SolicitudCotizacion {
  origen: string;
  destino: string;
  /** Solo hace falta si el destino no tiene coordenadas. */
  idZona?: number | null;
  categoria?: CategoriaVehiculo;
  origenCoords?: Coordenadas | null;
  destinoCoords?: Coordenadas | null;
}

export interface Cotizacion {
  distanciaKm: number;
  /** Recargo de zona aplicado. */
  tarifaBase: number;
  tarifaTotal: number;
  moneda: 'COP';
  /** Tiempo estimado del trayecto, en minutos. */
  duracionMin?: number;
  /** false si alguna dirección no se encontró y la distancia es aproximada. */
  distanciaExacta?: boolean;
  categoria?: CategoriaVehiculo;
  zona?: { id: number; nombre: string };
  zonaOrigen?: { id: number; nombre: string } | null;
  desglose?: DesgloseTarifa;
  /** Precio del mismo viaje con cada vehículo. */
  opciones?: OpcionVehiculo[];
  nocturno?: boolean;
  origenCoords?: Coordenadas | null;
  destinoCoords?: Coordenadas | null;
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
  duracionMin?: number | null;
  desglose?: DesgloseTarifa | null;
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
  'nuevo_servicio',
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
