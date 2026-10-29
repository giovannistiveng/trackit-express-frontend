import { buildEnvio, crearJwt } from '../../../testing/fixtures';
import {
  esActivo,
  esTransicionValida,
  fechaCreacion,
  ordenarRecientes,
  puedeCalificar,
  puedeCompartirUbicacion,
  puedeEntregar,
  puedeIniciarRuta,
} from './envio.rules';
import { leerExpiracionJwt } from './jwt';

describe('reglas del envío', () => {
  it('debería permitir calificar solo un envío Entregado y no calificado', () => {
    expect(puedeCalificar(buildEnvio({ estado: 'Entregado' }), false)).toBe(true);
    expect(puedeCalificar(buildEnvio({ estado: 'Entregado' }), true)).toBe(false);
    expect(puedeCalificar(buildEnvio({ estado: 'En Ruta' }), false)).toBe(false);
  });

  it('debería aceptar solo la secuencia Pendiente → Asignado → En Ruta → Entregado', () => {
    expect(esTransicionValida('Pendiente', 'Asignado')).toBe(true);
    expect(esTransicionValida('Asignado', 'En Ruta')).toBe(true);
    expect(esTransicionValida('En Ruta', 'Entregado')).toBe(true);
    expect(esTransicionValida('Asignado', 'Entregado')).toBe(false);
    expect(esTransicionValida('Pendiente', 'Entregado')).toBe(false);
    expect(esTransicionValida('Entregado', 'Pendiente')).toBe(false);
  });

  it('debería permitir entregar solo En Ruta', () => {
    expect(puedeEntregar(buildEnvio({ estado: 'En Ruta' }))).toBe(true);
    expect(puedeEntregar(buildEnvio({ estado: 'Asignado' }))).toBe(false);
    expect(puedeEntregar(buildEnvio({ estado: 'Pendiente' }))).toBe(false);
  });

  it('debería iniciar ruta desde Asignado y compartir ubicación en Asignado o En Ruta', () => {
    expect(puedeIniciarRuta(buildEnvio({ estado: 'Asignado' }))).toBe(true);
    expect(puedeIniciarRuta(buildEnvio({ estado: 'En Ruta' }))).toBe(false);
    expect(puedeCompartirUbicacion(buildEnvio({ estado: 'Asignado' }))).toBe(true);
    expect(puedeCompartirUbicacion(buildEnvio({ estado: 'En Ruta' }))).toBe(true);
    expect(puedeCompartirUbicacion(buildEnvio({ estado: 'Entregado' }))).toBe(false);
  });

  it('debería considerar activos todos los estados menos Entregado', () => {
    expect(esActivo('Pendiente')).toBe(true);
    expect(esActivo('Entregado')).toBe(false);
  });

  it('debería ordenar de más reciente a más antiguo', () => {
    const a = buildEnvio({ id: 1, fechaUltimoCambio: new Date('2026-10-01') });
    const b = buildEnvio({ id: 2, fechaUltimoCambio: new Date('2026-10-20') });
    const c = buildEnvio({ id: 3, fechaUltimoCambio: undefined, historial: [] });
    expect(ordenarRecientes([a, c, b]).map((e) => e.id)).toEqual([2, 1, 3]);
  });

  it('debería tomar la fecha de creación del backend o, si falta, del primer cambio', () => {
    const e = buildEnvio({ estado: 'Asignado' });
    expect(fechaCreacion(e)).toEqual(e.historial[0].fecha);
    const creada = new Date('2026-01-01');
    expect(fechaCreacion({ ...e, fechaCreacion: creada })).toBe(creada);
  });
});

describe('leerExpiracionJwt', () => {
  it('debería devolver exp en milisegundos', () =>
    expect(leerExpiracionJwt(crearJwt(1_800_000_000))).toBe(1_800_000_000_000));
  it('debería devolver null con un token mal formado', () => {
    expect(leerExpiracionJwt('no.es.jwt')).toBeNull();
    expect(leerExpiracionJwt('abc')).toBeNull();
  });
  it('debería devolver null si no hay exp', () => {
    const sinExp = `${btoa('{}')}.${btoa('{"a":1}')}.x`;
    expect(leerExpiracionJwt(sinExp)).toBeNull();
  });
});
