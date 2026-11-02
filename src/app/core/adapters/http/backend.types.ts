/** Formas exactas del JSON del backend (ver /api/docs). */

export interface ApiUsuarioLogin {
  id: number;
  nombre: string;
  correo: string;
  rol: string;
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
  recargo_nocturno: number;
  minimo_aplicado: boolean;
  total: number;
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
