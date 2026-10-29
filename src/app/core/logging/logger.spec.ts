import { TestBed } from '@angular/core/testing';
import {
  FakeLocalForage,
  FakeLogTransport,
  configPrueba,
  provideFakesBase,
  vaciarPromesas,
} from '../../../testing/fakes';
import { KeyValueStorePort, LogTransportPort, LoggerPort } from '../ports';
import { ApiError } from '../http/api-error';
import { GlobalErrorHandler } from './global-error-handler';
import {
  CLAVE_COLA_LOGS,
  INTERVALO_ENVIO_MS,
  LoggerService,
  MAX_COLA,
  MAX_LOTE,
  UMBRAL_LOTE,
} from './logger.service';
import { esClaveSensible, recortarStack, sanitizar } from './sanitize';

function preparar(logs: Partial<ReturnType<typeof configPrueba>['logs']> = {}, production = false) {
  const cfg = configPrueba({
    production,
    logs: { nivelMinimo: 'DEBUG', enviarAlServidor: true, consola: false, ...logs },
  });
  TestBed.configureTestingModule({ providers: [provideFakesBase(cfg), LoggerService] });
  return {
    log: TestBed.inject(LoggerService),
    transporte: TestBed.inject(LogTransportPort) as FakeLogTransport,
    almacen: TestBed.inject(KeyValueStorePort) as FakeLocalForage,
  };
}

