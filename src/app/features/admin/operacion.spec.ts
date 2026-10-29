import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ADMIN, buildEnvio } from '../../../testing/fixtures';
import { FakeAdminMetrics } from '../../../testing/admin-fake';
import { botonPorTexto, escribir, q, rechaza } from '../../../testing/fakes';
import { montar } from '../../../testing/pantallas';
import { EnvioAdmin, MensajeContactoRecibido } from '../../core/domain';
import { ApiError } from '../../core/http/api-error';
import { AdminMetricsPort, AdminOperationsPort, ZonesPort } from '../../core/ports';
import { ToastService } from '../../shared/ui/toast.service';
import { DashboardPage } from './dashboard.page';
import { EnviosAdminPage, TAMANO_PAGINA_ENVIOS } from './envios-admin.page';
import { MensajesPage } from './mensajes.page';
import { ZonasPage } from './zonas.page';

const ZONAS = [
  { id: 1, nombre: 'Casco Urbano', tarifaBase: 5000 },
  { id: 2, nombre: 'Silvania', tarifaBase: 12000 },
];

function envioAdmin(id: number, estado: EnvioAdmin['estado']): EnvioAdmin {
  return {
    ...buildEnvio({ id, estado }),
    cliente: { nombre: 'Laura', correo: 'l@t.co' },
    conductorNombre: estado === 'Pendiente' ? null : 'Camilo',
    zona: 'Silvania',
  };
}

function operaciones() {
  return {
    envios: vi.fn(async () => ({
      items: [envioAdmin(2, 'Asignado'), envioAdmin(1, 'Entregado')],
      total: 30,
      pagina: 1,
      tamano: TAMANO_PAGINA_ENVIOS,
    })),
    cancelar: vi.fn(async () => buildEnvio({ estado: 'Cancelado' })),
    actualizarTarifa: vi.fn(async (id: number, t: number) => ({
      ...ZONAS.find((z) => z.id === id)!,
      tarifaBase: t,
    })),
    mensajes: vi.fn(async () => ({
      items: [
        {
          id: 3,
          nombre: 'Tienda',
          correo: 't@x.co',
          telefono: '3105551234',
          asunto: 'Empresas',
          mensaje: 'Hola',
          atendido: false,
          fecha: new Date(),
        } as MensajeContactoRecibido,
      ],
      total: 1,
      pagina: 1,
      tamano: 20,
    })),
    atenderMensaje: vi.fn(async () => undefined),
  };
}

async function montarAdmin<T>(componente: Type<T>, ops = operaciones()) {
  const r = await montar(componente, {
    usuario: ADMIN,
    providers: [
      { provide: AdminOperationsPort, useValue: ops },
      { provide: ZonesPort, useValue: { listar: vi.fn(async () => ZONAS) } },
    ],
  });
  await r.estable();
  return { ...r, ops };
}

describe('EnviosAdminPage', () => {
  it('lista, filtra, pagina y cancela con motivo obligatorio', async () => {
    const { el, ops, estable } = await montarAdmin(EnviosAdminPage);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(el.textContent).toContain('30 envíos · página 1 de 3');
    expect(el.querySelectorAll('#zona option')).toHaveLength(3);
    escribir(q(el, '#texto'), 'Laura');
    q<HTMLSelectElement>(el, '#estado').value = 'Asignado';
    q(el, '#estado').dispatchEvent(new Event('change'));
    await estable();
    expect(ops.envios).toHaveBeenLastCalledWith(
      expect.objectContaining({ texto: 'Laura', estado: 'Asignado', pagina: 1 }),
    );
    botonPorTexto(el, 'Siguiente').click();
    await estable();
    expect(ops.envios).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 2 }));
    // Solo el envío activo se puede cancelar
    expect(el.querySelectorAll('[aria-label^="Cancelar el envío"]')).toHaveLength(1);
    q<HTMLButtonElement>(el, '[aria-label="Cancelar el envío 2"]').click();
    await estable();
    const dialogo = q(el, '[role="dialog"]');
    expect(dialogo.textContent).toContain('Se avisará al cliente y al conductor');
    botonPorTexto(dialogo, 'Cancelar envío').click();
    await estable();
    expect(dialogo.textContent).toContain('Escribe el motivo');
    expect(ops.cancelar).not.toHaveBeenCalled();
    escribir(q(el, '#motivo'), 'Dirección inexistente');
    await estable();
    botonPorTexto(q(el, '[role="dialog"]'), 'Cancelar envío').click();
    await estable();
    expect(ops.cancelar).toHaveBeenCalledWith(2, 'Dirección inexistente');
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it('muestra vacío, error del backend al cancelar y error de carga', async () => {
    const ops = operaciones();
    ops.cancelar.mockImplementation(
      rechaza(new ApiError(400, 'El envío ya está entregado y no se puede cancelar')),
    );
    const { el, estable } = await montarAdmin(EnviosAdminPage, ops);
    q<HTMLButtonElement>(el, '[aria-label="Cancelar el envío 2"]').click();
    await estable();
    escribir(q(el, '#motivo'), 'Motivo válido');
    await estable();
    botonPorTexto(q(el, '[role="dialog"]'), 'Cancelar envío').click();
    await estable();
    expect(q(el, '[role="dialog"] [role="alert"]').textContent).toContain('ya terminó');
    botonPorTexto(q(el, '[role="dialog"]'), 'Volver').click();
    ops.envios.mockImplementation(async () => ({ items: [], total: 0, pagina: 1, tamano: 12 }));
    botonPorTexto(el, /Filtrar/).click();
    await estable();
    expect(el.textContent).toContain('Ningún envío coincide');
    ops.envios.mockImplementation(rechaza(new ApiError(500, 'x')));
    botonPorTexto(el, /Filtrar/).click();
    await estable();
    expect(q(el, '[role="alert"]').textContent).toContain('Algo salió mal');
  });
});

