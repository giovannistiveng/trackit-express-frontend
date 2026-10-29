import { ApiError } from '../../core/http/api-error';
import { AuthPort, DriverProfilePort } from '../../core/ports';
import { SessionService } from '../../core/auth/session.service';
import { TestBed } from '@angular/core/testing';
import { ADMIN, CONDUCTOR, jwtVigente } from '../../../testing/fixtures';
import { botonPorTexto, escribir, q, rechaza } from '../../../testing/fakes';
import { montar } from '../../../testing/pantallas';
import { LoginPage, MENSAJE_CREDENCIALES } from './login.page';
import { MENSAJE_CORREO_DUPLICADO, RegistroPage } from './registro.page';
import { ToastService } from '../../shared/ui/toast.service';

function diferido<T>() {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((a, b) => ((resolver = a), (rechazar = b)));
  return { promesa, resolver, rechazar };
}

describe('CU-001 RegistroPage', () => {
  let auth: { registrar: ReturnType<typeof vi.fn>; iniciarSesion: ReturnType<typeof vi.fn> };
  beforeEach(() => (auth = { registrar: vi.fn(), iniciarSesion: vi.fn() }));

  async function llenar(
    el: HTMLElement,
    o: { correo?: string; clave?: string; confirmar?: string } = {},
  ) {
    escribir(q(el, '#nombres'), 'Ana María');
    escribir(q(el, '#apellidos'), 'Gómez Peña');
    escribir(q(el, '#correo'), o.correo ?? 'ana@t.co');
    escribir(q(el, '#password'), o.clave ?? 'Clave1234');
    escribir(q(el, '#confirmar'), o.confirmar ?? o.clave ?? 'Clave1234');
  }

  it('Dado datos válidos, cuando envío, entonces registra, avisa y va a /login con el correo precargado', async () => {
    auth.registrar.mockResolvedValue({ id: 1, correo: 'ana@t.co', nombre: 'Ana María Gómez Peña' });
    const { el, navegar, estable } = await montar(RegistroPage, {
      providers: [{ provide: AuthPort, useValue: auth }],
    });
    const toast = vi.spyOn(TestBed.inject(ToastService), 'exito');
    el.querySelectorAll<HTMLInputElement>('input[type=radio]')[1].click();
    await llenar(el);
    botonPorTexto(el, 'Crear cuenta').click();
    await estable();
    expect(auth.registrar).toHaveBeenCalledWith({
      nombre: 'Ana María Gómez Peña',
      correo: 'ana@t.co',
      password: 'Clave1234',
      rol: '3',
    });
    expect(toast).toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith(['/login'], { queryParams: { correo: 'ana@t.co' } });
  });

  it('Dado un correo ya registrado, cuando envío, entonces el campo correo muestra el aviso y no navega', async () => {
    auth.registrar.mockImplementation(rechaza(new ApiError(400, 'El correo ya está registrado')));
    const { el, navegar, estable } = await montar(RegistroPage, {
      providers: [{ provide: AuthPort, useValue: auth }],
    });
    await llenar(el);
    botonPorTexto(el, 'Crear cuenta').click();
    await estable();
    expect(q(el, '#correo-error').textContent).toContain(MENSAJE_CORREO_DUPLICADO);
    expect(q(el, '#correo').getAttribute('aria-invalid')).toBe('true');
    expect(navegar).not.toHaveBeenCalled();
    escribir(q(el, '#correo'), 'otro@t.co');
    await estable();
    expect(el.textContent).not.toContain(MENSAJE_CORREO_DUPLICADO);
  });

  it('debería marcar los requisitos de la contraseña y la coincidencia en tiempo real', async () => {
    const { el, estable } = await montar(RegistroPage, {
      providers: [{ provide: AuthPort, useValue: auth }],
    });
    escribir(q(el, '#password'), 'abc');
    await estable();
    expect(q(el, '#requisitos').textContent).toContain('Al menos 8 caracteres: pendiente');
    escribir(q(el, '#password'), 'Clave1234');
    escribir(q(el, '#confirmar'), 'Clave12345');
    await estable();
    expect(q(el, '#requisitos').textContent).toContain('Un número: cumplido');
    expect(q(el, '#confirmar-error').textContent).toContain('no coinciden');
  });

  it('no debería enviar con datos inválidos (nombre con números, nombre demasiado largo)', async () => {
    const { el, estable } = await montar(RegistroPage, {
      providers: [{ provide: AuthPort, useValue: auth }],
    });
    await llenar(el);
    escribir(q(el, '#nombres'), 'Ana 2');
    botonPorTexto(el, 'Crear cuenta').click();
    await estable();
    expect(q(el, '#nombres-error')).toBeTruthy();
    escribir(q(el, '#nombres'), 'A'.repeat(70));
    escribir(q(el, '#apellidos'), 'B'.repeat(60));
    await estable();
    expect(el.textContent).toContain('no pueden pasar de 120');
    botonPorTexto(el, 'Crear cuenta').click();
    expect(auth.registrar).not.toHaveBeenCalled();
  });

  it('debería bloquear el botón mientras hay una petición en curso y mostrar errores genéricos', async () => {
    const d = diferido<never>();
    auth.registrar.mockReturnValue(d.promesa);
    const { el, estable } = await montar(RegistroPage, {
      providers: [{ provide: AuthPort, useValue: auth }],
    });
    await llenar(el);
    botonPorTexto(el, 'Crear cuenta').click();
    await estable();
    expect(botonPorTexto(el, 'Creando cuenta…').disabled).toBe(true);
    botonPorTexto(el, 'Creando cuenta…').click();
    expect(auth.registrar).toHaveBeenCalledTimes(1);
    d.rechazar(new ApiError(500, 'Error interno del servidor'));
    await estable();
    expect(q(el, '[role="alert"]').textContent).toContain('Algo salió mal');
  });

  it('solo debería ofrecer Cliente y Conductor', async () => {
    const { el } = await montar(RegistroPage, {
      providers: [{ provide: AuthPort, useValue: auth }],
    });
    const opciones = Array.from(el.querySelectorAll('fieldset label span span:first-child')).map(
      (l) => l.textContent?.trim(),
    );
    expect(opciones).toEqual(['Cliente', 'Conductor']);
    q<HTMLButtonElement>(el, 'button[aria-pressed]').click();
  });
});

