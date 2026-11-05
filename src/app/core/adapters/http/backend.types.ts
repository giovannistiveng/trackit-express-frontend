/** Formas exactas del JSON del backend (ver /api/docs). */

export interface ApiUsuarioLogin {
  id: number;
  nombre: string;
  correo: string;
  rol: string;
  correo_verificado?: boolean;
}

export interface ApiCambioEstado {
  estado: string;
  fecha: string;
}

export interface ApiEnvio {
  id_envio: number;
  origen: string;
  destino: string;
  tipo_carga: string;
  tarifa: number | string;
  pin_seguridad?: string;
  estado: string;
  id_cliente: number;
  id_conductor?: number | null;
  id_zona: number;
  categoria?: string | null;
  fecha_creacion?: string;
  ultimo_cambio_estado?: string;
  fecha_ultimo_cambio?: string;
  historial_estado?: ApiCambioEstado[];
  calificado?: boolean;
  calificacion?: number | null;
  comentario?: string | null;
  distancia_km?: number | null;
  notas?: string | null;
  motivo_cancelacion?: string | null;
  origen_coords?: { lat: number; lon: number } | null;
  destino_coords?: { lat: number; lon: number } | null;
  ganancia_conductor?: number;
  duracion_min?: number | null;
  desglose?: ApiDesglose | null;
  metodo_pago?: string;
  pago?: ApiPago | null;
  token_seguimiento?: string | null;
  destinatario_nombre?: string | null;
  destinatario_telefono?: string | null;
  fecha_programada?: string | null;
  ida_y_vuelta?: boolean;
  destino_visitado_en?: string | null;
  url_foto_recogida?: string | null;
  fecha_recogida?: string | null;
  paradas?: ApiParada[];
  chat_no_leidos?: number;
  conductor?: {
    nombre: string;
    vehiculo?: string | null;
    placa?: string | null;
    calificacion_promedio?: number | null;
  } | null;
}

export interface ApiConductor {
  id_conductor: number;
  nombre: string;
  correo: string;
  estado_aprobacion: string;
  motivo_rechazo?: string | null;
  documentos?: { tipo_documento: string; url_archivo: string }[];
}

export interface ApiPunto {
  lat: number;
  lon: number;
  capturado_en: string;
}

export interface ApiSeguimiento {
  id_envio: number;
  estado: string;
  origen: { direccion: string; coords: { lat: number; lon: number } | null };
  destino: { direccion: string; coords: { lat: number; lon: number } | null };
  ultima_ubicacion: ApiPunto | null;
  recorrido: ApiPunto[];
  en_vivo: boolean;
  distancia_restante_km: number | null;
  eta_minutos: number | null;
}

export interface ApiNotificacion {
  id: number;
  tipo: string;
  titulo: string;
  mensaje: string;
  id_envio: number | null;
  leida: boolean;
  fecha: string;
}

export interface ApiPerfil {
  id: number;
  nombre: string;
  correo: string;
  rol: string;
  nombre_rol: string;
  telefono: string | null;
  fecha_registro: string | null;
  correo_verificado?: boolean;
}

export interface ApiEnvioAdmin extends ApiEnvio {
  cliente: { nombre: string; correo: string };
  conductor_nombre: string | null;
  zona: string;
}

export interface ApiContacto {
  id: number;
  nombre: string;
  correo: string;
  telefono: string | null;
  asunto: string;
  mensaje: string;
  atendido: boolean;
  fecha: string;
}

export interface ApiZona {
  id_zona: number;
  nombre_zona: string;
  tarifa_base: number | string;
  recargo?: number | string;
  centro?: { lat: number; lon: number } | null;
  radio_km?: number | string;
  activa?: boolean;
  descripcion?: string | null;
}

export interface ApiDesglose {
  categoria: string;
  banderazo: number;
  distancia: number;
  tiempo: number;
  recargo_zona: number;
  paradas?: number;
  recargo_paradas?: number;
  ida_y_vuelta?: boolean;
  recargo_nocturno: number;
  minimo_aplicado: boolean;
  total: number;
}

export interface ApiPago {
  metodo: string;
  estado: string;
  monto: number | string;
  telefono: string | null;
  mensaje: string | null;
  actualizado: string | null;
}

export interface ApiParada {
  id_parada?: number;
  orden: number;
  direccion: string;
  coords: { lat: number; lon: number };
  notas?: string | null;
  completada_en: string | null;
}

export interface ApiMensaje {
  id: number;
  texto: string;
  autor: string | null;
  mio: boolean;
  leido: boolean;
  fecha: string;
}

export interface ApiLiquidacion {
  id_liquidacion: number;
  conductor_nombre?: string;
  desde: string;
  hasta: string;
  servicios: number;
  total_tarifas: number | string;
  ganancia_conductor: number | string;
  cobrado_efectivo: number | string;
  comision_efectivo: number | string;
  saldo: number | string;
  estado: 'pendiente' | 'pagada';
  referencia: string | null;
  pagada_en: string | null;
}

export interface ApiSeguimientoPublico {
  codigo: number;
  estado: string;
  origen: string;
  destino: string;
  destinatario: string | null;
  fecha_programada: string | null;
  ida_y_vuelta: boolean;
  historial: ApiCambioEstado[];
  conductor: { nombre: string; vehiculo: string | null; placa: string | null } | null;
  paradas: { orden: number; direccion: string; completada: boolean }[];
  mapa: ApiSeguimiento | null;
}

export interface ApiTarifaVehiculo {
  categoria: string;
  banderazo: number | string;
  por_km: number | string;
  por_minuto: number | string;
  minimo: number | string;
}

export interface ApiCotizacion {
  distancia_km: number;
  tarifa_base: number;
  tarifa_total: number;
  duracion_estimada_min?: number;
  distancia_exacta?: boolean;
  categoria?: string;
  zona?: { id_zona: number; nombre_zona: string };
  zona_origen?: { id_zona: number; nombre_zona: string } | null;
  desglose?: ApiDesglose;
  opciones?: { categoria: string; tarifa_total: number; minimo_aplicado: boolean }[];
  recargo_nocturno_activo?: boolean;
  origen_coords?: { lat: number; lon: number } | null;
  destino_coords?: { lat: number; lon: number } | null;
}
