import { Observable } from 'rxjs';
import {
  CategoriaVehiculo,
  ConductorPostulante,
  Cotizacion,
  Envio,
  EnvioAdmin,
  EstadisticasPublicas,
  EventoCarga,
  FiltroAuditoria,
  FiltroEnviosAdmin,
  MensajeContacto,
  MensajeContactoRecibido,
  Notificacion,
  PerfilUsuario,
  ResumenConductor,
  Seguimiento,
  MetricasAdmin,
  Pagina,
  PerfilConductor,
  RegistroAuditoria,
  RegistroUsuario,
  SolicitudCotizacion,
  TipoDocumento,
  Ubicacion,
  Usuario,
  Vehiculo,
  Zona,
} from '../domain';
import { NivelLog } from '../../../environments/environment.model';

/*
 * Puertos: una clase abstracta por capacidad, usada como token de inyección.
 * Las pantallas y servicios solo dependen de estos contratos; los adaptadores HTTP
 * se registran en core/config/ports.providers.ts (en las pruebas se reemplazan por dobles).
 */

export abstract class AuthPort {
  abstract registrar(
    datos: RegistroUsuario,
  ): Promise<{ id: number; correo: string; nombre: string }>;
  abstract iniciarSesion(
    correo: string,
    password: string,
  ): Promise<{ usuario: Usuario; token: string }>;
}

export abstract class ZonesPort {
  abstract listar(): Promise<Zona[]>;
}

export abstract class QuotePort {
  abstract cotizar(solicitud: SolicitudCotizacion): Promise<Cotizacion>;
}

export interface NuevoEnvio extends SolicitudCotizacion {
  tipoCarga: string;
  /** Vehículo requerido; si se omite, cualquier conductor puede tomarlo. */
  categoria?: CategoriaVehiculo;
  /** Indicaciones para el conductor (máximo 300 caracteres). */
  notas?: string;
}

/** Envíos vistos por el cliente dueño (incluye el PIN). */
export abstract class ShipmentsPort {
  abstract crear(envio: NuevoEnvio): Promise<Envio>;
  abstract obtener(id: number): Promise<Envio>;
  /** Solo mientras está Pendiente. */
  abstract cancelar(id: number, motivo?: string): Promise<Envio>;
}

/** Mapa en tiempo real: recorrido, señal en vivo y tiempo estimado de llegada. */
export abstract class TrackingPort {
  abstract seguimiento(idEnvio: number): Promise<Seguimiento>;
}

/** Historial de envíos del cliente autenticado. */
export abstract class ClientShipmentsPort {
  abstract listar(): Promise<Envio[]>;
}

/** Perfil del conductor autenticado. */
export abstract class DriverProfilePort {
  abstract obtener(): Promise<PerfilConductor>;
}

export abstract class VehiclesPort {
  abstract registrar(datos: { placa: string; categoria: CategoriaVehiculo }): Promise<Vehiculo>;
}

export abstract class DocumentsPort {
  abstract subir(archivo: File, tipo: TipoDocumento): Observable<EventoCarga>;
}

/** Tablero de envíos disponibles para el conductor. */
export abstract class DriverBoardPort {
  abstract disponibles(): Promise<Envio[]>;
}

/** Operaciones del conductor sobre un servicio. La vista nunca incluye el PIN. */
export abstract class DriverServicePort {
  abstract aceptar(idEnvio: number): Promise<Envio>;
  abstract obtener(idEnvio: number): Promise<Envio>;
  /** Servicio en curso del conductor (RN_OP_002: como máximo uno). */
  abstract activo(): Promise<Envio | null>;
  /** Asignado → En Ruta. */
  abstract iniciarRuta(idEnvio: number): Promise<Envio>;
}

export abstract class DeliveryPort {
  abstract validar(
    idEnvio: number,
    urlFoto: string,
    pin: string,
  ): Promise<{ id: number; estado: 'Entregado'; urlFoto: string }>;
}

/** Subida de la foto de entrega; devuelve su URL. */
export abstract class EvidenceStoragePort {
  abstract subir(idEnvio: number, foto: File): Promise<string>;
}

export abstract class RatingPort {
  abstract calificar(
    idEnvio: number,
    puntuacion: number,
    comentario?: string,
  ): Promise<{ id: number; calificacion: number }>;
}

