import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CLIENTE, CONDUCTOR, apiEnvio, buildEnvio } from '../../../../testing/fixtures';
import {
  API_BASE,
  FakeLocalForage,
  provideFakesBase,
  vaciarPromesas,
} from '../../../../testing/fakes';
import { apiInterceptor } from '../../http/api.interceptor';
import { ApiError } from '../../http/api-error';
import { KeyValueStorePort, LocationTransportPort, ShipmentsPort } from '../../ports';
import { MockLocationAdapter } from '../mock/mock-adapters';
import {
  CLAVE_COLA_UBICACION,
  DemoDriverProfileAdapter,
  LocalShipmentsCache,
  LocationQueue,
  MAX_COLA_UBICACION,
  ProbeDriverBoardAdapter,
  RatedShipments,
  SeededZonesAdapter,
} from './local-adapters';
import { LocalForageAdapter, LocalStorageSessionAdapter } from './browser-storage';

describe('LocalShipmentsCache', () => {
  const obtener = vi.fn();
  let cache: LocalShipmentsCache;
  let almacen: FakeLocalForage;

  beforeEach(() => {
    obtener.mockReset();
    TestBed.configureTestingModule({
      providers: [provideFakesBase(), { provide: ShipmentsPort, useValue: { obtener } }],
    });
    cache = TestBed.inject(LocalShipmentsCache);
    almacen = TestBed.inject(KeyValueStorePort) as FakeLocalForage;
  });

  it('debería guardar ids sin duplicar', async () => {
    await cache.recordar(1, 5);
    await cache.recordar(1, 5);
    await cache.recordar(1, 6);
    expect(await cache.ids(1)).toEqual([5, 6]);
    expect(await cache.ids(2)).toEqual([]);
  });

  it('debería refrescar con GET, ordenar recientes y olvidar los 404', async () => {
    await cache.recordar(1, 5);
    await cache.recordar(1, 6);
    await cache.recordar(1, 7);
    obtener.mockImplementation(async (id: number) => {
      if (id === 7) throw new ApiError(404, 'No existe');
      return buildEnvio({
        id,
        fechaUltimoCambio: new Date(id === 6 ? '2026-10-29' : '2026-10-01'),
      });
    });
    expect((await cache.listar(1)).map((e) => e.id)).toEqual([6, 5]);
    expect(await almacen.get(LocalShipmentsCache.clave(1))).toEqual([5, 6]);
  });

  it('debería descartar envíos de otro cliente', async () => {
    await cache.recordar(1, 5);
    obtener.mockResolvedValue(buildEnvio({ id: 5, idCliente: 99 }));
    expect(await cache.listar(1)).toEqual([]);
  });

  it('debería conservar ids con error temporal y fallar si todos fallan', async () => {
    await cache.recordar(1, 5);
    obtener.mockRejectedValue(new ApiError(0, 'Sin conexión'));
    await expect(cache.listar(1)).rejects.toMatchObject({ status: 0 });
    expect(await cache.ids(1)).toEqual([5]);
  });
});

describe('RatedShipments', () => {
  it('debería guardar, leer y no duplicar', async () => {
    TestBed.configureTestingModule({ providers: [provideFakesBase()] });
    const r = TestBed.inject(RatedShipments);
    expect(await r.estaCalificado(1)).toBe(false);
    await r.marcar(1);
    await r.marcar(1);
    expect(await r.lista()).toEqual([1]);
    expect(await r.estaCalificado(1)).toBe(true);
  });
});

