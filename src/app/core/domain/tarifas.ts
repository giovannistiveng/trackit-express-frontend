import { CATEGORIAS_VEHICULO, CategoriaVehiculo, TarifaVehiculo } from './models';

/** Los precios se redondean hacia arriba a múltiplos de 100 COP (igual que el backend). */
export const REDONDEO_COP = 100;

/** Viajes de ejemplo para explicar las tarifas (distancia y tiempo típicos en la región). */
export const VIAJES_EJEMPLO = [
  { nombre: 'Dentro del centro', km: 2.5, minutos: 8 },
  { nombre: 'A un barrio retirado', km: 5, minutos: 14 },
  { nombre: 'Fusagasugá → Silvania', km: 14.5, minutos: 25 },
] as const;

/**
 * Precio de referencia sin recargos nocturnos: banderazo + km × porKm + minutos × porMinuto,
 * nunca menos del mínimo, más el recargo de zona. El precio definitivo lo calcula el backend.
 */
export function precioEstimado(
  t: TarifaVehiculo,
  km: number,
  minutos: number,
  recargoZona = 0,
): number {
  const base = t.banderazo + Math.max(0, km) * t.porKm + Math.max(0, minutos) * t.porMinuto;
  const total = Math.max(base, t.minimo) + Math.max(0, recargoZona);
  return Math.ceil(Math.round(total) / REDONDEO_COP) * REDONDEO_COP;
}

/** Valores de una tarifa válidos para guardar (enteros dentro de los límites del backend). */
export function tarifaValida(t: TarifaVehiculo): boolean {
  const enRango = (v: number, max: number) => Number.isFinite(v) && v >= 0 && v <= max;
  return (
    enRango(t.banderazo, 200_000) &&
    enRango(t.porKm, 20_000) &&
    enRango(t.porMinuto, 5_000) &&
    enRango(t.minimo, 500_000)
  );
}

/** Capacidad relativa: un vehículo puede llevar pedidos de su categoría o de una menor. */
const CAPACIDAD: Record<CategoriaVehiculo, number> = {
  'Moto Express': 1,
  Motocarro: 2,
  Camioneta: 3,
};

/** Categorías de pedido que ve un conductor con este vehículo (igual que el backend). */
export function categoriasAtendibles(
  vehiculo: CategoriaVehiculo | null | undefined,
): CategoriaVehiculo[] {
  if (!vehiculo) return [];
  return CATEGORIAS_VEHICULO.filter((c) => CAPACIDAD[c] <= CAPACIDAD[vehiculo]);
}
