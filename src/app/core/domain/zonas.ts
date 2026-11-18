import { Coordenadas, Zona } from './models';

const RADIO_TIERRA_KM = 6371;

/** Distancia en línea recta (haversine) entre dos puntos, en km. */
export function distanciaKm(a: Coordenadas, b: Coordenadas): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function ubicada(z: Zona): z is Zona & { centro: Coordenadas; radioKm: number } {
  return !!z.centro && !!z.radioKm && z.radioKm > 0;
}

/**
 * Zona a la que pertenece un punto, con la misma regla del backend: la zona activa más pequeña
 * que lo contiene. `null` = fuera de cobertura.
 */
export function zonaDePunto(zonas: Zona[], p: Coordenadas): Zona | null {
  const candidatas = zonas
    .filter(ubicada)
    .filter((z) => z.activa !== false && distanciaKm(z.centro, p) <= z.radioKm)
    .sort((a, b) => a.radioKm - b.radioKm);
  return candidatas[0] ?? null;
}

/** Zonas (distintas de `idPropia`) cuyo círculo se cruza con el indicado. */
export function zonasSuperpuestas(
  zonas: Zona[],
  centro: Coordenadas,
  radioKm: number,
  idPropia: number | null,
): Zona[] {
  return zonas
    .filter(ubicada)
    .filter((z) => z.id !== idPropia && distanciaKm(z.centro, centro) < z.radioKm + radioKm);
}

/** Área aproximada del círculo, en km² (para dimensionar la zona). */
export function areaKm2(radioKm: number): number {
  return Math.round(Math.PI * radioKm * radioKm);
}
