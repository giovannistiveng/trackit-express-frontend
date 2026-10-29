import {
  ASUNTOS_CONTACTO,
  AsuntoContacto,
  CATEGORIAS_VEHICULO,
  CategoriaVehiculo,
  ConductorPostulante,
  ESTADOS_ENVIO,
  Envio,
  EstadoAprobacion,
  EstadoEnvio,
  Rol,
  EnvioAdmin,
  MensajeContactoRecibido,
  Notificacion,
  PerfilUsuario,
  Seguimiento,
  TIPOS_DOCUMENTO,
  TIPOS_NOTIFICACION,
  TipoDocumento,
  TipoNotificacion,
  Ubicacion,
  Usuario,
} from '../../domain';
import {
  ApiConductor,
  ApiContacto,
  ApiEnvio,
  ApiEnvioAdmin,
  ApiNotificacion,
  ApiPerfil,
  ApiPunto,
  ApiSeguimiento,
  ApiUsuarioLogin,
} from './backend.types';

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
  if (e.calificacion !== undefined) envio.calificacion = e.calificacion;
  if (e.comentario) envio.comentario = e.comentario;
  if (e.distancia_km !== undefined && e.distancia_km !== null)
    envio.distanciaKm = Number(e.distancia_km);
  if (e.notas) envio.notas = e.notas;
  if (e.motivo_cancelacion) envio.motivoCancelacion = e.motivo_cancelacion;
  if (e.origen_coords) envio.origenCoords = e.origen_coords;
  if (e.destino_coords) envio.destinoCoords = e.destino_coords;
  if (e.ganancia_conductor !== undefined) envio.gananciaConductor = Number(e.ganancia_conductor);
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

export function aUbicacion(p: ApiPunto): Ubicacion {
  return { lat: p.lat, lon: p.lon, capturadoEn: p.capturado_en };
}

export function aSeguimiento(s: ApiSeguimiento): Seguimiento {
  return {
    idEnvio: s.id_envio,
    estado: aEstado(s.estado),
    origen: s.origen,
    destino: s.destino,
    ultima: s.ultima_ubicacion ? aUbicacion(s.ultima_ubicacion) : null,
    recorrido: s.recorrido.map(aUbicacion),
    enVivo: s.en_vivo,
    distanciaRestanteKm: s.distancia_restante_km,
    etaMinutos: s.eta_minutos,
  };
}

export function aNotificacion(n: ApiNotificacion): Notificacion {
  const tipo = (TIPOS_NOTIFICACION as readonly string[]).includes(n.tipo)
    ? (n.tipo as TipoNotificacion)
    : 'envio_aceptado';
  return {
    id: n.id,
    tipo,
    titulo: n.titulo,
    mensaje: n.mensaje,
    idEnvio: n.id_envio,
    leida: n.leida,
    fecha: new Date(n.fecha),
  };
}

export function aPerfil(p: ApiPerfil): PerfilUsuario {
  return {
    id: p.id,
    nombre: p.nombre,
    correo: p.correo,
    rol: aRol(p.rol),
    nombreRol: p.nombre_rol,
    telefono: p.telefono,
    fechaRegistro: p.fecha_registro ? new Date(p.fecha_registro) : null,
  };
}

export function aEnvioAdmin(e: ApiEnvioAdmin): EnvioAdmin {
  return {
    ...aEnvio(e, false),
    cliente: e.cliente,
    conductorNombre: e.conductor_nombre,
    zona: e.zona,
  };
}

export function aContacto(c: ApiContacto): MensajeContactoRecibido {
  const asunto = (ASUNTOS_CONTACTO as readonly string[]).includes(c.asunto)
    ? (c.asunto as AsuntoContacto)
    : 'General';
  return {
    id: c.id,
    nombre: c.nombre,
    correo: c.correo,
    telefono: c.telefono ?? undefined,
    asunto,
    mensaje: c.mensaje,
    atendido: c.atendido,
    fecha: new Date(c.fecha),
  };
}
