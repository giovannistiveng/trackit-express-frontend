import { TestBed } from '@angular/core/testing';
import { CLIENTE, CONDUCTOR } from '../../../testing/fixtures';
import { botonPorTexto, escribir, q, rechaza } from '../../../testing/fakes';
import { montar } from '../../../testing/pantallas';
import { SessionService } from '../../core/auth/session.service';
import { PerfilUsuario } from '../../core/domain';
import { ApiError } from '../../core/http/api-error';
import { AccountPort } from '../../core/ports';
import { CuentaPage } from './cuenta.page';

const PERFIL: PerfilUsuario = {
  id: 1,
  nombre: 'Cli',
  correo: 'cli@t.co',
  rol: '2',
  nombreRol: 'Cliente',
  telefono: null,
  fechaRegistro: new Date('2026-10-01T12:00:00Z'),
};

function puerto() {
  return {
    perfil: vi.fn(async () => PERFIL),
    actualizar: vi.fn(async (d: { nombre: string; telefono: string }) => ({
      ...PERFIL,
      nombre: d.nombre,
      telefono: d.telefono || null,
    })),
    cambiarPassword: vi.fn(async () => undefined),
  };
}

async function montarCuenta(p = puerto(), usuario = CLIENTE) {
  const r = await montar(CuentaPage, {
    usuario,
    providers: [{ provide: AccountPort, useValue: p }],
  });
  await r.estable();
  return { ...r, p };
}

describe('CuentaPage', () => {
  it('muestra el perfil y guarda nombre y teléfono, actualizando la sesión', async () => {
    const { el, p, estable } = await montarCuenta();
    expect(el.textContent).toContain('cli@t.co');
    expect(el.textContent).toContain('Desde');
    expect(botonPorTexto(el, /Guardar cambios/).disabled).toBe(true);
    escribir(q(el, '#telefono'), '12');
    await estable();
    expect(el.textContent).toContain('Escribe entre 7 y 15 dígitos.');
    escribir(q(el, '#nombre'), 'Laura Méndez');
    escribir(q(el, '#telefono'), '310 555 1234');
    await estable();
    botonPorTexto(el, /Guardar cambios/).click();
    await estable();
    expect(p.actualizar).toHaveBeenCalledWith({ nombre: 'Laura Méndez', telefono: '310 555 1234' });
    expect(TestBed.inject(SessionService).usuario()?.nombre).toBe('Laura Méndez');
  });

  it('cambia la contraseña y explica si la actual es incorrecta', async () => {
    const p = puerto();
    p.cambiarPassword.mockImplementationOnce(
      rechaza(new ApiError(400, 'La contraseña actual no es correcta')),
    );
    p.perfil.mockImplementation(async () => ({ ...PERFIL, rol: '3', nombreRol: 'Conductor' }));
    const { el, estable } = await montarCuenta(p, CONDUCTOR);
    expect(el.textContent).toContain('Para coordinar las entregas.');
    escribir(q(el, '#actual'), 'Mala1234');
    escribir(q(el, '#nueva'), 'Nueva2026');
    await estable();
    expect(el.querySelectorAll('#requisitos .text-exito')).toHaveLength(3);
    botonPorTexto(el, /Actualizar contraseña/).click();
    await estable();
    expect(q(el, '[role="alert"]').textContent).toContain('La contraseña actual no es correcta.');
    escribir(q(el, '#actual'), 'Clave1234');
    escribir(q(el, '#nueva'), 'Nueva2026');
    botonPorTexto(el, /Actualizar contraseña/).click();
    await estable();
    expect(p.cambiarPassword).toHaveBeenLastCalledWith('Clave1234', 'Nueva2026');
    expect(q<HTMLInputElement>(el, '#actual').value).toBe('');
  });

  it('muestra error con Reintentar si no carga el perfil, y errores al guardar', async () => {
    const p = puerto();
    p.perfil.mockImplementationOnce(rechaza(new ApiError(500, 'x')));
    p.actualizar.mockImplementation(
      rechaza(new ApiError(400, 'El teléfono debe tener entre 7 y 15 dígitos')),
    );
    const { el, estable } = await montarCuenta(p);
    expect(q(el, '[role="alert"]').textContent).toContain('No se pudo cargar tu perfil.');
    botonPorTexto(el, /Reintentar/).click();
    await estable();
    escribir(q(el, '#nombre'), 'Otro Nombre');
    await estable();
    botonPorTexto(el, /Guardar cambios/).click();
    await estable();
    expect(el.textContent).toContain('El teléfono debe tener entre 7 y 15 dígitos.');
  });
});