describe('LocationQueue', () => {
  let cola: LocationQueue;
  let transporte: MockLocationAdapter;
  let enviar: ReturnType<typeof vi.fn>;
  const u = (n: number) => ({
    lat: 4 + n / 1000,
    lon: -74,
    capturadoEn: `2026-10-29T10:00:${String(n).padStart(2, '0')}Z`,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideFakesBase(),
        { provide: LocationTransportPort, useClass: MockLocationAdapter },
      ],
    });
    cola = TestBed.inject(LocationQueue);
    transporte = TestBed.inject(LocationTransportPort) as MockLocationAdapter;
    enviar = vi.fn(transporte.enviar.bind(transporte));
    transporte.enviar = enviar as typeof transporte.enviar;
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
    expect(
      enviar.mock.calls.map((c: unknown[]) => (c[1] as { capturadoEn: string }).capturadoEn),
    ).toEqual([u(1).capturadoEn, u(2).capturadoEn]);
    expect(await cola.pendientes()).toEqual([]);
  });

  it('no debería duplicar la misma coordenada', async () => {
    await cola.registrar(1, u(1), false);
    await cola.registrar(1, u(1), false);
    expect((await cola.pendientes()).length).toBe(1);
  });

  it('debería respetar el tope de 500 descartando las más antiguas', async () => {
    const almacen = TestBed.inject(KeyValueStorePort);
    await almacen.set(
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

  it('debería encolar si el envío directo falla y reintentar después', async () => {
    transporte.fallar = true;
    await cola.registrar(1, u(1), true);
    await vaciarPromesas(10);
    expect((await cola.pendientes()).length).toBe(1);
    transporte.fallar = false;
    expect(await cola.sincronizar()).toBe(1);
  });
});

describe('ProbeDriverBoardAdapter', () => {
  let ctrl: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideFakesBase(),
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    ctrl = TestBed.inject(HttpTestingController);
  });
  afterEach(() => ctrl.verify());

  async function responder(id: number, cuerpo: object | null) {
    await vaciarPromesas(3);
    const req = ctrl.expectOne(`${API_BASE}/envios/${id}`);
    if (cuerpo) req.flush({ envio: cuerpo });
    else req.flush({ error: 'No existe' }, { status: 404, statusText: 'x' });
  }

  it('debería recorrer ids, quedarse con los Pendiente sin conductor y parar tras 5 inexistentes', async () => {
    const p = TestBed.inject(ProbeDriverBoardAdapter).disponibles();
    await responder(1, apiEnvio({ id_envio: 1, estado: 'Entregado' }));
    await responder(2, apiEnvio({ id_envio: 2, estado: 'Pendiente', id_conductor: null }));
    await responder(3, null);
    await responder(4, apiEnvio({ id_envio: 4, estado: 'Pendiente', id_conductor: null }));
    for (let id = 5; id <= 9; id++) await responder(id, null);
    const lista = await p;
    expect(lista.map((e) => e.id)).toEqual([4, 2]);
    expect(lista.every((e) => e.pin === undefined)).toBe(true);
  });

  it('debería propagar errores distintos de 404', async () => {
    const p = TestBed.inject(ProbeDriverBoardAdapter).disponibles();
    await vaciarPromesas(3);
    ctrl.expectOne(`${API_BASE}/envios/1`).flush({ error: 'x' }, { status: 400, statusText: 'x' });
    await expect(p).rejects.toMatchObject({ status: 400 });
  });
});

describe('adaptadores de demo', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideFakesBase()] }));

  it('DemoDriverProfileAdapter usa environment.demo y deja sin id a quien no está', async () => {
    const a = TestBed.inject(DemoDriverProfileAdapter);
    expect(await a.obtener(CONDUCTOR)).toEqual({ idConductor: 1, estadoAprobacion: 'Aprobado' });
    expect(await a.obtener(CLIENTE)).toEqual({ idConductor: null, estadoAprobacion: 'Pendiente' });
  });

  it('SeededZonesAdapter devuelve las 5 zonas del seed', async () => {
    const z = await TestBed.inject(SeededZonesAdapter).listar();
    expect(z.map((x) => x.tarifaBase)).toEqual([5000, 8000, 9000, 12000, 12000]);
  });
});

describe('almacenamiento del navegador', () => {
  it('LocalStorageSessionAdapter lee, guarda y borra', () => {
    const a = new LocalStorageSessionAdapter();
    a.guardar('k', 'v');
    expect(a.leer('k')).toBe('v');
    a.borrar('k');
    expect(a.leer('k')).toBeNull();
  });

  it('LocalStorageSessionAdapter tolera un localStorage bloqueado', () => {
    const a = new LocalStorageSessionAdapter();
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('lleno');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('x');
    });
    expect(a.leer('k')).toBeNull();
    expect(() => a.guardar('k', 'v')).not.toThrow();
    expect(() => a.borrar('k')).not.toThrow();
    spy.mockRestore();
    vi.restoreAllMocks();
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
