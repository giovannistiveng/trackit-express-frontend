import { Envio, EstadoEnvio } from './models';

const TRANSICIONES: Record<EstadoEnvio, readonly EstadoEnvio[]> = {
  Pendiente: ['Asignado'],
  Asignado: ['En Ruta'],
  'En Ruta': ['Entregado'],
  Entregado: [],
};

/** Transición permitida entre estados: Pendiente → Asignado → En Ruta → Entregado. */
export function esTransicionValida(desde: EstadoEnvio, hacia: EstadoEnvio): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

export function esActivo(estado: EstadoEnvio): boolean {
  return estado !== 'Entregado';
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
