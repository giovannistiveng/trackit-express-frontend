import { TestBed } from '@angular/core/testing';
import { provideFakesBase, vaciarPromesas } from '../../../../testing/fakes';
import { ApiError } from '../../http/api-error';
import { KeyValueStorePort, LocationTransportPort } from '../../ports';
import { Ubicacion } from '../../domain';
import { LocalForageAdapter, LocalStorageSessionAdapter } from './browser-storage';
import { CLAVE_COLA_UBICACION, LocationQueue, MAX_COLA_UBICACION } from './location-queue';

describe('LocationQueue', () => {
  let cola: LocationQueue;
  let enviar: ReturnType<typeof vi.fn<(id: number, u: Ubicacion) => Promise<void>>>;
  const u = (n: number) => ({
    lat: 4 + n / 1000,
    lon: -74,
    capturadoEn: `2026-10-29T10:00:${String(n).padStart(2, '0')}Z`,
  });

  beforeEach(() => {
    enviar = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        provideFakesBase(),
        { provide: LocationTransportPort, useValue: { enviar, ultima: vi.fn() } },
      ],
    });
    cola = TestBed.inject(LocationQueue);
  });

  it('debería enviar directo con red y cola vacía', async () => {
    expect(await cola.registrar(1, u(1), true)).toBe(true);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(await cola.pendientes()).toEqual([]);
  });

  it('debería encolar sin conexión y sincronizar en orden al volver la red', async () => {
    await cola.registrar(1, u(1), false);
    await cola.registrar(1, u(2), false);
    expect((await cola.pendientes()).length).toBe(2);
    expect(await cola.sincronizar()).toBe(2);
    expect(enviar.mock.calls.map((c) => c[1].capturadoEn)).toEqual([
      u(1).capturadoEn,
      u(2).capturadoEn,
    ]);
    expect(await cola.pendientes()).toEqual([]);
  });

  it('no debería duplicar la misma coordenada', async () => {
    await cola.registrar(1, u(1), false);
    await cola.registrar(1, u(1), false);
    expect((await cola.pendientes()).length).toBe(1);
  });

  it('debería respetar el tope de 500 descartando las más antiguas', async () => {
    await TestBed.inject(KeyValueStorePort).set(
      CLAVE_COLA_UBICACION,
      Array.from({ length: MAX_COLA_UBICACION }, (_, i) => ({
        ...u(0),
        capturadoEn: `t${i}`,
        idEnvio: 1,
      })),
    );
    await cola.registrar(1, { ...u(0), capturadoEn: 'nueva' }, false);
    const p = await cola.pendientes();
    expect(p).toHaveLength(MAX_COLA_UBICACION);
    expect(p[0].capturadoEn).toBe('t1');
    expect(p.at(-1)?.capturadoEn).toBe('nueva');
  });

  it('debería descartar coordenadas fuera de rango', async () => {
    expect(await cola.registrar(1, { lat: 95, lon: 0, capturadoEn: 'x' }, false)).toBe(false);
    expect(await cola.pendientes()).toEqual([]);
  });

  it('ante un fallo a mitad de la sincronización debería conservar las restantes', async () => {
    for (let i = 1; i <= 3; i++) await cola.registrar(1, u(i), false);
    let n = 0;
    enviar.mockImplementation(async () => {
      if (++n === 2) throw new ApiError(0, 'x');
    });
    expect(await cola.sincronizar()).toBe(1);
    expect((await cola.pendientes()).map((p) => p.capturadoEn)).toEqual([
      u(2).capturadoEn,
      u(3).capturadoEn,
    ]);
  });

  it('debería encolar si el envío directo falla y no perder la coordenada', async () => {
    enviar.mockImplementation(async () => {
      throw new ApiError(0, 'x');
    });
    await cola.registrar(1, u(1), true);
    await vaciarPromesas(10);
    expect((await cola.pendientes()).length).toBe(1);
    enviar.mockImplementation(async () => undefined);
    expect(await cola.sincronizar()).toBe(1);
    expect(await cola.pendientes()).toEqual([]);
  });

  it('no debería lanzar dos sincronizaciones a la vez', async () => {
    await cola.registrar(1, u(1), false);
    const [a, b] = await Promise.all([cola.sincronizar(), cola.sincronizar()]);
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(enviar).toHaveBeenCalledTimes(1);
  });
});

describe('almacenamiento del navegador', () => {
  afterEach(() => vi.restoreAllMocks());

  it('LocalStorageSessionAdapter lee, guarda y borra', () => {
    const a = new LocalStorageSessionAdapter();
    a.guardar('k', 'v');
    expect(a.leer('k')).toBe('v');
    a.borrar('k');
    expect(a.leer('k')).toBeNull();
  });

  it('LocalStorageSessionAdapter tolera un localStorage bloqueado', () => {
    const a = new LocalStorageSessionAdapter();
    for (const m of ['getItem', 'setItem', 'removeItem'] as const) {
      vi.spyOn(Storage.prototype, m).mockImplementation(() => {
        throw new Error('bloqueado');
      });
    }
    expect(a.leer('k')).toBeNull();
    expect(() => a.guardar('k', 'v')).not.toThrow();
    expect(() => a.borrar('k')).not.toThrow();
  });

  it('LocalForageAdapter delega en localforage', async () => {
    const a = new LocalForageAdapter();
    const datos = new Map<string, unknown>();
    (a as unknown as { db: object }).db = {
      getItem: vi.fn(async (k: string) => datos.get(k) ?? null),
      setItem: vi.fn(async (k: string, v: unknown) => datos.set(k, v)),
      removeItem: vi.fn(async (k: string) => void datos.delete(k)),
    };
    await a.set('k', [1]);
    expect(await a.get('k')).toEqual([1]);
    await a.remove('k');
    expect(await a.get('k')).toBeNull();
  });
});