describe('LoggerService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('debería respetar el nivel mínimo', async () => {
    const { log, transporte } = preparar({ nivelMinimo: 'WARN' });
    log.info('A', 'no');
    log.warn('A', 'sí');
    await vi.advanceTimersByTimeAsync(INTERVALO_ENVIO_MS);
    expect(transporte.lotes.flat().map((e) => e.mensaje)).toEqual(['sí']);
  });

  it('no debería enviar nada si enviarAlServidor está apagado', async () => {
    const { log, transporte } = preparar({ enviarAlServidor: false });
    log.error('A', 'x');
    await vi.advanceTimersByTimeAsync(INTERVALO_ENVIO_MS);
    expect(transporte.lotes).toHaveLength(0);
  });

  it('debería agrupar y enviar a los 10 s', async () => {
    const { log, transporte } = preparar();
    log.info('A', '1');
    log.info('A', '2');
    expect(transporte.lotes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(INTERVALO_ENVIO_MS);
    expect(transporte.lotes).toHaveLength(1);
    expect(transporte.lotes[0].map((e) => e.mensaje)).toEqual(['1', '2']);
  });

  it('debería enviar al juntar 20 eventos y de inmediato ante un ERROR', async () => {
    const { log, transporte } = preparar();
    for (let i = 0; i < UMBRAL_LOTE; i++) log.debug('A', String(i));
    await vaciarPromesas();
    expect(transporte.lotes).toHaveLength(1);
    log.error('A', 'falla');
    await vaciarPromesas();
    expect(transporte.lotes[1].map((e) => e.nivel)).toEqual(['ERROR']);
  });

  it('nunca debería enviar más de 50 eventos por lote', async () => {
    const { log, transporte } = preparar();
    transporte.fallo = new ApiError(0, 'x');
    for (let i = 0; i < 70; i++) log.debug('A', String(i));
    await vaciarPromesas(20);
    transporte.fallo = null;
    await log.reenviarCola();
    expect(Math.max(...transporte.lotes.map((l) => l.length))).toBeLessThanOrEqual(MAX_LOTE);
    expect(transporte.lotes.flat()).toHaveLength(70);
  });

  it('debería encolar sin conexión, respetar el tope y reenviar en orden al volver la red', async () => {
    const { log, transporte, almacen } = preparar();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    for (let i = 0; i < MAX_COLA + 10; i++) {
      log.info('A', String(i));
      if (i % 20 === 19) await vaciarPromesas(10);
    }
    await log.enviar();
    await vaciarPromesas(10);
    const cola = (await almacen.get<{ mensaje: string }[]>(CLAVE_COLA_LOGS)) ?? [];
    expect(cola).toHaveLength(MAX_COLA);
    expect(cola[0].mensaje).toBe('10');
    expect(transporte.lotes).toHaveLength(0);
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    window.dispatchEvent(new Event('online'));
    await vaciarPromesas(40);
    expect(transporte.lotes.flat().map((e) => e.mensaje)[0]).toBe('10');
    expect(transporte.lotes.flat()).toHaveLength(MAX_COLA);
    expect(await almacen.get(CLAVE_COLA_LOGS)).toBeNull();
  });

  it('debería pausar los envíos tras un 429', async () => {
    const { log, transporte } = preparar();
    transporte.fallo = new ApiError(429, 'x');
    log.error('A', 'x');
    await vaciarPromesas(10);
    transporte.fallo = null;
    log.error('A', 'y');
    await vaciarPromesas(10);
    expect(transporte.lotes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(transporte.lotes.length).toBeGreaterThan(0);
  });

  it('debería usar sendBeacon al ocultar la pestaña y encolar si no se puede', async () => {
    const { log, transporte, almacen } = preparar();
    log.info('A', 'antes de salir');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(transporte.balizas.flat().map((e) => e.mensaje)).toEqual(['antes de salir']);
    transporte.balizaOk = false;
    log.info('A', 'otro');
    window.dispatchEvent(new Event('pagehide'));
    await vaciarPromesas(10);
    expect((await almacen.get<unknown[]>(CLAVE_COLA_LOGS))?.length).toBe(1);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('debería sanitizar meta, añadir sesión, usuario y ruta', async () => {
    const { log, transporte } = preparar();
    log.establecerUsuario(7);
    log.warn('HTTP', 'x', { password: 'secreta', pin_seguridad: '1234', status: 400 });
    await vi.advanceTimersByTimeAsync(INTERVALO_ENVIO_MS);
    const [e] = transporte.lotes[0];
    expect(e.meta).toEqual({ password: '[OCULTO]', pin_seguridad: '[OCULTO]', status: 400 });
    expect(e.usuario).toBe(7);
    expect(e.sesion).toMatch(/^[a-z0-9]{8}$/);
    expect(e.url).toBe(location.pathname);
  });

  it('debería escribir en consola solo con consola activa', () => {
    const { log } = preparar({ enviarAlServidor: false, consola: true });
    const spies = ['error', 'warn', 'info', 'debug'].map((m) =>
      vi.spyOn(console, m as 'error').mockImplementation(() => undefined),
    );
    log.error('A', 'e');
    log.warn('A', 'w', { a: 1 });
    log.info('A', 'i');
    log.debug('A', 'd');
    spies.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
  });
});

describe('sanitizar', () => {
  it('debería ocultar claves sensibles anidadas sin tocar shipping u opinion', () => {
    expect(
      sanitizar({
        user: { password: 'x', nombre: 'a' },
        Authorization: 'Bearer',
        pin: '1',
        lista: [{ token: 't' }],
        shipping: 1,
        opinion: 'b',
        fecha: new Date(0),
      }),
    ).toEqual({
      user: { password: '[OCULTO]', nombre: 'a' },
      Authorization: '[OCULTO]',
      pin: '[OCULTO]',
      lista: [{ token: '[OCULTO]' }],
      shipping: 1,
      opinion: 'b',
      fecha: '1970-01-01T00:00:00.000Z',
    });
  });
  it('debería resumir errores y archivos', () => {
    expect(sanitizar(new Error('boom'))).toMatchObject({ nombre: 'Error', mensaje: 'boom' });
    expect(sanitizar(new Blob(['abc']))).toBe('[Archivo 3 bytes]');
    expect(sanitizar(null)).toBeNull();
  });
  it('debería cortar estructuras muy profundas', () => {
    const profundo = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    expect(JSON.stringify(sanitizar(profundo))).toContain('[...]');
  });
  it('debería detectar claves sensibles y recortar stacks', () => {
    expect(esClaveSensible('contraseña')).toBe(true);
    expect(esClaveSensible('pinta')).toBe(false);
    expect(recortarStack('1\n2\n3', 2)).toBe('1\n2');
  });
});

describe('GlobalErrorHandler', () => {
  it('debería registrar un ERROR con el stack recortado', () => {
    TestBed.configureTestingModule({ providers: [provideFakesBase(), GlobalErrorHandler] });
    const h = TestBed.inject(GlobalErrorHandler);
    h.handleError(new Error('Cannot read properties of undefined'));
    h.handleError('texto');
    const log = TestBed.inject(LoggerPort) as unknown as {
      eventos: { nivel: string; mensaje: string; meta: { stack?: string } }[];
    };
    expect(log.eventos[0]).toMatchObject({
      nivel: 'ERROR',
      mensaje: 'Error no controlado: Cannot read properties of undefined',
    });
    expect(log.eventos[0].meta.stack?.split('\n').length).toBeLessThanOrEqual(15);
    expect(log.eventos[1].mensaje).toBe('Error no controlado: texto');
  });
});
