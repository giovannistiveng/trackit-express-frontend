import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ADMIN, buildEnvio } from '../../../testing/fixtures';
import { FakeAdminMetrics } from '../../../testing/admin-fake';
import { botonPorTexto, escribir, q, rechaza } from '../../../testing/fakes';
import { montar } from '../../../testing/pantallas';
import {
  DatosZona,
  EnvioAdmin,
  MensajeContactoRecibido,
  TarifaVehiculo,
  Zona,
} from '../../core/domain';
import { SelectorMapaComponent } from '../../shared/ui/selector-mapa.component';
import { By } from '@angular/platform-browser';
import { ApiError } from '../../core/http/api-error';
import { AdminMetricsPort, AdminOperationsPort, ZonesPort } from '../../core/ports';
import { ToastService } from '../../shared/ui/toast.service';
import { DashboardPage } from './dashboard.page';
import { EnviosAdminPage, TAMANO_PAGINA_ENVIOS } from './envios-admin.page';
import { MensajesPage } from './mensajes.page';
import { ZonasPage } from './zonas.page';

const ZONAS: Zona[] = [
  {
    id: 1,
    nombre: 'Casco Urbano',
    tarifaBase: 0,
    centro: { lat: 4.3365, lon: -74.3638 },
    radioKm: 3.5,
    activa: true,
    descripcion: null,
  },
  {
    id: 2,
    nombre: 'Silvania',
    tarifaBase: 2000,
    centro: { lat: 4.4036, lon: -74.3881 },
    radioKm: 3,
    activa: true,
    descripcion: 'Municipio vecino',
  },
  {
    id: 3,
    nombre: 'Vereda Pekín',
    tarifaBase: 1500,
    centro: null,
    radioKm: 3,
    activa: false,
    descripcion: null,
  },
];

