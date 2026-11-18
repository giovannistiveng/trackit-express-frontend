import type { CategoriaVehiculo, EstadoEnvio } from './models';

/** Tipos de servicio (los mismos del backend). */
export const TIPOS_SERVICIO = ['mandado', 'mercado', 'paquete', 'trasteo', 'insumos'] as const;
export type TipoServicio = (typeof TIPOS_SERVICIO)[number];

export interface InfoServicio {
  nombre: string;
  /** Una frase para la tarjeta del inicio. */
  descripcion: string;
  /** Nombre de ícono de ti-icono. */
  icono: 'bag' | 'basket' | 'package' | 'sofa' | 'tractor';
  vehiculoMinimo: CategoriaVehiculo;
  /** Quien entrega la carga en el origen le da un código al conductor. */
  pideCodigoRecogida: boolean;
  /** El conductor compra y cobra contra la factura. */
  conCompra: boolean;
}

export const SERVICIOS: Record<TipoServicio, InfoServicio> = {
  mandado: {
    nombre: 'Mandado',
    descripcion: 'Pagar un recibo, recoger algo o hacer una vuelta por ti',
    icono: 'bag',
    vehiculoMinimo: 'Moto Express',
    pideCodigoRecogida: false,
    conCompra: true,
  },
  mercado: {
    nombre: 'Mercado',
    descripcion: 'Tu lista de la tienda o la plaza, hasta tu puerta',
    icono: 'basket',
    vehiculoMinimo: 'Moto Express',
    pideCodigoRecogida: false,
    conCompra: true,
  },
  paquete: {
    nombre: 'Paquete',
    descripcion: 'Documentos, encomiendas y pedidos de tu negocio',
    icono: 'package',
    vehiculoMinimo: 'Moto Express',
    pideCodigoRecogida: true,
    conCompra: false,
  },
  trasteo: {
    nombre: 'Trasteo',
    descripcion: 'Muebles, electrodomésticos y cajas, con ayudantes si los necesitas',
    icono: 'sofa',
    vehiculoMinimo: 'Motocarro',
    pideCodigoRecogida: true,
    conCompra: false,
  },
  insumos: {
    nombre: 'Insumos del campo',
    descripcion: 'Abono, concentrado, semillas y cosecha entre el pueblo y la vereda',
    icono: 'tractor',
    vehiculoMinimo: 'Moto Express',
    pideCodigoRecogida: true,
    conCompra: false,
  },
};

export function esTipoServicio(v: unknown): v is TipoServicio {
  return (TIPOS_SERVICIO as readonly unknown[]).includes(v);
}

/** Datos propios de cada servicio (todos opcionales en el modelo; el backend exige los de cada tipo). */
export interface DetalleServicio {
  bultos?: number;
  pesoKg?: number;
  fragil?: boolean;
  contactoOrigenNombre?: string;
  contactoOrigenTelefono?: string;
  objetos?: string;
  pisosOrigen?: number;
  pisosDestino?: number;
  ascensorOrigen?: boolean;
  ascensorDestino?: boolean;
  ayudantes?: number;
  lista?: string;
  presupuesto?: number;
  insumo?: string;
  accesoDestapado?: boolean;
}

/** Valores de referencia (iguales al backend) para mostrar precios antes de cotizar. */
export const VALOR_AYUDANTE = 25000;
export const MAX_AYUDANTES = 3;
export const VALOR_PISO = 4000;
export const RECARGO_DESTAPADO = 0.15;
export const CAPACIDAD_KG: Record<CategoriaVehiculo, number> = {
  'Moto Express': 20,
  Motocarro: 300,
  Camioneta: 1000,
  Camión: 3500,
};

const ORDEN: CategoriaVehiculo[] = ['Moto Express', 'Motocarro', 'Camioneta', 'Camión'];

