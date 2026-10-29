import {
  CATEGORIAS_VEHICULO,
  CategoriaVehiculo,
  ConductorPostulante,
  ESTADOS_ENVIO,
  Envio,
  EstadoAprobacion,
  EstadoEnvio,
  Rol,
  TIPOS_DOCUMENTO,
  TipoDocumento,
  Usuario,
} from '../../domain';
import { ApiConductor, ApiEnvio, ApiUsuarioLogin } from './backend.types';

export function aEstado(valor: string): EstadoEnvio {
  return (ESTADOS_ENVIO as readonly string[]).includes(valor)
    ? (valor as EstadoEnvio)
    : 'Pendiente';
}

export function aRol(valor: string | number): Rol {
  const r = String(valor);
  return r === '1' || r === '3' ? r : '2';
}

export function aEstadoAprobacion(valor: string): EstadoAprobacion {
  return valor === 'Aprobado' || valor === 'Rechazado' ? valor : 'Pendiente';
}

export function aUsuario(u: ApiUsuarioLogin): Usuario {
  return { id: u.id, nombre: u.nombre, correo: u.correo, rol: aRol(u.rol) };
}

export function aCategoria(v: string | null | undefined): CategoriaVehiculo | undefined {
  return v && (CATEGORIAS_VEHICULO as readonly string[]).includes(v)
    ? (v as CategoriaVehiculo)
    : undefined;
}

function aTipoDocumento(v: string): TipoDocumento {
  return (TIPOS_DOCUMENTO as readonly string[]).includes(v) ? (v as TipoDocumento) : 'Cédula';
}

/**
 * Convierte un envío del backend al dominio. historial_estado llega del más reciente
 * al más antiguo; en el dominio queda en orden cronológico.
 * Con incluirPin = false (vista del conductor) el PIN se descarta siempre.
 */
export function aEnvio(e: ApiEnvio, incluirPin: boolean): Envio {
  const historial = (e.historial_estado ?? [])
    .map((h) => ({ estado: aEstado(h.estado), fecha: new Date(h.fecha) }))
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  const envio: Envio = {
    id: e.id_envio,
    origen: e.origen,
    destino: e.destino,
    tipoCarga: e.tipo_carga,
    tarifa: Number(e.tarifa),
    estado: aEstado(e.estado),
    idCliente: e.id_cliente,
    idConductor: e.id_conductor ?? null,
    idZona: e.id_zona,
    categoria: aCategoria(e.categoria) ?? null,
    historial,
  };
  if (e.fecha_creacion) envio.fechaCreacion = new Date(e.fecha_creacion);
  if (e.fecha_ultimo_cambio) envio.fechaUltimoCambio = new Date(e.fecha_ultimo_cambio);
  if (incluirPin && e.pin_seguridad) envio.pin = e.pin_seguridad;
  if (e.calificado !== undefined) envio.calificado = e.calificado;
  if (e.conductor) {
    envio.conductor = {
      nombre: e.conductor.nombre,
      vehiculo: aCategoria(e.conductor.vehiculo),
      placa: e.conductor.placa ?? undefined,
      calificacionPromedio: e.conductor.calificacion_promedio ?? undefined,
    };
  }
  return envio;
}

export function aPostulante(c: ApiConductor): ConductorPostulante {
  return {
    idConductor: c.id_conductor,
    nombre: c.nombre,
    correo: c.correo,
    estadoAprobacion: aEstadoAprobacion(c.estado_aprobacion),
    motivoRechazo: c.motivo_rechazo ?? null,
    documentos: (c.documentos ?? []).map((d) => ({
      tipo: aTipoDocumento(d.tipo_documento),
      urlArchivo: d.url_archivo,
    })),
  };
}
