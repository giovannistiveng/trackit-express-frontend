import {
  CAPACIDAD_KG,
  ETAPAS,
  PASOS_SERVICIO,
  SERVICIOS,
  TEXTO_ETAPA,
  TIPOS_SERVICIO,
  esEtapa,
  esTipoServicio,
  etapaPorEstado,
  indicePaso,
  resumenDetalle,
  vehiculoMinimo,
} from './servicios';
import { areaKm2, distanciaKm, zonaDePunto, zonasSuperpuestas } from './zonas';
import { Zona } from './models';

describe('servicios', () => {
  it('cada servicio tiene nombre, ícono y vehículo mínimo', () => {
    for (const t of TIPOS_SERVICIO) {
      expect(SERVICIOS[t].nombre).toBeTruthy();
      expect(CAPACIDAD_KG[SERVICIOS[t].vehiculoMinimo]).toBeGreaterThan(0);
    }
    expect(esTipoServicio('trasteo')).toBe(true);
    expect(esTipoServicio('otro')).toBe(false);
    expect(esTipoServicio(null)).toBe(false);
  });

  it('el vehículo mínimo sube con el peso y nunca baja del mínimo del servicio', () => {
    expect(vehiculoMinimo('paquete')).toBe('Moto Express');
    expect(vehiculoMinimo('paquete', { pesoKg: 20 })).toBe('Moto Express');
    expect(vehiculoMinimo('paquete', { pesoKg: 21 })).toBe('Motocarro');
    expect(vehiculoMinimo('insumos', { pesoKg: 800 })).toBe('Camioneta');
    expect(vehiculoMinimo('insumos', { pesoKg: 3000 })).toBe('Camión');
    expect(vehiculoMinimo('insumos', { pesoKg: 9000 })).toBe('Camión');
    // Un trasteo ya pide motocarro aunque pese poco
    expect(vehiculoMinimo('trasteo', { pesoKg: 5 })).toBe('Motocarro');
  });

  it('resume el detalle en frases cortas', () => {
    expect(resumenDetalle('paquete', null)).toEqual([]);
    expect(
      resumenDetalle('trasteo', {
        ayudantes: 2,
        pisosOrigen: 3,
        ascensorOrigen: false,
        pisosDestino: 5,
        ascensorDestino: true,
        bultos: 1,
        fragil: true,
      }),
    ).toEqual([
      '2 ayudantes',
      'Recoge en piso 3 por escaleras',
      'Entrega en piso 5 con ascensor',
      '1 bulto',
      'Frágil',
    ]);
    expect(resumenDetalle('trasteo', { ayudantes: 1, pisosOrigen: 1 })).toEqual(['1 ayudante']);
    expect(
      resumenDetalle('insumos', {
        insumo: 'Abono',
        pesoKg: 250,
        bultos: 5,
        accesoDestapado: true,
      }),
    ).toEqual(['Abono', '250 kg aprox.', '5 bultos', 'Vía destapada']);
    expect(resumenDetalle('mercado', { lista: 'x', presupuesto: 60000 })[0]).toMatch(
      /Presupuesto \$ 60\.000/,
    );
  });

  it('etapas: validación, orden en la línea de tiempo y equivalencia con el estado', () => {
    for (const e of ETAPAS) expect(TEXTO_ETAPA[e].titulo).toBeTruthy();
    expect(esEtapa('en_camino')).toBe(true);
    expect(esEtapa('volando')).toBe(false);
    expect(indicePaso('buscando_conductor')).toBe(0);
    expect(indicePaso('regresando')).toBe(PASOS_SERVICIO.indexOf('en_camino'));
    expect(indicePaso('cancelado')).toBe(-1);
    expect(etapaPorEstado('Pendiente')).toBe('buscando_conductor');
    expect(etapaPorEstado('Asignado')).toBe('yendo_a_recoger');
    expect(etapaPorEstado('En Ruta')).toBe('en_camino');
    expect(etapaPorEstado('Entregado')).toBe('entregado');
    expect(etapaPorEstado('Cancelado')).toBe('cancelado');
  });
});

describe('zonas', () => {
  const FUSA = { lat: 4.3369, lon: -74.3638 };
  const SILVANIA = { lat: 4.4036, lon: -74.3881 };
  const zonas: Zona[] = [
    { id: 1, nombre: 'Municipio', tarifaBase: 0, centro: FUSA, radioKm: 10, activa: true },
    { id: 2, nombre: 'Centro', tarifaBase: 0, centro: FUSA, radioKm: 2 },
    { id: 3, nombre: 'Apagada', tarifaBase: 0, centro: FUSA, radioKm: 1, activa: false },
    { id: 4, nombre: 'Sin ubicar', tarifaBase: 0, centro: null, radioKm: 3 },
  ];

  it('mide la distancia en línea recta', () => {
    expect(distanciaKm(FUSA, FUSA)).toBe(0);
    const d = distanciaKm(FUSA, SILVANIA);
    expect(d).toBeGreaterThan(7);
    expect(d).toBeLessThan(8);
  });

  it('un punto pertenece a la zona activa más pequeña que lo contiene', () => {
    expect(zonaDePunto(zonas, FUSA)?.nombre).toBe('Centro');
    expect(zonaDePunto(zonas, { lat: 4.37, lon: -74.36 })?.nombre).toBe('Municipio');
    expect(zonaDePunto(zonas, { lat: 5, lon: -74 })).toBeNull();
  });

  it('detecta cruces con otras zonas y calcula el área', () => {
    const lejos = { lat: 4.55, lon: -74.36 };
    expect(zonasSuperpuestas(zonas, lejos, 1, null).map((z) => z.id)).toEqual([]);
    expect(zonasSuperpuestas(zonas, lejos, 14, 1).map((z) => z.id)).toEqual([]);
    expect(zonasSuperpuestas(zonas, lejos, 14, null).map((z) => z.id)).toEqual([1]);
    expect(areaKm2(1)).toBe(3);
    expect(areaKm2(10)).toBe(314);
  });
});