const TARIFAS: TarifaVehiculo[] = [
  { categoria: 'Moto Express', banderazo: 2000, porKm: 700, porMinuto: 50, minimo: 4500 },
  { categoria: 'Motocarro', banderazo: 4000, porKm: 950, porMinuto: 80, minimo: 8000 },
  { categoria: 'Camioneta', banderazo: 10000, porKm: 1600, porMinuto: 120, minimo: 18000 },
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
    zonas: vi.fn(async () => ZONAS.map((z) => ({ ...z }))),
    crearZona: vi.fn(async (d: DatosZona): Promise<Zona> => ({ id: 9, ...d })),
    actualizarZona: vi.fn(async (id: number, d: Partial<DatosZona>): Promise<Zona> => ({
      ...ZONAS.find((z) => z.id === id)!,
      ...d,
    })),
    tarifasVehiculo: vi.fn(async () => TARIFAS.map((t) => ({ ...t }))),
    actualizarTarifaVehiculo: vi.fn(async (t: TarifaVehiculo) => t),
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
    expect(el.querySelectorAll('#zona option')).toHaveLength(4);
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
  const cambiar = (input: HTMLInputElement, valor: string) => {
    input.value = valor;
    input.dispatchEvent(new Event('input'));
  };
  const texto = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ') ?? '';

  it('muestra las tarifas con ejemplos y guarda solo si cambió y es válida', async () => {
    const { el, ops, estable } = await montarAdmin(ZonasPage);
    const guardar = () =>
      q<HTMLButtonElement>(el, '[aria-label="Guardar la tarifa de Moto Express"]');
    expect(el.querySelectorAll('form[class*="tarjeta"]').length).toBeGreaterThanOrEqual(3);
    // Ejemplo: 2,5 km y 8 min en moto → 2.000 + 1.750 + 400 = 4.150 → mínimo 4.500
    expect(texto(el)).toContain('$ 4.500');
    expect(guardar().disabled).toBe(true);
    cambiar(q(el, '#tarifa-moto-express-banderazo'), '-5');
    await estable();
    expect(guardar().disabled).toBe(true);
    expect(el.textContent).toContain('Revisa los valores');
    cambiar(q(el, '#tarifa-moto-express-banderazo'), '2500.4');
    await estable();
    guardar().click();
    await estable();
    expect(ops.actualizarTarifaVehiculo).toHaveBeenCalledWith({
      categoria: 'Moto Express',
      banderazo: 2500,
      porKm: 700,
      porMinuto: 50,
      minimo: 4500,
    });
    expect(guardar().disabled).toBe(true);
  });

  it('informa errores al guardar una tarifa y al cargar', async () => {
    const ops = operaciones();
    ops.actualizarTarifaVehiculo.mockImplementation(
      rechaza(new ApiError(400, 'No se pudo guardar la tarifa ahora')),
    );
    const { el, estable } = await montarAdmin(ZonasPage, ops);
    const toast = vi.spyOn(TestBed.inject(ToastService), 'error');
    cambiar(q(el, '#tarifa-camioneta-porKm'), '1700');
    await estable();
    q<HTMLButtonElement>(el, '[aria-label="Guardar la tarifa de Camioneta"]').click();
    await estable();
    expect(toast).toHaveBeenCalledWith('No se pudo guardar la tarifa ahora.');

    TestBed.resetTestingModule();
    const ops2 = operaciones();
    ops2.zonas.mockImplementation(rechaza(new ApiError(500, 'x')));
    const r = await montarAdmin(ZonasPage, ops2);
    expect(q(r.el, '[role="alert"]').textContent).toContain('Algo salió mal');
  });

  it('lista las zonas con su estado y crea una zona nueva con el mapa', async () => {
    const { el, ops, estable, fixture } = await montarAdmin(ZonasPage);
    expect(texto(el)).toContain('Sin recargo · 3.5 km');
    expect(texto(el)).toContain('sin ubicar en el mapa');
    expect(texto(el)).toContain('desactivada');
    botonPorTexto(el, /Nueva zona/).click();
    await estable();
    botonPorTexto(el, /Crear zona/).click();
    await estable();
    expect(q(el, '[role="alert"]').textContent).toContain('nombre de la zona');
    escribir(q(el, '#zona-nombre'), 'Chinauta');
    cambiar(q(el, '#zona-recargo'), '2500');
    await estable();
    botonPorTexto(el, /Crear zona/).click();
    await estable();
    expect(q(el, '[role="alert"]').textContent).toContain('centro de la zona');
    fixture.debugElement
      .query(By.directive(SelectorMapaComponent))
      .componentInstance.elegir.emit({ lat: 4.27, lon: -74.44 });
    cambiar(q(el, '#zona-radio'), '4');
    escribir(q(el, '#zona-descripcion'), 'Condominios');
    await estable();
    expect(el.textContent).toContain('Centro: 4.27000, -74.44000');
    botonPorTexto(el, /Crear zona/).click();
    await estable();
    expect(ops.crearZona).toHaveBeenCalledWith({
      nombre: 'Chinauta',
      tarifaBase: 2500,
      centro: { lat: 4.27, lon: -74.44 },
      radioKm: 4,
      descripcion: 'Condominios',
      activa: true,
    });
    expect(el.querySelector('#zona-nombre')).toBeNull();
    expect(texto(el)).toContain('Chinauta');
  });

  it('edita y desactiva una zona; muestra el error del backend y permite cancelar', async () => {
    const ops = operaciones();
    ops.actualizarZona.mockImplementationOnce(
      rechaza(new ApiError(400, 'Ya existe una zona con ese nombre')),
    );
    const { el, estable } = await montarAdmin(ZonasPage, ops);
    q<HTMLButtonElement>(el, '[aria-label="Editar la zona Silvania"]').click();
    await estable();
    expect(q<HTMLInputElement>(el, '#zona-nombre').value).toBe('Silvania');
    q<HTMLInputElement>(el, 'input[name=activa]').click();
    await estable();
    botonPorTexto(el, /Guardar cambios/).click();
    await estable();
    expect(q(el, '[role="alert"]').textContent).toContain('Ya existe una zona con ese nombre');
    botonPorTexto(el, /Guardar cambios/).click();
    await estable();
    expect(ops.actualizarZona).toHaveBeenLastCalledWith(
      2,
      expect.objectContaining({ activa: false, nombre: 'Silvania' }),
    );
    expect(texto(el)).toMatch(/Silvania Recargo \$\s2\.000 · 3 km · desactivada/);
    q<HTMLButtonElement>(el, '[aria-label="Editar la zona Casco Urbano"]').click();
    await estable();
    cambiar(q(el, '#zona-recargo'), '300000');
    await estable();
    botonPorTexto(el, /Guardar cambios/).click();
    await estable();
    expect(q(el, '[role="alert"]').textContent).toContain('entre $ 0 y $ 200.000');
    botonPorTexto(el, 'Cancelar').click();
    await estable();
    expect(el.querySelector('#zona-nombre')).toBeNull();
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
