import { Envio, EstadoEnvio } from './models';

const TRANSICIONES: Record<EstadoEnvio, readonly EstadoEnvio[]> = {
  Pendiente: ['Asignado', 'Cancelado'],
  Asignado: ['En Ruta', 'Cancelado'],
  'En Ruta': ['Entregado', 'Cancelado'],
  Entregado: [],
  Cancelado: [],
};

/** Transición permitida entre estados: Pendiente → Asignado → En Ruta → Entregado. */
export function esTransicionValida(desde: EstadoEnvio, hacia: EstadoEnvio): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

export function esActivo(estado: EstadoEnvio): boolean {
  return estado !== 'Entregado' && estado !== 'Cancelado';
}

export function esFinal(estado: EstadoEnvio): boolean {
  return !esActivo(estado);
}

/** El cliente puede cancelar mientras ningún conductor ha tomado el envío. */
export function puedeCancelarCliente(envio: Pick<Envio, 'estado'>): boolean {
  return envio.estado === 'Pendiente';
}

/** El administrador puede cancelar cualquier envío que no haya terminado. */
export function puedeCancelarAdmin(envio: Pick<Envio, 'estado'>): boolean {
  return esActivo(envio.estado);
}

/** "Hace 3 min", "hace 2 h", "hace 4 días": tiempo transcurrido corto. */
export function haceCuanto(fecha: Date, ahora = new Date()): string {
  const s = Math.max(0, Math.round((ahora.getTime() - fecha.getTime()) / 1000));
  if (s < 45) return 'hace un momento';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}

/** "25 min", "1 h 10 min". */
export function formatoDuracion(minutos: number): string {
  const m = Math.max(1, Math.round(minutos));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}

/** El cliente califica una sola vez, cuando el envío ya fue entregado. */
export function puedeCalificar(envio: Pick<Envio, 'estado'>, yaCalificado: boolean): boolean {
  return envio.estado === 'Entregado' && !yaCalificado;
}

/** CU-009: la entrega se valida con el envío En Ruta. */
export function puedeEntregar(envio: Pick<Envio, 'estado'>): boolean {
  return envio.estado === 'En Ruta';
}

export function puedeIniciarRuta(envio: Pick<Envio, 'estado'>): boolean {
  return envio.estado === 'Asignado';
}

/** La ubicación se comparte mientras el servicio está activo para el conductor. */
export function puedeCompartirUbicacion(envio: Pick<Envio, 'estado'>): boolean {
  return envio.estado === 'Asignado' || envio.estado === 'En Ruta';
}

/** Ordena de más reciente a más antiguo por la última fecha conocida. */
export function ordenarRecientes<T extends Pick<Envio, 'id' | 'fechaUltimoCambio' | 'historial'>>(
  envios: T[],
): T[] {
  const fecha = (e: T) =>
    e.fechaUltimoCambio?.getTime() ?? e.historial.at(-1)?.fecha.getTime() ?? 0;
  return [...envios].sort((a, b) => fecha(b) - fecha(a) || b.id - a.id);
}

/** Fecha de creación: la que informa el backend o, si no, el primer cambio de estado. */
export function fechaCreacion(envio: Pick<Envio, 'historial' | 'fechaCreacion'>): Date | undefined {
  return envio.fechaCreacion ?? envio.historial[0]?.fecha;
}