/** Vehículo más pequeño que puede hacer el servicio con ese peso. */
export function vehiculoMinimo(
  tipo: TipoServicio,
  detalle: DetalleServicio = {},
): CategoriaVehiculo {
  let minimo = SERVICIOS[tipo].vehiculoMinimo;
  if (detalle.pesoKg) {
    const porPeso = ORDEN.find((c) => CAPACIDAD_KG[c] >= (detalle.pesoKg as number)) ?? 'Camión';
    if (ORDEN.indexOf(porPeso) > ORDEN.indexOf(minimo)) minimo = porPeso;
  }
  return minimo;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** "piso 3 por escaleras", o null si es el primer piso. */
function textoPiso(piso?: number, ascensor?: boolean): string | null {
  if (!piso || piso <= 1) return null;
  const como = ascensor ? 'con ascensor' : 'por escaleras';
  return `piso ${piso} ${como}`;
}

function lineasTrasteo(d: DetalleServicio): string[] {
  const lineas: string[] = [];
  if (d.ayudantes) lineas.push(plural(d.ayudantes, 'ayudante', 'ayudantes'));
  const o = textoPiso(d.pisosOrigen, d.ascensorOrigen);
  const de = textoPiso(d.pisosDestino, d.ascensorDestino);
  if (o) lineas.push(`Recoge en ${o}`);
  if (de) lineas.push(`Entrega en ${de}`);
  return lineas;
}

/** Frases cortas que resumen el pedido para las tarjetas del conductor y del cliente. */
export function resumenDetalle(tipo: TipoServicio, d: DetalleServicio | null): string[] {
  if (!d) return [];
  const lineas = tipo === 'trasteo' ? lineasTrasteo(d) : [];
  if (tipo === 'insumos' && d.insumo) lineas.push(d.insumo);
  if (d.pesoKg) lineas.push(`${d.pesoKg} kg aprox.`);
  if (d.bultos) lineas.push(plural(d.bultos, 'bulto', 'bultos'));
  if (d.accesoDestapado) lineas.push('Vía destapada');
  if (d.fragil) lineas.push('Frágil');
  if (d.presupuesto) lineas.push(`Presupuesto $ ${d.presupuesto.toLocaleString('es-CO')}`);
  return lineas;
}

/** Paso del servicio que ven cliente y conductor por igual. */
export const ETAPAS = [
  'buscando_conductor',
  'yendo_a_recoger',
  'en_recogida',
  'en_camino',
  'regresando',
  'en_destino',
  'entregado',
  'cancelado',
] as const;
export type Etapa = (typeof ETAPAS)[number];

export function esEtapa(v: unknown): v is Etapa {
  return (ETAPAS as readonly unknown[]).includes(v);
}

/** Línea de tiempo visible (sin "regresando" ni "cancelado", que son variantes). */
export const PASOS_SERVICIO: Etapa[] = [
  'buscando_conductor',
  'yendo_a_recoger',
  'en_recogida',
  'en_camino',
  'en_destino',
  'entregado',
];

export interface TextoEtapa {
  titulo: string;
  /** Qué tiene que hacer o esperar quien mira. */
  cliente: string;
  conductor: string;
}

export const TEXTO_ETAPA: Record<Etapa, TextoEtapa> = {
  buscando_conductor: {
    titulo: 'Buscando conductor',
    cliente: 'Avisamos a los conductores cercanos con el vehículo adecuado.',
    conductor: 'Disponible para tomar.',
  },
  yendo_a_recoger: {
    titulo: 'Va a recoger',
    cliente: 'Tu conductor va hacia el punto de recogida.',
    conductor: 'Ve al punto de recogida y marca "Llegué" al llegar.',
  },
  en_recogida: {
    titulo: 'En el punto de recogida',
    cliente: 'Tu conductor llegó. Ten lista la carga.',
    conductor: 'Recibe la carga, cuenta los bultos y toma la foto.',
  },
  en_camino: {
    titulo: 'En camino',
    cliente: 'La carga va hacia el destino. Síguela en el mapa.',
    conductor: 'Lleva la carga al destino y marca "Llegué" al llegar.',
  },
  regresando: {
    titulo: 'De regreso',
    cliente: 'Pasó por el destino y vuelve al origen.',
    conductor: 'Regresa al punto de partida para cerrar el servicio.',
  },
  en_destino: {
    titulo: 'En el destino',
    cliente: 'Tu conductor llegó. Quien recibe debe darle el PIN de entrega.',
    conductor: 'Pide el PIN a quien recibe y toma la foto de la entrega.',
  },
  entregado: {
    titulo: 'Entregado',
    cliente: 'Listo. Cuéntanos cómo te fue.',
    conductor: 'Servicio terminado.',
  },
  cancelado: {
    titulo: 'Cancelado',
    cliente: 'Este servicio fue cancelado.',
    conductor: 'Este servicio fue cancelado.',
  },
};

/** Posición de la etapa en la línea de tiempo (regresando cuenta como en camino). */
export function indicePaso(etapa: Etapa): number {
  if (etapa === 'regresando') return PASOS_SERVICIO.indexOf('en_camino');
  return PASOS_SERVICIO.indexOf(etapa);
}

/** Etapa aproximada a partir del estado (si el backend no la envía). */
export function etapaPorEstado(estado: EstadoEnvio): Etapa {
  const etapas: Record<EstadoEnvio, Etapa> = {
    Pendiente: 'buscando_conductor',
    Asignado: 'yendo_a_recoger',
    'En Ruta': 'en_camino',
    Entregado: 'entregado',
    Cancelado: 'cancelado',
  };
  return etapas[estado];
}
