/** Formas exactas del JSON del backend (sección 3 / Apéndice A del prompt maestro). */

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
  ultimo_cambio_estado?: string;
  fecha_ultimo_cambio?: string;
  historial_estado?: ApiCambioEstado[];
  conductor?: {
    nombre: string;
    telefono?: string;
    vehiculo?: string;
    placa?: string;
    calificacion_promedio?: number;
  };
}

export interface ApiConductor {
  id_conductor: number;
  nombre: string;
  correo: string;
  estado_aprobacion: string;
  documentos?: { tipo_documento: string; url_archivo: string }[];
}
