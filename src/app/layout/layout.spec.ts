import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ADMIN, CLIENTE, CONDUCTOR } from '../../testing/fixtures';
import { botonPorTexto, q } from '../../testing/fakes';
import { configurar, montar } from '../../testing/pantallas';
import { App } from '../app';
import { routes } from '../app.routes';
import { SessionService } from '../core/auth/session.service';
import { DriverProfilePort } from '../core/ports';
import { CONDUCTOR_ROUTES } from '../features/conductor/conductor.routes';
import { CLIENTE_ROUTES } from '../features/cliente/cliente.routes';
import { ADMIN_ROUTES } from '../features/admin/admin.routes';
import { BannerConexionComponent } from './banner-conexion.component';
import { ConexionService } from './conexion.service';
import { NoEncontradaComponent } from './no-encontrada.component';
import { ShellComponent } from './shell.component';

describe('ShellComponent', () => {
  it.each([
    [CLIENTE, ['Nuevo envío', 'Mis envíos'], 'Cliente'],
    [CONDUCTOR, ['Servicios', 'Ganancias', 'Mi perfil'], 'Conductor'],
    [ADMIN, ['Panel', 'Envíos', 'Conductores', 'Zonas', 'Mensajes', 'Auditoría'], 'Administración'],
  ])('debería mostrar el menú del rol (%#)', async (usuario, menu, rol) => {
    const { el } = await montar(ShellComponent, { usuario });
    const enlaces = Array.from(q(el, 'nav[aria-label="Principal"]').querySelectorAll('a')).map(
      (a) => a.textContent?.trim(),
    );
    expect(enlaces).toEqual(menu);
    expect(el.textContent).toContain(rol);
    expect(el.textContent).toContain(usuario.nombre);
  });

  it('Cerrar sesión (menú de la cuenta) debería salir e ir a /login', async () => {
    const { el, navegar, estable } = await montar(ShellComponent, { usuario: CLIENTE });
    q<HTMLButtonElement>(el, '[aria-controls="menu-usuario"]').click();
    await estable();
    expect(q(el, '#menu-usuario').textContent).toContain('Mi cuenta');
    botonPorTexto(el, 'Cerrar sesión').click();
    expect(TestBed.inject(SessionService).estaAutenticado()).toBe(false);
    expect(navegar).toHaveBeenCalledWith(['/login']);
  });

  it('sin sesión no debería mostrar menú', async () => {
    const { el } = await montar(ShellComponent);
    expect(el.querySelectorAll('nav a')).toHaveLength(0);
  });
});

describe('BannerConexionComponent', () => {
  it('debería aparecer sin conexión y ocultarse al volver', async () => {
    const { el, estable } = await montar(BannerConexionComponent);
    expect(el.textContent).not.toContain('Sin conexión');
    window.dispatchEvent(new Event('offline'));
    await estable();
    expect(q(el, '[role="status"]').textContent).toContain('Sin conexión');
    window.dispatchEvent(new Event('online'));
    await estable();
    expect(el.textContent).not.toContain('Sin conexión');
    TestBed.inject(ConexionService).ngOnDestroy();
  });
});

describe('NoEncontradaComponent y App', () => {
  it('debería ofrecer volver al inicio del rol', async () => {
    const { el } = await montar(NoEncontradaComponent, { usuario: CONDUCTOR });
    expect(q<HTMLAnchorElement>(el, 'a').getAttribute('href')).toBe('/conductor');
  });

  it('la raíz debería incluir el enlace para saltar al contenido', async () => {
    const { el } = await montar(App);
    expect(q(el, 'a[href="#contenido"]').textContent).toContain('Saltar al contenido');
  });
});

describe('rutas', () => {
  it('la raíz lleva al panel del rol con sesión y muestra el sitio público sin ella', async () => {
    configurar({ usuario: ADMIN });
    const raiz = routes.find((r) => r.path === '')!;
    const guard = raiz.canActivate![0] as () => unknown;
    expect(String(TestBed.runInInjectionContext(guard))).toBe('/admin');
    TestBed.inject(SessionService).cerrar();
    expect(TestBed.runInInjectionContext(guard)).toBe(true);
  });

  it('todas las rutas perezosas deberían cargar su componente', async () => {
    const perezosas = [
      ...routes,
      ...CLIENTE_ROUTES,
      ...ADMIN_ROUTES,
      ...(CONDUCTOR_ROUTES[0].children ?? []),
    ].filter((r) => r.loadComponent);
    for (const r of perezosas) expect(await r.loadComponent!()).toBeTruthy();
    for (const r of routes.filter((x) => x.loadChildren))
      expect(await r.loadChildren!()).toBeTruthy();
  });

  it('las rutas del conductor deberían cargar el perfil antes de entrar', async () => {
    const obtener = vi.fn(async () => ({ idConductor: 1, estadoAprobacion: 'Aprobado' }));
    configurar({
      usuario: CONDUCTOR,
      providers: [{ provide: DriverProfilePort, useValue: { obtener } }],
    });
    const guard = CONDUCTOR_ROUTES[0].canActivate![0] as () => Promise<boolean>;
    expect(await TestBed.runInInjectionContext(guard)).toBe(true);
    expect(obtener).toHaveBeenCalled();
    expect(TestBed.inject(Router)).toBeTruthy();
  });
});
