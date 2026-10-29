import { Envio, EstadoEnvio } from './models';

const TRANSICIONES: Record<EstadoEnvio, readonly EstadoEnvio[]> = {
  Pendiente: ['Asignado'],
  Asignado: ['En Ruta', 'Entregado'],
  'En Ruta': ['Entregado'],
  Entregado: [],
};

/**
 * Transición permitida entre estados. Asignado → Entregado solo es válida
 * cuando el backend no expone "iniciar ruta" (flag iniciarRutaEndpoint apagado).
 */
export function esTransicionValida(
  desde: EstadoEnvio,
  hacia: EstadoEnvio,
  iniciarRutaDisponible = false,
): boolean {
  if (iniciarRutaDisponible && desde === 'Asignado' && hacia === 'Entregado') return false;
  return TRANSICIONES[desde].includes(hacia);
}

export function esActivo(estado: EstadoEnvio): boolean {
  return estado !== 'Entregado';
}

export function puedeCalificar(envio: Pick<Envio, 'estado'>, yaCalificado: boolean): boolean {
  return envio.estado === 'Entregado' && !yaCalificado;
}

export function puedeEntregar(
  envio: Pick<Envio, 'estado'>,
  iniciarRutaDisponible: boolean,
): boolean {
  return envio.estado === 'En Ruta' || (!iniciarRutaDisponible && envio.estado === 'Asignado');
}

export function puedeIniciarRuta(
  envio: Pick<Envio, 'estado'>,
  iniciarRutaDisponible: boolean,
): boolean {
  return iniciarRutaDisponible && envio.estado === 'Asignado';
}

export function puedeCompartirUbicacion(
  envio: Pick<Envio, 'estado'>,
  iniciarRutaDisponible: boolean,
): boolean {
  return envio.estado === 'En Ruta' || (!iniciarRutaDisponible && envio.estado === 'Asignado');
}

/** Ordena de más reciente a más antiguo por la última fecha conocida. */
export function ordenarRecientes<T extends Pick<Envio, 'id' | 'fechaUltimoCambio' | 'historial'>>(
  envios: T[],
): T[] {
  const fecha = (e: T) =>
    e.fechaUltimoCambio?.getTime() ?? e.historial.at(-1)?.fecha.getTime() ?? 0;
  return [...envios].sort((a, b) => fecha(b) - fecha(a) || b.id - a.id);
}

/** Fecha de creación: el primer cambio de estado (Pendiente). */
export function fechaCreacion(envio: Pick<Envio, 'historial'>): Date | undefined {
  return envio.historial[0]?.fecha;
}
