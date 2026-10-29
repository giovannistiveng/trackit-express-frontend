import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ADMIN, CLIENTE, CONDUCTOR, crearJwt, jwtVigente } from '../../../testing/fixtures';
import { API_BASE, FakeSessionStorage, provideFakesBase } from '../../../testing/fakes';
import { apiInterceptor } from '../http/api.interceptor';
import { SessionStoragePort } from '../ports';
import { authInterceptor } from './auth.interceptor';
import { authGuard, invitadoGuard, roleGuard } from './guards';
import { CLAVE_SESION, SessionService } from './session.service';

function preparar() {
  TestBed.configureTestingModule({
    providers: [
      provideFakesBase(),
      provideRouter([]),
      provideHttpClient(withInterceptors([authInterceptor, apiInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return {
    session: TestBed.inject(SessionService),
    storage: TestBed.inject(SessionStoragePort) as FakeSessionStorage,
  };
}

describe('SessionService', () => {
  afterEach(() => vi.useRealTimers());

  it('debería guardar la sesión al iniciar y limpiarla al cerrar', () => {
    const { session, storage } = preparar();
    const token = jwtVigente();
    expect(session.iniciar(CLIENTE, token)).toBe(true);
    expect(session.estaAutenticado()).toBe(true);
    expect(JSON.parse(storage.leer(CLAVE_SESION) as string)).toEqual({ token, user: CLIENTE });
    session.cerrar();
    expect(session.estaAutenticado()).toBe(false);
    expect(storage.leer(CLAVE_SESION)).toBeNull();
  });

  it('debería rechazar un token sin exp válido', () => {
    const { session } = preparar();
    expect(session.iniciar(CLIENTE, 'malo')).toBe(false);
    expect(session.iniciar(CLIENTE, crearJwt(1))).toBe(false);
  });

  it('debería restaurar una sesión vigente', () => {
    const { session, storage } = preparar();
    storage.guardar(CLAVE_SESION, JSON.stringify({ token: jwtVigente(), user: CONDUCTOR }));
    session.restaurar();
    expect(session.rol()).toBe('3');
    expect(session.inicioDelRol()).toBe('/conductor');
  });

  it('debería cerrar sesión al arrancar si el token ya venció', () => {
    const { session, storage } = preparar();
    storage.guardar(
      CLAVE_SESION,
      JSON.stringify({ token: crearJwt(Math.floor(Date.now() / 1000) - 10), user: CLIENTE }),
    );
    session.restaurar();
    expect(session.estaAutenticado()).toBe(false);
    expect(storage.leer(CLAVE_SESION)).toBeNull();
    expect(session.ultimoCierre()).toBe('expirada');
  });

  it('debería descartar datos guardados corruptos', () => {
    const { session, storage } = preparar();
    storage.guardar(CLAVE_SESION, '{no json');
    session.restaurar();
    expect(storage.leer(CLAVE_SESION)).toBeNull();
    storage.guardar(CLAVE_SESION, JSON.stringify({ token: 'x' }));
    session.restaurar();
    expect(session.estaAutenticado()).toBe(false);
  });

  it('debería cerrar automáticamente al vencer el token', () => {
    vi.useFakeTimers();
    const { session } = preparar();
    session.iniciar(CLIENTE, crearJwt(Math.floor(Date.now() / 1000) + 60));
    vi.advanceTimersByTime(61_000);
    expect(session.estaAutenticado()).toBe(false);
    expect(session.ultimoCierre()).toBe('expirada');
  });

  it.each([
    [ADMIN, '/admin'],
    [CLIENTE, '/cliente'],
    [CONDUCTOR, '/conductor'],
  ])('debería redirigir al inicio del rol %#', (u, ruta) => {
    const { session } = preparar();
    session.iniciar(u, jwtVigente());
    expect(session.inicioDelRol()).toBe(ruta);
  });

  it('sin sesión el inicio es /login', () =>
    expect(preparar().session.inicioDelRol()).toBe('/login'));
});

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let session: SessionService;
  let router: Router;

  beforeEach(() => {
    session = preparar().session;
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });
  afterEach(() => ctrl.verify());

  it('debería añadir Authorization solo a la API', async () => {
    const token = jwtVigente();
    session.iniciar(CLIENTE, token);
    void firstValueFrom(http.get(`${API_BASE}/zonas`));
    expect(ctrl.expectOne(`${API_BASE}/zonas`).request.headers.get('Authorization')).toBe(
      `Bearer ${token}`,
    );
    void firstValueFrom(http.get('https://tiles.osm/x'));
    expect(ctrl.expectOne('https://tiles.osm/x').request.headers.has('Authorization')).toBe(false);
  });

  it('no debería añadir Authorization sin sesión', () => {
    void firstValueFrom(http.post(`${API_BASE}/auth/login`, {}));
    expect(ctrl.expectOne(`${API_BASE}/auth/login`).request.headers.has('Authorization')).toBe(
      false,
    );
  });

  it('debería cerrar sesión y llevar a /login ante un 401', async () => {
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    session.iniciar(CLIENTE, jwtVigente());
    const p = firstValueFrom(http.get(`${API_BASE}/clientes/envios`)).catch((e: unknown) => e);
    ctrl
      .expectOne(`${API_BASE}/clientes/envios`)
      .flush({ error: 'Token inválido o expirado' }, { status: 401, statusText: 'x' });
    await p;
    expect(session.estaAutenticado()).toBe(false);
    expect(nav).toHaveBeenCalledWith(['/login'], { queryParams: { motivo: 'sesion' } });
  });

  it('no debería cerrar sesión ante un 403 (falta de permiso, no sesión vencida)', async () => {
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    session.iniciar(CLIENTE, jwtVigente());
    const p = firstValueFrom(http.get(`${API_BASE}/envios/9`)).catch((e: unknown) => e);
    ctrl
      .expectOne(`${API_BASE}/envios/9`)
      .flush({ error: 'No tienes permiso' }, { status: 403, statusText: 'x' });
    expect(await p).toMatchObject({ status: 403 });
    expect(session.estaAutenticado()).toBe(true);
    expect(nav).not.toHaveBeenCalled();
  });

  it('no debería cerrar sesión por un 401 en el login', async () => {
    session.iniciar(CLIENTE, jwtVigente());
    const p = firstValueFrom(http.post(`${API_BASE}/auth/login`, {})).catch((e: unknown) => e);
    ctrl
      .expectOne(`${API_BASE}/auth/login`)
      .flush({ error: 'Credenciales inválidas' }, { status: 401, statusText: 'x' });
    await p;
    expect(session.estaAutenticado()).toBe(true);
  });
});

describe('guards', () => {
  const ejecutar = (g: ReturnType<typeof roleGuard>) =>
    TestBed.runInInjectionContext(() => g({} as never, {} as never));
  const url = (r: unknown) => (r === true ? true : String(r));

  it('authGuard deja pasar con sesión y redirige a /login sin ella', () => {
    const { session } = preparar();
    expect(url(ejecutar(authGuard))).toBe('/login');
    session.iniciar(CLIENTE, jwtVigente());
    expect(ejecutar(authGuard)).toBe(true);
  });

  it('roleGuard deja pasar el rol correcto y manda a su inicio a otro rol', () => {
    const { session } = preparar();
    expect(url(ejecutar(roleGuard(['2'])))).toBe('/login');
    session.iniciar(CONDUCTOR, jwtVigente());
    expect(ejecutar(roleGuard(['3']))).toBe(true);
    expect(url(ejecutar(roleGuard(['2'])))).toBe('/conductor');
  });

  it('invitadoGuard manda al inicio del rol si ya hay sesión', () => {
    const { session } = preparar();
    expect(ejecutar(invitadoGuard)).toBe(true);
    session.iniciar(ADMIN, jwtVigente());
    expect(url(ejecutar(invitadoGuard))).toBe('/admin');
  });
});
