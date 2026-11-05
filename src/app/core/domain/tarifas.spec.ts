import { TarifaVehiculo } from './models';
import { VIAJES_EJEMPLO, categoriasAtendibles, precioEstimado, tarifaValida } from './tarifas';

const MOTO: TarifaVehiculo = {
  categoria: 'Moto Express',
  banderazo: 2000,
  porKm: 700,
  porMinuto: 50,
  minimo: 4500,
};

describe('tarifas', () => {
  it('suma banderazo, km y minutos, aplica el mínimo, suma el recargo y redondea a 100', () => {
    expect(precioEstimado(MOTO, 5, 10)).toBe(6000);
    expect(precioEstimado(MOTO, 3.21, 9)).toBe(4700); // 2.000 + 2.247 + 450 = 4.697 → 4.700
    expect(precioEstimado(MOTO, 1, 2)).toBe(4500);
    expect(precioEstimado(MOTO, 1, 2, 1500)).toBe(6000);
    expect(precioEstimado(MOTO, -3, -1, -100)).toBe(4500);
    expect(VIAJES_EJEMPLO).toHaveLength(3);
  });

  it('valida los límites de una tarifa', () => {
    expect(tarifaValida(MOTO)).toBe(true);
    expect(tarifaValida({ ...MOTO, banderazo: -1 })).toBe(false);
    expect(tarifaValida({ ...MOTO, porKm: Number.NaN })).toBe(false);
    expect(tarifaValida({ ...MOTO, minimo: 600_000 })).toBe(false);
  });

  it('un vehículo grande atiende pedidos de su tamaño o menores', () => {
    expect(categoriasAtendibles(null)).toEqual([]);
    expect(categoriasAtendibles('Moto Express')).toEqual(['Moto Express']);
    expect(categoriasAtendibles('Motocarro')).toEqual(['Moto Express', 'Motocarro']);
    expect(categoriasAtendibles('Camioneta')).toHaveLength(3);
  });
});
