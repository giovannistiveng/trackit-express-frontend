import {
  ASUNTOS_CONTACTO,
  AsuntoContacto,
  CATEGORIAS_VEHICULO,
  CategoriaVehiculo,
  ConductorPostulante,
  Cotizacion,
  DesgloseTarifa,
  EstadoPago,
  Liquidacion,
  MensajeChat,
  PagoResumen,
  Parada,
  SeguimientoPublico,
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
  TarifaVehiculo,
  TipoDocumento,
  TipoNotificacion,
  Ubicacion,
  Usuario,
  Zona,
} from '../../domain';
import {
  ApiConductor,
  ApiContacto,
  ApiCotizacion,
  ApiDesglose,
  ApiEnvio,
  ApiEnvioAdmin,
  ApiLiquidacion,
  ApiMensaje,
  ApiPago,
  ApiParada,
  ApiSeguimientoPublico,
  ApiNotificacion,
  ApiPerfil,
  ApiPunto,
  ApiSeguimiento,
  ApiTarifaVehiculo,
  ApiUsuarioLogin,
  ApiZona,
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
  const usuario: Usuario = { id: u.id, nombre: u.nombre, correo: u.correo, rol: aRol(u.rol) };
  if (u.correo_verificado !== undefined) usuario.correoVerificado = u.correo_verificado;
  return usuario;
}

export function aCategoria(v: string | null | undefined): CategoriaVehiculo | undefined {
  return v && (CATEGORIAS_VEHICULO as readonly string[]).includes(v)
    ? (v as CategoriaVehiculo)
    : undefined;
}

function aTipoDocumento(v: string): TipoDocumento {
  return (TIPOS_DOCUMENTO as readonly string[]).includes(v) ? (v as TipoDocumento) : 'Cédula';
}

// Los campos opcionales del envío solo se copian cuando el backend los envía.

function copiarFechas(e: ApiEnvio, envio: Envio): void {
  if (e.fecha_creacion) envio.fechaCreacion = new Date(e.fecha_creacion);
  if (e.fecha_ultimo_cambio) envio.fechaUltimoCambio = new Date(e.fecha_ultimo_cambio);
  if (e.fecha_programada) envio.fechaProgramada = new Date(e.fecha_programada);
  if (e.destino_visitado_en) envio.destinoVisitadoEn = new Date(e.destino_visitado_en);
  if (e.fecha_recogida) envio.fechaRecogida = new Date(e.fecha_recogida);
}

function copiarCalificacion(e: ApiEnvio, envio: Envio): void {
  if (e.calificado !== undefined) envio.calificado = e.calificado;
  if (e.calificacion !== undefined) envio.calificacion = e.calificacion;
  if (e.comentario) envio.comentario = e.comentario;
}

function copiarServicio(e: ApiEnvio, envio: Envio): void {
  if (e.distancia_km !== undefined && e.distancia_km !== null)
    envio.distanciaKm = Number(e.distancia_km);
  if (e.duracion_min) envio.duracionMin = e.duracion_min;
  if (e.notas) envio.notas = e.notas;
  if (e.motivo_cancelacion) envio.motivoCancelacion = e.motivo_cancelacion;
  if (e.origen_coords) envio.origenCoords = e.origen_coords;
  if (e.destino_coords) envio.destinoCoords = e.destino_coords;
  if (e.desglose) envio.desglose = aDesglose(e.desglose);
  if (e.ida_y_vuelta) envio.idaYVuelta = true;
  if (e.url_foto_recogida) envio.urlFotoRecogida = e.url_foto_recogida;
  if (e.paradas) envio.paradas = e.paradas.map(aParada);
  if (e.chat_no_leidos !== undefined) envio.chatNoLeidos = e.chat_no_leidos;
}

