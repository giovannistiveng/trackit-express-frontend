import { normalizarLeaflet } from '../util/leaflet';
import { faseDe } from './estado-carga.component';
import { describirMapa } from './mapa-envio.component';

describe('faseDe', () => {
  it('prioriza cargando, luego error, luego vacío o listo', () => {
    expect(faseDe({ cargando: true, error: 'x', vacio: true })).toBe('cargando');
    expect(faseDe({ cargando: false, error: 'falló', vacio: true })).toBe('error');
    expect(faseDe({ cargando: false, error: '', vacio: true })).toBe('vacio');
    expect(faseDe({ cargando: false, error: null })).toBe('listo');
  });
});

describe('describirMapa', () => {
  const s = {
    idEnvio: 1,
    estado: 'En Ruta' as const,
    origen: { direccion: 'Parque', coords: { lat: 4.33, lon: -74.36 } },
    destino: { direccion: 'Silvania', coords: { lat: 4.4, lon: -74.38 } },
    ultima: null,
    recorrido: [],
    enVivo: false,
    distanciaRestanteKm: null,
    etaMinutos: null,
  };

  it('describe la posición del conductor y su rumbo', () => {
    expect(describirMapa(s, { lat: 4.351234, lon: -74.36 })).toBe(
      'Mapa: el conductor está en 4.3512, -74.3600, rumbo a Silvania',
    );
    expect(
      describirMapa({ ...s, destino: { direccion: 'x', coords: null } }, { lat: 1, lon: 2 }),
    ).toBe('Mapa: el conductor está en 1.0000, 2.0000');
  });

  it('sin posición describe la ruta, o el mapa sin datos', () => {
    expect(describirMapa(s, null)).toBe('Mapa del envío de Parque a Silvania');
    expect(describirMapa(null, null)).toBe('Mapa del envío');
  });
});

describe('normalizarLeaflet', () => {
  it('acepta el módulo directo (desarrollo) o dentro de default (producción)', async () => {
    const L = await import('leaflet');
    const real = normalizarLeaflet(L);
    expect(typeof real.map).toBe('function');
    expect(normalizarLeaflet({ default: real })).toBe(real);
  });
});
