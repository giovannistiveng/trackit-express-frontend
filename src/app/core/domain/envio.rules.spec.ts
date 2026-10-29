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

  it('debería aceptar transiciones válidas', () => {
    expect(esTransicionValida('Pendiente', 'Asignado')).toBe(true);
    expect(esTransicionValida('Asignado', 'En Ruta')).toBe(true);
    expect(esTransicionValida('En Ruta', 'Entregado')).toBe(true);
    expect(esTransicionValida('Asignado', 'Entregado')).toBe(true);
  });

  it('debería rechazar transiciones inválidas', () => {
    expect(esTransicionValida('Pendiente', 'Entregado')).toBe(false);
    expect(esTransicionValida('Entregado', 'Pendiente')).toBe(false);
    expect(esTransicionValida('Asignado', 'Entregado', true)).toBe(false);
  });

  it('debería permitir entregar desde Asignado solo sin el endpoint de iniciar ruta', () => {
    expect(puedeEntregar(buildEnvio({ estado: 'Asignado' }), false)).toBe(true);
    expect(puedeEntregar(buildEnvio({ estado: 'Asignado' }), true)).toBe(false);
    expect(puedeEntregar(buildEnvio({ estado: 'En Ruta' }), true)).toBe(true);
    expect(puedeEntregar(buildEnvio({ estado: 'Pendiente' }), false)).toBe(false);
  });

  it('debería permitir iniciar ruta y compartir ubicación según el estado y el flag', () => {
    expect(puedeIniciarRuta(buildEnvio({ estado: 'Asignado' }), true)).toBe(true);
    expect(puedeIniciarRuta(buildEnvio({ estado: 'Asignado' }), false)).toBe(false);
    expect(puedeCompartirUbicacion(buildEnvio({ estado: 'Asignado' }), false)).toBe(true);
    expect(puedeCompartirUbicacion(buildEnvio({ estado: 'Asignado' }), true)).toBe(false);
    expect(puedeCompartirUbicacion(buildEnvio({ estado: 'En Ruta' }), true)).toBe(true);
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

  it('debería tomar la fecha de creación del primer cambio', () => {
    const e = buildEnvio({ estado: 'Asignado' });
    expect(fechaCreacion(e)).toEqual(e.historial[0].fecha);
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