/** Resumen y servicios terminados del conductor. */
export abstract class DriverStatsPort {
  abstract resumen(): Promise<ResumenConductor>;
  abstract historial(): Promise<Envio[]>;
}

/** Avisos dentro de la aplicación. */
export abstract class NotificationsPort {
  abstract listar(soloNoLeidas?: boolean): Promise<{ noLeidas: number; items: Notificacion[] }>;
  abstract noLeidas(): Promise<number>;
  abstract leer(id: number): Promise<void>;
  abstract leerTodas(): Promise<void>;
}

/** Perfil y contraseña del usuario autenticado. */
export abstract class AccountPort {
  abstract perfil(): Promise<PerfilUsuario>;
  abstract actualizar(datos: { nombre: string; telefono: string }): Promise<PerfilUsuario>;
  abstract cambiarPassword(actual: string, nueva: string): Promise<void>;
}

/** Datos del sitio público (sin sesión). */
export abstract class PublicSitePort {
  abstract estadisticas(): Promise<EstadisticasPublicas>;
  abstract zonas(): Promise<Zona[]>;
  abstract contactar(mensaje: MensajeContacto): Promise<void>;
}

/** Operación del administrador: envíos, tarifas y mensajes de contacto. */
export abstract class AdminOperationsPort {
  abstract envios(filtro: FiltroEnviosAdmin): Promise<Pagina<EnvioAdmin>>;
  abstract cancelar(idEnvio: number, motivo: string): Promise<Envio>;
  abstract actualizarTarifa(idZona: number, tarifaBase: number): Promise<Zona>;
  abstract mensajes(pendientes: boolean, pagina: number): Promise<Pagina<MensajeContactoRecibido>>;
  abstract atenderMensaje(id: number): Promise<void>;
}

/** Conductores pendientes o rechazados. */
export abstract class DriverApplicantsPort {
  abstract listarPendientes(): Promise<ConductorPostulante[]>;
}

export abstract class ApprovalPort {
  /** Al rechazar, el motivo es obligatorio. */
  abstract decidir(
    idConductor: number,
    aprobado: boolean,
    motivo?: string,
  ): Promise<ConductorPostulante>;
}

/** Ubicación en tiempo real. */
export abstract class LocationTransportPort {
  abstract enviar(idEnvio: number, ubicacion: Ubicacion): Promise<void>;
  abstract ultima(idEnvio: number): Promise<Ubicacion | null>;
}

/** Métricas y auditoría del panel administrativo. */
export abstract class AdminMetricsPort {
  abstract metricas(): Promise<MetricasAdmin>;
  abstract auditoria(filtro: FiltroAuditoria): Promise<Pagina<RegistroAuditoria>>;
}

export interface EventoLog {
  nivel: NivelLog;
  mensaje: string;
  contexto: string;
  fecha: string;
  url?: string;
  sesion?: string;
  usuario?: number;
  meta?: unknown;
}

/** Envía lotes de logs a POST /api/logs/frontend. */
export abstract class LogTransportPort {
  abstract enviar(eventos: EventoLog[]): Promise<void>;
  /** Envío "de último momento" al cerrar la pestaña. Devuelve false si no se pudo encolar. */
  abstract enviarAlSalir(eventos: EventoLog[]): boolean;
}

/** Abstracción de localStorage para la sesión (permite probar sin navegador). */
export abstract class SessionStoragePort {
  abstract leer(clave: string): string | null;
  abstract guardar(clave: string, valor: string): void;
  abstract borrar(clave: string): void;
}

/** Abstracción de LocalForage (almacenamiento asíncrono clave-valor). */
export abstract class KeyValueStorePort {
  abstract get<T>(clave: string): Promise<T | null>;
  abstract set<T>(clave: string, valor: T): Promise<void>;
  abstract remove(clave: string): Promise<void>;
}

/** Abstracción de logging para el resto de la app. */
export abstract class LoggerPort {
  abstract debug(contexto: string, mensaje: string, meta?: unknown): void;
  abstract info(contexto: string, mensaje: string, meta?: unknown): void;
  abstract warn(contexto: string, mensaje: string, meta?: unknown): void;
  abstract error(contexto: string, mensaje: string, meta?: unknown): void;
}