function copiarPagoYDestinatario(e: ApiEnvio, envio: Envio, incluirPin: boolean): void {
  if (incluirPin && e.pin_seguridad) envio.pin = e.pin_seguridad;
  if (e.ganancia_conductor !== undefined) envio.gananciaConductor = Number(e.ganancia_conductor);
  if (e.metodo_pago) envio.metodoPago = e.metodo_pago === 'nequi' ? 'nequi' : 'efectivo';
  if (e.pago !== undefined) envio.pago = e.pago ? aPago(e.pago) : null;
  if (e.token_seguimiento) envio.tokenSeguimiento = e.token_seguimiento;
  if (e.destinatario_nombre !== undefined) envio.destinatarioNombre = e.destinatario_nombre;
  if (e.destinatario_telefono !== undefined) envio.destinatarioTelefono = e.destinatario_telefono;
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
  copiarFechas(e, envio);
  copiarCalificacion(e, envio);
  copiarServicio(e, envio);
  copiarPagoYDestinatario(e, envio, incluirPin);
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
    correoVerificado: p.correo_verificado !== false,
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

export function aZona(z: ApiZona): Zona {
  const zona: Zona = {
    id: z.id_zona,
    nombre: z.nombre_zona,
    tarifaBase: Number(z.recargo ?? z.tarifa_base),
  };
  if (z.centro !== undefined) zona.centro = z.centro;
  if (z.radio_km !== undefined) zona.radioKm = Number(z.radio_km);
  if (z.activa !== undefined) zona.activa = z.activa;
  if (z.descripcion !== undefined) zona.descripcion = z.descripcion;
  return zona;
}

export function aDesglose(d: ApiDesglose): DesgloseTarifa {
  return {
    categoria: aCategoria(d.categoria) ?? 'Moto Express',
    banderazo: Number(d.banderazo),
    distancia: Number(d.distancia),
    tiempo: Number(d.tiempo),
    recargoZona: Number(d.recargo_zona),
    paradas: Number(d.paradas ?? 0),
    recargoParadas: Number(d.recargo_paradas ?? 0),
    idaYVuelta: !!d.ida_y_vuelta,
    recargoNocturno: Number(d.recargo_nocturno),
    minimoAplicado: !!d.minimo_aplicado,
    total: Number(d.total),
  };
}

export function aTarifaVehiculo(t: ApiTarifaVehiculo): TarifaVehiculo {
  return {
    categoria: aCategoria(t.categoria) ?? 'Moto Express',
    banderazo: Number(t.banderazo),
    porKm: Number(t.por_km),
    porMinuto: Number(t.por_minuto),
    minimo: Number(t.minimo),
  };
}

export function aCotizacion(r: ApiCotizacion): Cotizacion {
  const c: Cotizacion = {
    distanciaKm: Number(r.distancia_km),
    tarifaBase: Number(r.tarifa_base),
    tarifaTotal: Number(r.tarifa_total),
    moneda: 'COP',
  };
  if (r.duracion_estimada_min !== undefined) c.duracionMin = r.duracion_estimada_min;
  if (r.distancia_exacta !== undefined) c.distanciaExacta = r.distancia_exacta;
  const cat = aCategoria(r.categoria);
  if (cat) c.categoria = cat;
  if (r.zona) c.zona = { id: r.zona.id_zona, nombre: r.zona.nombre_zona };
  if (r.zona_origen !== undefined) {
    c.zonaOrigen = r.zona_origen
      ? { id: r.zona_origen.id_zona, nombre: r.zona_origen.nombre_zona }
      : null;
  }
  if (r.desglose) c.desglose = aDesglose(r.desglose);
  if (r.opciones) {
    c.opciones = r.opciones.flatMap((o) => {
      const categoria = aCategoria(o.categoria);
      return categoria
        ? [{ categoria, tarifaTotal: Number(o.tarifa_total), minimoAplicado: !!o.minimo_aplicado }]
        : [];
    });
  }
  if (r.recargo_nocturno_activo !== undefined) c.nocturno = r.recargo_nocturno_activo;
  if (r.origen_coords !== undefined) c.origenCoords = r.origen_coords;
  if (r.destino_coords !== undefined) c.destinoCoords = r.destino_coords;
  return c;
}

const ESTADOS_PAGO: EstadoPago[] = [
  'pendiente',
  'aprobado',
  'rechazado',
  'expirado',
  'por_cobrar',
  'cobrado',
  'anulado',
  'reembolso_pendiente',
  'reembolsado',
];

export function aPago(p: ApiPago): PagoResumen {
  return {
    metodo: p.metodo === 'nequi' ? 'nequi' : 'efectivo',
    estado: (ESTADOS_PAGO as string[]).includes(p.estado) ? (p.estado as EstadoPago) : 'pendiente',
    monto: Number(p.monto),
    telefono: p.telefono,
    mensaje: p.mensaje,
    actualizado: p.actualizado ? new Date(p.actualizado) : null,
  };
}

export function aParada(p: ApiParada): Parada {
  return {
    id: p.id_parada ?? p.orden,
    orden: p.orden,
    direccion: p.direccion,
    coords: p.coords,
    notas: p.notas ?? null,
    completadaEn: p.completada_en ? new Date(p.completada_en) : null,
  };
}

export function aMensaje(m: ApiMensaje): MensajeChat {
  return {
    id: m.id,
    texto: m.texto,
    autor: m.autor,
    mio: m.mio,
    leido: m.leido,
    fecha: new Date(m.fecha),
  };
}

export function aLiquidacion(l: ApiLiquidacion): Liquidacion {
  return {
    id: l.id_liquidacion,
    conductor: l.conductor_nombre ?? null,
    desde: l.desde,
    hasta: l.hasta,
    servicios: l.servicios,
    totalTarifas: Number(l.total_tarifas),
    gananciaConductor: Number(l.ganancia_conductor),
    cobradoEfectivo: Number(l.cobrado_efectivo),
    comisionEfectivo: Number(l.comision_efectivo),
    saldo: Number(l.saldo),
    estado: l.estado,
    referencia: l.referencia,
    pagadaEn: l.pagada_en ? new Date(l.pagada_en) : null,
  };
}

export function aSeguimientoPublico(s: ApiSeguimientoPublico): SeguimientoPublico {
  return {
    codigo: s.codigo,
    estado: aEstado(s.estado),
    origen: s.origen,
    destino: s.destino,
    destinatario: s.destinatario,
    fechaProgramada: s.fecha_programada ? new Date(s.fecha_programada) : null,
    idaYVuelta: s.ida_y_vuelta,
    historial: s.historial
      .map((h) => ({ estado: aEstado(h.estado), fecha: new Date(h.fecha) }))
      .sort((a, b) => a.fecha.getTime() - b.fecha.getTime()),
    conductor: s.conductor,
    paradas: s.paradas,
    mapa: s.mapa ? aSeguimiento(s.mapa) : null,
  };
}