describe('ZonasPage', () => {
  it('guarda la nueva tarifa solo si cambió y es válida', async () => {
    const { el, ops, estable } = await montarAdmin(ZonasPage);
    const guardar = () =>
      q<HTMLButtonElement>(el, '[aria-label="Guardar la tarifa de Casco Urbano"]');
    expect(guardar().disabled).toBe(true);
    const input = q<HTMLInputElement>(el, '#tarifa-1');
    input.value = '-5';
    input.dispatchEvent(new Event('input'));
    await estable();
    expect(guardar().disabled).toBe(true);
    input.value = '5500';
    input.dispatchEvent(new Event('input'));
    await estable();
    guardar().click();
    await estable();
    expect(ops.actualizarTarifa).toHaveBeenCalledWith(1, 5500);
    expect(el.textContent).toMatch(/Actual: \$\s5\.500/);
    expect(guardar().disabled).toBe(true);
  });

  it('informa errores al guardar y al cargar', async () => {
    const ops = operaciones();
    ops.actualizarTarifa.mockImplementation(
      rechaza(new ApiError(400, 'La tarifa base debe ser un valor entre 0 y 1.000.000 COP')),
    );
    const { el, estable } = await montarAdmin(ZonasPage, ops);
    const toast = vi.spyOn(TestBed.inject(ToastService), 'error');
    const input = q<HTMLInputElement>(el, '#tarifa-2');
    input.value = '13000';
    input.dispatchEvent(new Event('input'));
    await estable();
    q<HTMLButtonElement>(el, '[aria-label="Guardar la tarifa de Silvania"]').click();
    await estable();
    expect(toast).toHaveBeenCalledWith('La tarifa debe estar entre $ 0 y $ 1.000.000.');
  });
});

describe('MensajesPage', () => {
  it('lista pendientes, marca atendido y cambia el filtro', async () => {
    const { el, ops, estable } = await montarAdmin(MensajesPage);
    expect(el.textContent).toContain('Tienda');
    expect(q<HTMLAnchorElement>(el, 'a[href^="mailto:"]').href).toContain('mailto:t@x.co');
    botonPorTexto(el, /Atendido/).click();
    await estable();
    expect(ops.atenderMensaje).toHaveBeenCalledWith(3);
    q<HTMLInputElement>(el, 'input[type=checkbox]').click();
    await estable();
    expect(ops.mensajes).toHaveBeenLastCalledWith(false, 1);
  });

  it('muestra vacío y error', async () => {
    const ops = operaciones();
    ops.mensajes.mockImplementationOnce(async () => ({
      items: [],
      total: 0,
      pagina: 1,
      tamano: 20,
    }));
    const { el, estable } = await montarAdmin(MensajesPage, ops);
    expect(el.textContent).toContain('No hay mensajes por aquí.');
    ops.mensajes.mockImplementation(rechaza(new ApiError(500, 'x')));
    q<HTMLInputElement>(el, 'input[type=checkbox]').click();
    await estable();
    expect(q(el, '[role="alert"]')).toBeTruthy();
  });
});

describe('DashboardPage (dona y aviso de pendientes)', () => {
  it('dibuja la dona por estado, la tasa de entrega y enlaza a los conductores por aprobar', async () => {
    const { el, estable } = await montar(DashboardPage, {
      usuario: ADMIN,
      providers: [{ provide: AdminMetricsPort, useValue: new FakeAdminMetrics() }],
    });
    await estable();
    expect(el.querySelectorAll('svg circle[stroke-dasharray]').length).toBeGreaterThanOrEqual(4);
    expect(q(el, 'svg[role="img"]').getAttribute('aria-label')).toBe('Tasa de entrega 93 %');
    expect(el.textContent).toContain('3 conductores esperan aprobación');
    expect(el.textContent).toContain('Cancelados');
  });
});
