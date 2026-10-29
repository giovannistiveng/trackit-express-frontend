import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { API_BASE, FakeLogger, provideFakesBase } from '../../../testing/fakes';
import { LoggerPort } from '../ports';
import { apiInterceptor, TIEMPO_MAXIMO_MS } from './api.interceptor';
import { ApiError, SIN_CONEXION, TIEMPO_AGOTADO } from './api-error';
import { SILENCIAR_404 } from './http-context';

describe('apiInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let log: FakeLogger;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideFakesBase(),
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    log = TestBed.inject(LoggerPort) as FakeLogger;
  });
  afterEach(() => {
    ctrl.verify();
    vi.useRealTimers();
  });

  it('debería normalizar el campo error del cuerpo en ApiError y registrarlo como WARN', async () => {
    const p = firstValueFrom(http.post(`${API_BASE}/x`, {}));
    ctrl
      .expectOne(`${API_BASE}/x`)
      .flush({ error: 'PIN incorrecto', statusCode: 400 }, { status: 400, statusText: 'Bad' });
    const e = await p.catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 400, message: 'PIN incorrecto' });
    expect(log.de('WARN')[0]).toMatch(/^POST \/x → 400 PIN incorrecto/);
  });

  it('debería usar el texto plano o el statusText si no hay campo error', async () => {
    const p1 = firstValueFrom(http.post(`${API_BASE}/a`, {}));
    ctrl.expectOne(`${API_BASE}/a`).flush('texto simple', { status: 400, statusText: 'Bad' });
    await expect(p1).rejects.toMatchObject({ message: 'texto simple' });
    const p2 = firstValueFrom(http.post(`${API_BASE}/b`, {}));
    ctrl.expectOne(`${API_BASE}/b`).flush(null, { status: 503, statusText: 'Unavailable' });
    await expect(p2).rejects.toMatchObject({ status: 503, message: 'Unavailable' });
    expect(log.de('ERROR')).toHaveLength(1);
  });

  it('debería marcar sin conexión cuando el estado es 0', async () => {
    const p = firstValueFrom(http.post(`${API_BASE}/x`, {}));
    ctrl.expectOne(`${API_BASE}/x`).error(new ProgressEvent('error'), { status: 0 });
    await expect(p).rejects.toMatchObject({ status: 0, codigoInterno: SIN_CONEXION });
  });

  it('debería reintentar una vez un GET que falla con 5xx', async () => {
    vi.useFakeTimers();
    const p = firstValueFrom(http.get(`${API_BASE}/envios/1`));
    ctrl.expectOne(`${API_BASE}/envios/1`).flush({ error: 'x' }, { status: 500, statusText: 'x' });
    await vi.advanceTimersByTimeAsync(600);
    ctrl.expectOne(`${API_BASE}/envios/1`).flush({ ok: true });
    expect(await p).toEqual({ ok: true });
  });

  it('no debería reintentar un GET con 404', async () => {
    const p = firstValueFrom(http.get(`${API_BASE}/envios/9`));
    ctrl
      .expectOne(`${API_BASE}/envios/9`)
      .flush({ error: 'No existe' }, { status: 404, statusText: 'x' });
    await expect(p).rejects.toMatchObject({ status: 404 });
  });

  it('nunca debería reintentar un POST', async () => {
    const p = firstValueFrom(http.post(`${API_BASE}/envios/crear`, {}));
    ctrl
      .expectOne(`${API_BASE}/envios/crear`)
      .flush({ error: 'x' }, { status: 500, statusText: 'x' });
    await expect(p).rejects.toMatchObject({ status: 500 });
    ctrl.expectNone(`${API_BASE}/envios/crear`);
  });

  it('debería cortar a los 15 s con TIEMPO_AGOTADO', async () => {
    vi.useFakeTimers();
    const p = firstValueFrom(http.post(`${API_BASE}/lento`, {})).catch((e: unknown) => e);
    ctrl.expectOne(`${API_BASE}/lento`);
    await vi.advanceTimersByTimeAsync(TIEMPO_MAXIMO_MS + 1);
    expect(await p).toMatchObject({ status: 408, codigoInterno: TIEMPO_AGOTADO });
  });

  it('debería registrar como DEBUG los 404 marcados con SILENCIAR_404 y las respuestas exitosas', async () => {
    const p = firstValueFrom(
      http.get(`${API_BASE}/envios/3`, { context: new HttpContext().set(SILENCIAR_404, true) }),
    );
    ctrl
      .expectOne(`${API_BASE}/envios/3`)
      .flush({ error: 'No existe' }, { status: 404, statusText: 'x' });
    await p.catch(() => undefined);
    const ok = firstValueFrom(http.get(`${API_BASE}/zonas?x=1`));
    ctrl.expectOne(`${API_BASE}/zonas?x=1`).flush([]);
    await ok;
    expect(log.de('WARN')).toHaveLength(0);
    expect(log.de('DEBUG').some((m) => m.startsWith('GET /zonas → 200'))).toBe(true);
  });

  it('no debería tocar peticiones fuera de la API', async () => {
    const p = firstValueFrom(http.get('https://otro.sitio/x'));
    ctrl.expectOne('https://otro.sitio/x').flush({ a: 1 });
    expect(await p).toEqual({ a: 1 });
    expect(log.eventos).toHaveLength(0);
  });
});
