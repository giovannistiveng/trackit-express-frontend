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