describe('CU-002 LoginPage', () => {
  let auth: { registrar: ReturnType<typeof vi.fn>; iniciarSesion: ReturnType<typeof vi.fn> };
  let perfil: { obtener: ReturnType<typeof vi.fn> };
  let providers: object[];
  beforeEach(() => {
    auth = { registrar: vi.fn(), iniciarSesion: vi.fn() };
    perfil = { obtener: vi.fn(async () => ({ idConductor: 1, estadoAprobacion: 'Aprobado' })) };
    providers = [
      { provide: AuthPort, useValue: auth },
      { provide: DriverProfilePort, useValue: perfil },
    ];
  });

  async function entrar(el: HTMLElement, estable: () => Promise<void>) {
    escribir(q(el, '#correo'), 'a@t.co');
    escribir(q(el, '#password'), 'Clave1234');
    botonPorTexto(el, 'Iniciar sesión').click();
    await estable();
  }

  it.each([
    [ADMIN, '/admin'],
    [CONDUCTOR, '/conductor'],
  ])(
    'Dado credenciales correctas, cuando entro, entonces guarda la sesión y redirige por rol (%#)',
    async (usuario, ruta) => {
      auth.iniciarSesion.mockResolvedValue({ usuario, token: jwtVigente() });
      const { el, navegarUrl, estable } = await montar(LoginPage, {
        providers: providers as never[],
      });
      await entrar(el, estable);
      expect(TestBed.inject(SessionService).usuario()).toEqual(usuario);
      expect(navegarUrl).toHaveBeenCalledWith(ruta);
      if (usuario.rol === '3') expect(perfil.obtener).toHaveBeenCalled();
    },
  );

  it('Dado credenciales incorrectas, cuando entro, entonces muestra el mensaje sin revelar cuál falló y no concede acceso', async () => {
    auth.iniciarSesion.mockImplementation(rechaza(new ApiError(401, 'Credenciales inválidas')));
    const { el, navegarUrl, estable } = await montar(LoginPage, {
      providers: providers as never[],
    });
    await entrar(el, estable);
    expect(q(el, '[role="alert"]').textContent).toContain(MENSAJE_CREDENCIALES);
    expect(TestBed.inject(SessionService).estaAutenticado()).toBe(false);
    expect(navegarUrl).not.toHaveBeenCalled();
  });

  it('debería rechazar un token sin expiración y registrar fallos inesperados', async () => {
    auth.iniciarSesion.mockResolvedValue({ usuario: ADMIN, token: 'sin-exp' });
    const { el, estable } = await montar(LoginPage, { providers: providers as never[] });
    await entrar(el, estable);
    expect(el.textContent).toContain('Algo salió mal');
    auth.iniciarSesion.mockImplementation(rechaza(new TypeError('x')));
    botonPorTexto(el, 'Iniciar sesión').click();
    await estable();
    expect(el.textContent).toContain('Algo salió mal');
  });

  it('debería validar el formato del correo antes de llamar a la API', async () => {
    const { el, estable } = await montar(LoginPage, { providers: providers as never[] });
    escribir(q(el, '#correo'), 'no-es-correo');
    botonPorTexto(el, 'Iniciar sesión').click();
    await estable();
    expect(q(el, '#correo-error')).toBeTruthy();
    expect(q(el, '#password-error')).toBeTruthy();
    expect(auth.iniciarSesion).not.toHaveBeenCalled();
    q<HTMLButtonElement>(el, 'button[aria-pressed]').click();
    await estable();
    expect(q<HTMLInputElement>(el, '#password').type).toBe('text');
  });

  it('debería precargar el correo y avisar si la sesión terminó', async () => {
    const { el } = await montar(LoginPage, {
      providers: providers as never[],
      inputs: { correo: 'ana@t.co', motivo: 'sesion' },
    });
    expect(q<HTMLInputElement>(el, '#correo').value).toBe('ana@t.co');
    expect(q(el, '[role="status"]').textContent).toContain('Tu sesión terminó');
  });

  it('debería avisar cuenta creada con motivo=registro', async () => {
    const { el } = await montar(LoginPage, {
      providers: providers as never[],
      inputs: { motivo: 'registro' },
    });
    expect(el.textContent).toContain('Cuenta creada');
  });
});
