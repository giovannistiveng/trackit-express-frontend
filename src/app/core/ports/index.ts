import { Observable } from 'rxjs';
import {
  CategoriaVehiculo,
  ConductorPostulante,
  Cotizacion,
  Envio,
  EventoCarga,
  FiltroAuditoria,
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
 * Las pantallas y servicios solo dependen de estos contratos; el adaptador concreto
 * (HTTP, simulado o local) se decide en core/config/ports.providers.ts según los flags.
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
  idCliente: number;
}

/** Envíos vistos por el cliente dueño (incluye el PIN). */
export abstract class ShipmentsPort {
  abstract crear(envio: NuevoEnvio): Promise<Envio>;
  abstract obtener(id: number): Promise<Envio>;
}

/** Historial de envíos del cliente (brecha 3). */
export abstract class ClientShipmentsPort {
  abstract listar(idCliente: number): Promise<Envio[]>;
  /** Registra un envío recién creado (lo usa el adaptador local). */
  abstract recordar(idCliente: number, idEnvio: number): Promise<void>;
}

/** Perfil del conductor autenticado (brecha 1). */
export abstract class DriverProfilePort {
  abstract obtener(usuario: Usuario): Promise<PerfilConductor>;
}

export abstract class VehiclesPort {
  abstract registrar(datos: {
    placa: string;
    categoria: CategoriaVehiculo;
    idConductor: number;
  }): Promise<Vehiculo>;
}

export abstract class DocumentsPort {
  abstract subir(archivo: File, tipo: TipoDocumento, idConductor: number): Observable<EventoCarga>;
}

/** Tablero de envíos disponibles (brecha 4). */
export abstract class DriverBoardPort {
  abstract disponibles(): Promise<Envio[]>;
}

/** Operaciones del conductor sobre un servicio. La vista nunca incluye el PIN. */
export abstract class DriverServicePort {
  abstract aceptar(idEnvio: number, idConductor: number): Promise<Envio>;
  abstract obtener(idEnvio: number): Promise<Envio>;
}

/** Iniciar ruta, Asignado → En Ruta (brecha 5). */
export abstract class RouteStartPort {
  abstract iniciar(idEnvio: number): Promise<Envio>;
}

export abstract class DeliveryPort {
  abstract validar(
    idEnvio: number,
    urlFoto: string,
    pin: string,
  ): Promise<{ id: number; estado: 'Entregado'; urlFoto: string }>;
}

/** Almacenamiento de la foto de entrega (brecha 7). */
export abstract class EvidenceStoragePort {
  abstract subir(idEnvio: number, foto: File): Promise<string>;
}

export abstract class RatingPort {
  abstract calificar(
    idEnvio: number,
    puntuacion: number,
  ): Promise<{ id: number; calificacion: number }>;
}

/** Lista de conductores por aprobar (brecha 6). */
export abstract class DriverApplicantsPort {
  abstract listarPendientes(): Promise<ConductorPostulante[]>;
}

export abstract class ApprovalPort {
  /** El motivo solo se envía si el flag motivoRechazo está activo (brecha 10). */
  abstract decidir(
    idConductor: number,
    aprobado: boolean,
    motivo?: string,
  ): Promise<ConductorPostulante>;
}

/** Ubicación en tiempo real (brecha 8). */
export abstract class LocationTransportPort {
  abstract enviar(idEnvio: number, ubicacion: Ubicacion): Promise<void>;
  abstract ultima(idEnvio: number): Promise<Ubicacion | null>;
}

/** Métricas y auditoría (brecha 11). */
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
