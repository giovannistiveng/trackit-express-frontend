import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ADMIN, buildEnvio } from '../../../testing/fixtures';
import { FakeAdminMetrics } from '../../../testing/admin-fake';
import { FakeGeo, botonPorTexto, elegir, escribir, q, rechaza } from '../../../testing/fakes';
import { montar } from '../../../testing/pantallas';
import {
  DatosZona,
  EnvioAdmin,
  Liquidacion,
  PagoAdmin,
  PagoResumen,
  TarifaVehiculo,
  Zona,
} from '../../core/domain';
import { SelectorMapaComponent } from '../../shared/ui/selector-mapa.component';
import { By } from '@angular/platform-browser';
import { ApiError } from '../../core/http/api-error';
import { AdminMetricsPort, AdminOperationsPort, GeoPort, ZonesPort } from '../../core/ports';
import { ToastService } from '../../shared/ui/toast.service';
import { DashboardPage } from './dashboard.page';
import { EnviosAdminPage, TAMANO_PAGINA_ENVIOS } from './envios-admin.page';
import { MensajesPage } from './mensajes.page';
import { PagosAdminPage } from './pagos.page';
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
  { categoria: 'Furgoneta', banderazo: 12000, porKm: 1800, porMinuto: 150, minimo: 22000 },
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
        },
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
    borrarZona: vi.fn(async (): Promise<'borrada' | 'archivada'> => 'archivada'),
    borrarMensaje: vi.fn(async () => undefined),
    pagos: vi.fn(async () => ({ items: [PAGO_ADMIN], total: 1, pagina: 1, tamano: 20 })),
    reembolsar: vi.fn(async (): Promise<PagoResumen> => ({ ...PAGO_ADMIN, estado: 'reembolsado' })),
    liquidaciones: vi.fn(async () => ({
      items: LIQUIDACIONES.map((l) => ({ ...l })),
      total: 2,
      pagina: 1,
      tamano: 20,
    })),
    generarLiquidaciones: vi.fn(async (): Promise<Liquidacion[]> => [LIQUIDACIONES[0]]),
    pagarLiquidacion: vi.fn(async (id: number, referencia: string) => ({
      ...LIQUIDACIONES.find((l) => l.id === id)!,
      estado: 'pagada' as const,
      referencia,
      pagadaEn: new Date(),
    })),
  };
}

const PAGO_ADMIN: PagoAdmin = {
  idEnvio: 5,
  cliente: 'Ana Cliente',
  origen: 'Casco Urbano',
  destino: 'Silvania',
  metodo: 'nequi',
  estado: 'reembolso_pendiente',
  monto: 31600,
  telefono: '*** *** 4567',
  mensaje: 'Nequi no respondió',
  actualizado: new Date(),
};

const LIQUIDACIONES: Liquidacion[] = [
  {
    id: 1,
    conductor: 'Pedro Conductor',
    desde: '2026-10-26',
    hasta: '2026-11-01',
    servicios: 5,
    totalTarifas: 100000,
    gananciaConductor: 80000,
    cobradoEfectivo: 40000,
    comisionEfectivo: 8000,
    saldo: 32000,
    estado: 'pendiente',
    referencia: null,
    pagadaEn: null,
  },
  {
    id: 2,
    conductor: 'Luis',
    desde: '2026-10-26',
    hasta: '2026-11-01',
    servicios: 3,
    totalTarifas: 60000,
    gananciaConductor: 48000,
    cobradoEfectivo: 60000,
    comisionEfectivo: 12000,
    saldo: -12000,
    estado: 'pendiente',
    referencia: null,
    pagadaEn: null,
  },
];

async function montarAdmin<T>(
  componente: Type<T>,
  ops = operaciones(),
  zonas: { listar: () => Promise<Zona[]> } = { listar: vi.fn(async () => ZONAS) },
) {
  const r = await montar(componente, {
    usuario: ADMIN,
    providers: [
      { provide: AdminOperationsPort, useValue: ops },
      { provide: ZonesPort, useValue: zonas },
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

describe('EnviosAdminPage: casos de borde', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('filtra por zona, vuelve de página, Reintentar, sin conductor y sin zonas si fallan', async () => {
    const ops = operaciones();
    ops.envios.mockImplementationOnce(rechaza(new ApiError(500, 'x')));
    const r = await montarAdmin(EnviosAdminPage, ops, { listar: rechaza(new Error('sin red')) });
    expect(r.el.querySelectorAll('#zona option')).toHaveLength(1);
    ops.envios.mockImplementation(async () => ({
      items: [{ ...envioAdmin(2, 'Pendiente'), conductorNombre: null }],
      total: 30,
      pagina: 1,
      tamano: TAMANO_PAGINA_ENVIOS,
    }));
    botonPorTexto(r.el, 'Reintentar').click();
    await r.estable();
    expect(r.el.textContent).toContain('—');
    elegir(q<HTMLSelectElement>(r.el, '#zona'), 0);
    await r.estable();
    botonPorTexto(r.el, 'Siguiente').click();
    await r.estable();
    botonPorTexto(r.el, 'Anterior').click();
    await r.estable();
    expect(ops.envios).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 1 }));
    // Sin conductor solo se avisa al cliente; la X cierra; mientras cancela lo indica
    q<HTMLButtonElement>(r.el, '[aria-label="Cancelar el envío 2"]').click();
    await r.estable();
    expect(q(r.el, '[role="dialog"]').textContent).not.toContain('y al conductor');
    q<HTMLButtonElement>(r.el, '[role="dialog"] button[aria-label="Cerrar"]').click();
    await r.estable();
    expect(r.el.querySelector('[role="dialog"]')).toBeNull();
    q<HTMLButtonElement>(r.el, '[aria-label="Cancelar el envío 2"]').click();
    await r.estable();
    escribir(q(r.el, '#motivo'), 'Motivo válido');
    ops.cancelar.mockImplementation(() => new Promise(() => undefined));
    botonPorTexto(q(r.el, '[role="dialog"]'), 'Cancelar envío').click();
    r.fixture.detectChanges();
    expect(q(r.el, '[role="dialog"]').textContent).toContain('Cancelando…');
  });
});

describe('ZonasPage', () => {
  const cambiar = (input: HTMLInputElement, valor: string) => {
    input.value = valor;
    input.dispatchEvent(new Event('input'));
  };
  const texto = (el: HTMLElement) => el.textContent?.replaceAll(/\s+/g, ' ') ?? '';

  it('muestra las tarifas con ejemplos y guarda solo si cambió y es válida', async () => {
    const { el, ops, estable } = await montarAdmin(ZonasPage);
    const guardar = () =>
      q<HTMLButtonElement>(el, '[aria-label="Guardar la tarifa de Moto Express"]');
    expect(el.querySelectorAll('form[class*="tarjeta"]')).toHaveLength(2);
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
    cambiar(q(el, '#tarifa-furgoneta-porKm'), '1900');
    await estable();
    q<HTMLButtonElement>(el, '[aria-label="Guardar la tarifa de Furgoneta"]').click();
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
    expect(texto(el)).toMatch(/Sin recargo\s*3\.5 km de radio/);
    expect(texto(el)).toContain('Sin ubicar en el mapa');
    expect(texto(el)).toContain('2 activas');
    expect(texto(el)).toContain('1 desactivada');
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
    expect(el.textContent).toContain('Centro en 4.27000, -74.44000');
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
    expect(texto(el)).toMatch(/Silvania\s*Recargo \$\s2\.000\s*3 km de radio\s*Desactivada/);
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

describe('ZonasPage: mapa de cobertura', () => {
  const texto = (el: HTMLElement) => el.textContent?.replaceAll(/\s+/g, ' ') ?? '';
  const mapaDe = (fixture: ComponentFixture<unknown>) =>
    fixture.debugElement.query(By.directive(SelectorMapaComponent))
      .componentInstance as SelectorMapaComponent;

  it('al tocar el mapa dice si el punto tiene cobertura y ofrece crear una zona si no', async () => {
    const { el, estable, fixture } = await montarAdmin(ZonasPage);
    // Dentro de Silvania (activa, 3 km)
    mapaDe(fixture).elegir.emit({ lat: 4.404, lon: -74.388 });
    await estable();
    expect(texto(el)).toContain('Este punto tiene servicio en Silvania');
    expect(texto(el)).toContain('recargo $ 2.000');
    // Lejos de todo
    mapaDe(fixture).elegir.emit({ lat: 4.9, lon: -74 });
    await estable();
    expect(texto(el)).toContain('Sin cobertura');
    botonPorTexto(el, /Crear zona aquí/).click();
    await estable();
    expect(el.textContent).toContain('Centro en 4.90000, -74.00000');
    // Radios rápidos y aviso de cruce con otra zona
    botonPorTexto(el, '20 km').click();
    await estable();
    expect(q<HTMLInputElement>(el, '#zona-radio').value).toBe('20');
    expect(texto(el)).toContain('unos 1257 km²');
    mapaDe(fixture).elegir.emit({ lat: 4.34, lon: -74.36 });
    await estable();
    expect(texto(el)).toContain('Se cruza con Casco Urbano, Silvania');
    botonPorTexto(el, 'Cancelar').click();
    await estable();
    q<HTMLButtonElement>(el, '[aria-label="Ver Casco Urbano en el mapa"]').click();
    expect(q<HTMLButtonElement>(el, '[aria-label="Ver Vereda Pekín en el mapa"]').disabled).toBe(
      true,
    );
  });

  it('busca un lugar: sin zona en edición lo prueba; editando lo vuelve el centro', async () => {
    const { el, estable } = await montarAdmin(ZonasPage);
    const geo = TestBed.inject(GeoPort) as unknown as FakeGeo;
    geo.resultados = [
      { nombre: 'Pasca', detalle: 'Pasca, Cundinamarca', coords: { lat: 4.31, lon: -74.3 } },
    ];
    escribir(q(el, '#zona-buscar'), 'Pasca');
    await estable();
    q<HTMLFormElement>(el, 'form[role="search"]').dispatchEvent(new Event('submit'));
    await estable();
    expect(geo.buscar).toHaveBeenCalledWith('Pasca');
    botonPorTexto(el, /Pasca, Cundinamarca/).click();
    await estable();
    expect(texto(el)).toContain('Sin cobertura');

    botonPorTexto(el, /Nueva zona/).click();
    await estable();
    q<HTMLFormElement>(el, 'form[role="search"]').dispatchEvent(new Event('submit'));
    await estable();
    botonPorTexto(el, /Pasca, Cundinamarca/).click();
    await estable();
    expect(el.textContent).toContain('Centro en 4.31000, -74.30000');

    geo.resultados = [];
    q<HTMLFormElement>(el, 'form[role="search"]').dispatchEvent(new Event('submit'));
    await estable();
    expect(texto(el)).toContain('No encontramos ese lugar');
    geo.fallo = new ApiError(429, 'Demasiadas búsquedas');
    q<HTMLFormElement>(el, 'form[role="search"]').dispatchEvent(new Event('submit'));
    await estable();
    expect(texto(el)).toContain('Inténtalo de nuevo');
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

describe('MensajesPage: casos de borde', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('mensaje atendido sin teléfono, error al atender y Reintentar', async () => {
    const ops = operaciones();
    const base = (await ops.mensajes()).items[0];
    ops.mensajes.mockImplementation(async () => ({
      items: [
        base,
        { ...base, id: 4, atendido: true, telefono: undefined } as unknown as typeof base,
      ],
      total: 2,
      pagina: 1,
      tamano: 20,
    }));
    ops.atenderMensaje.mockImplementation(rechaza(new ApiError(500, 'x')));
    const r = await montarAdmin(MensajesPage, ops);
    expect(r.el.textContent).toContain('Atendido');
    const error = vi.spyOn(TestBed.inject(ToastService), 'error');
    botonPorTexto(r.el, /Atendido/).click();
    await r.estable();
    expect(error).toHaveBeenCalled();
    ops.mensajes.mockImplementationOnce(rechaza(new ApiError(500, 'x')));
    q<HTMLInputElement>(r.el, 'input[type=checkbox]').click();
    await r.estable();
    botonPorTexto(r.el, 'Reintentar').click();
    await r.estable();
    expect(r.el.textContent).toContain('Tienda');
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

describe('DashboardPage: sin envíos y con un conductor por aprobar', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('sin envíos la tasa es 0 y no hay arcos; un solo conductor en singular; Actualizar recarga', async () => {
    const metricas = new FakeAdminMetrics();
    const base = await metricas.metricas();
    const puerto = {
      metricas: vi.fn(async () => ({
        ...base,
        enviosTotales: 0,
        entregados: 0,
        conductoresPendientes: 1,
        porEstado: base.porEstado.map((e) => ({ ...e, envios: 0 })),
      })),
      auditoria: vi.fn(),
    };
    const r = await montar(DashboardPage, {
      usuario: ADMIN,
      providers: [{ provide: AdminMetricsPort, useValue: puerto }],
    });
    await r.estable();
    expect(q(r.el, 'svg[role="img"]').getAttribute('aria-label')).toBe('Tasa de entrega 0 %');
    expect(r.el.querySelectorAll('svg circle[stroke-dasharray]').length).toBe(0);
    expect(r.el.textContent).toContain('1 conductor espera aprobación');
    puerto.metricas.mockImplementation(async () => ({ ...base, conductoresPendientes: 0 }));
    botonPorTexto(r.el, /Actualizar/).click();
    await r.estable();
    expect(r.el.textContent).not.toContain('esperan aprobación');
  });
});

describe('Eliminar zonas y mensajes', () => {
  it('elimina una zona tras confirmar y avisa si quedó archivada', async () => {
    const { el, ops, estable } = await montarAdmin(ZonasPage);
    const toast = vi.spyOn(TestBed.inject(ToastService), 'exito');
    q<HTMLButtonElement>(el, '[aria-label="Eliminar la zona Silvania"]').click();
    await estable();
    expect(q(el, '[role="dialog"]').textContent).toContain('Silvania');
    botonPorTexto(el, 'Cancelar').click();
    await estable();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    q<HTMLButtonElement>(el, '[aria-label="Eliminar la zona Silvania"]').click();
    await estable();
    botonPorTexto(el, /Sí, eliminar/).click();
    await estable();
    expect(ops.borrarZona).toHaveBeenCalledWith(2);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('archivada'));
    expect(el.querySelector('[aria-label="Eliminar la zona Silvania"]')).toBeNull();
  });

  it('si no se puede eliminar (única zona activa), muestra el error', async () => {
    const ops = operaciones();
    ops.borrarZona.mockImplementation(
      rechaza(new ApiError(400, 'No puedes eliminar la única zona activa')),
    );
    const { el, estable } = await montarAdmin(ZonasPage, ops);
    const toast = vi.spyOn(TestBed.inject(ToastService), 'error');
    q<HTMLButtonElement>(el, '[aria-label="Eliminar la zona Casco Urbano"]').click();
    await estable();
    botonPorTexto(el, /Sí, eliminar/).click();
    await estable();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('única zona'));
    ops.borrarZona.mockImplementation(async () => 'borrada');
    botonPorTexto(el, /Sí, eliminar/).click();
    await estable();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it('elimina un mensaje de contacto con confirmación', async () => {
    const { el, ops, estable } = await montarAdmin(MensajesPage);
    const borrar = q<HTMLButtonElement>(el, 'button[aria-label^="Eliminar el mensaje"]');
    borrar.click();
    await estable();
    botonPorTexto(el, 'No').click();
    await estable();
    expect(ops.borrarMensaje).not.toHaveBeenCalled();
    q<HTMLButtonElement>(el, 'button[aria-label^="Eliminar el mensaje"]').click();
    await estable();
    botonPorTexto(el, /Eliminar\? Sí/).click();
    await estable();
    expect(ops.borrarMensaje).toHaveBeenCalledWith(3);
    ops.borrarMensaje.mockImplementation(rechaza(new ApiError(500, 'x')));
    const toast = vi.spyOn(TestBed.inject(ToastService), 'error');
    q<HTMLButtonElement>(el, 'button[aria-label^="Eliminar el mensaje"]').click();
    await estable();
    botonPorTexto(el, /Eliminar\? Sí/).click();
    await estable();
    expect(toast).toHaveBeenCalled();
  });
});

describe('PagosAdminPage', () => {
  it('lista liquidaciones, genera la semana y registra el pago con referencia', async () => {
    const { el, ops, estable } = await montarAdmin(PagosAdminPage);
    const texto = () => el.textContent?.replaceAll(/\s+/g, ' ') ?? '';
    expect(ops.liquidaciones).toHaveBeenCalledWith({ estado: 'pendiente', pagina: 1 });
    expect(texto()).toContain('Pedro Conductor');
    expect(texto()).toContain('pagar al conductor');
    expect(texto()).toContain('cobrar al conductor');
    botonPorTexto(el, /Liquidar la semana pasada/).click();
    await estable();
    expect(ops.generarLiquidaciones).toHaveBeenCalled();
    ops.generarLiquidaciones.mockImplementation(async () => []);
    botonPorTexto(el, /Liquidar la semana pasada/).click();
    await estable();
    botonPorTexto(el, /Marcar pagada/).click();
    await estable();
    const confirmar = botonPorTexto(el, /Confirmar/);
    expect(confirmar.disabled).toBe(true);
    escribir(q(el, '#referencia'), 'Nequi M123');
    await estable();
    botonPorTexto(el, /Confirmar/).click();
    await estable();
    expect(ops.pagarLiquidacion).toHaveBeenCalledWith(1, 'Nequi M123');
    expect(texto()).toContain('Pagada');
    botonPorTexto(el, /Marcar saldada/).click();
    await estable();
    expect(q(el, '[role="dialog"]').textContent).toContain('Registrar cobro al conductor');
    botonPorTexto(el, 'Cancelar').click();
    await estable();
    elegir(q(el, 'select'), 2);
    await estable();
    expect(ops.liquidaciones).toHaveBeenLastCalledWith({ estado: 'pagada', pagina: 1 });
  });

  it('errores al generar, pagar y cargar', async () => {
    const ops = operaciones();
    ops.generarLiquidaciones.mockImplementation(rechaza(new ApiError(500, 'x')));
    ops.pagarLiquidacion.mockImplementation(
      rechaza(new ApiError(400, 'La referencia es obligatoria')),
    );
    const { el, estable } = await montarAdmin(PagosAdminPage, ops);
    const toast = vi.spyOn(TestBed.inject(ToastService), 'error');
    botonPorTexto(el, /Liquidar la semana pasada/).click();
    await estable();
    expect(toast).toHaveBeenCalledTimes(1);
    botonPorTexto(el, /Marcar pagada/).click();
    await estable();
    escribir(q(el, '#referencia'), 'abc');
    await estable();
    botonPorTexto(el, /Confirmar/).click();
    await estable();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('referencia'));
    ops.liquidaciones.mockImplementation(rechaza(new ApiError(500, 'x')));
    elegir(q(el, 'select'), 0);
    await estable();
    expect(q(el, '[role="alert"]')).toBeTruthy();
  });

  it('cobros de envíos: filtra y reintenta el reembolso', async () => {
    const { el, ops, estable } = await montarAdmin(PagosAdminPage);
    botonPorTexto(el, 'Cobros de envíos').click();
    await estable();
    expect(el.textContent).toContain('Ana Cliente');
    expect(el.textContent).toContain('Reembolso pendiente');
    const [metodo, estado] = Array.from(el.querySelectorAll('select'));
    elegir(metodo, 1);
    await estable();
    elegir(estado, 1);
    await estable();
    expect(ops.pagos).toHaveBeenLastCalledWith({ metodo: 'nequi', estado: 'pendiente', pagina: 1 });
    botonPorTexto(el, /Reintentar reembolso/).click();
    await estable();
    expect(ops.reembolsar).toHaveBeenCalledWith(5);
    ops.reembolsar.mockImplementation(async () => ({ ...PAGO_ADMIN }));
    botonPorTexto(el, /Reintentar reembolso/).click();
    await estable();
    ops.reembolsar.mockImplementation(rechaza(new ApiError(500, 'x')));
    const toast = vi.spyOn(TestBed.inject(ToastService), 'error');
    botonPorTexto(el, /Reintentar reembolso/).click();
    await estable();
    expect(toast).toHaveBeenCalled();
    ops.pagos.mockImplementation(async () => ({ items: [], total: 0, pagina: 1, tamano: 20 }));
    botonPorTexto(el, 'Liquidaciones').click();
    await estable();
    botonPorTexto(el, 'Cobros de envíos').click();
    await estable();
    expect(el.textContent).toContain('No hay pagos con esos filtros.');
  });
});

describe('ZonasPage: casos de borde', () => {
  afterEach(() => TestBed.resetTestingModule());

  interface Interna {
    guardarTarifa(i: number): Promise<void>;
    borrarZona(z: Zona): Promise<void>;
    buscarLugar(): Promise<void>;
    guardarZona(b: unknown): Promise<void>;
    alElegirEnMapa(p: { lat: number; lon: number }): void;
    borrador(): unknown;
  }
  const interna = (c: unknown) => c as Interna;
  const mapa = (fixture: ComponentFixture<unknown>) =>
    fixture.debugElement.query(By.directive(SelectorMapaComponent))
      .componentInstance as SelectorMapaComponent;

  it('Reintentar tras un error; ver todas las zonas; probar puntos con y sin recargo y quitarlos', async () => {
    const ops = operaciones();
    ops.zonas.mockImplementationOnce(rechaza(new ApiError(500, 'x')));
    const r = await montarAdmin(ZonasPage, ops);
    botonPorTexto(r.el, 'Reintentar').click();
    await r.estable();
    const verTodas = vi.spyOn(mapa(r.fixture), 'verTodas');
    q<HTMLButtonElement>(r.el, '[aria-label="Ver todas las zonas"]').click();
    expect(verTodas).toHaveBeenCalled();
    interna(r.c).alElegirEnMapa({ lat: 4.3365, lon: -74.3638 });
    r.fixture.detectChanges();
    expect(r.el.textContent).toContain('sin recargo');
    interna(r.c).alElegirEnMapa({ lat: 4.4036, lon: -74.3881 });
    r.fixture.detectChanges();
    expect(r.el.textContent).toContain('recargo');
    q<HTMLButtonElement>(r.el, '[aria-label="Quitar el punto de prueba"]').click();
    r.fixture.detectChanges();
    expect(r.el.querySelector('[aria-label="Quitar el punto de prueba"]')).toBeNull();
  });

  it('tarifas: campo vacío no es válido, sin cambios no guarda y mientras guarda lo indica', async () => {
    const ops = operaciones();
    const r = await montarAdmin(ZonasPage, ops);
    await interna(r.c).guardarTarifa(0);
    expect(ops.actualizarTarifaVehiculo).not.toHaveBeenCalled();
    const banderazo = q<HTMLInputElement>(r.el, '#tarifa-moto-express-banderazo');
    escribir(banderazo, '');
    await r.estable();
    expect(
      q<HTMLButtonElement>(r.el, '[aria-label="Guardar la tarifa de Moto Express"]').disabled,
    ).toBe(true);
    escribir(banderazo, '2500');
    await r.estable();
    let guardar!: (t: TarifaVehiculo) => void;
    ops.actualizarTarifaVehiculo.mockImplementation(() => new Promise((ok) => (guardar = ok)));
    q<HTMLButtonElement>(r.el, '[aria-label="Guardar la tarifa de Moto Express"]').click();
    r.fixture.detectChanges();
    expect(
      r.el.querySelector('[aria-label="Guardar la tarifa de Moto Express"] ti-icono.animate-spin'),
    ).toBeTruthy();
    await interna(r.c).guardarTarifa(0);
    guardar({ ...TARIFAS[0], banderazo: 2500 });
    await r.estable();
    expect(ops.actualizarTarifaVehiculo).toHaveBeenCalledTimes(1);
  });

  it('buscar: texto corto no busca y mientras busca lo indica', async () => {
    const r = await montarAdmin(ZonasPage);
    const geo = TestBed.inject(GeoPort) as FakeGeo;
    await interna(r.c).buscarLugar();
    expect(geo.buscar).not.toHaveBeenCalled();
    let responder!: (x: []) => void;
    geo.buscar.mockImplementationOnce(() => new Promise((ok) => (responder = ok)));
    escribir(q(r.el, '#zona-buscar'), 'Chinauta');
    await r.estable();
    q<HTMLButtonElement>(r.el, '[aria-label="Buscar en el mapa"]').click();
    r.fixture.detectChanges();
    expect(
      r.el.querySelector('[aria-label="Buscar en el mapa"] ti-icono.animate-spin'),
    ).toBeTruthy();
    await interna(r.c).buscarLugar();
    responder([]);
    await r.estable();
    expect(geo.buscar).toHaveBeenCalledTimes(1);
  });

  it('editar una zona sin centro ni radio; descripción vacía; no guarda dos veces', async () => {
    const ops = operaciones();
    ops.zonas.mockImplementation(async () => [
      ...ZONAS.map((z) => ({ ...z })),
      { id: 4, nombre: 'Pasca', tarifaBase: 2000, centro: null, activa: true, descripcion: null },
    ]);
    const r = await montarAdmin(ZonasPage, ops);
    expect(r.el.textContent).toContain('Pasca');
    q<HTMLButtonElement>(r.el, '[aria-label="Editar la zona Pasca"]').click();
    await r.estable();
    expect(q<HTMLInputElement>(r.el, '#zona-radio').value).toBe('3');
    interna(r.c).alElegirEnMapa({ lat: 4.21, lon: -74.3 });
    escribir(q(r.el, '#zona-descripcion'), '   ');
    await r.estable();
    let guardar!: (z: Zona) => void;
    ops.actualizarZona.mockImplementation(() => new Promise((ok) => (guardar = ok)));
    botonPorTexto(r.el, /Guardar cambios/).click();
    r.fixture.detectChanges();
    expect(r.el.querySelector('form ti-icono.animate-spin')).toBeTruthy();
    await interna(r.c).guardarZona(interna(r.c).borrador());
    expect(ops.actualizarZona).toHaveBeenCalledTimes(1);
    expect(ops.actualizarZona).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ descripcion: null, radioKm: 3 }),
    );
    guardar({
      id: 4,
      nombre: 'Pasca',
      tarifaBase: 2000,
      centro: { lat: 4.21, lon: -74.3 },
      radioKm: 3,
      activa: true,
    });
    await r.estable();
  });

  it('eliminar: se cierra con la X y mientras elimina lo indica', async () => {
    const ops = operaciones();
    const r = await montarAdmin(ZonasPage, ops);
    q<HTMLButtonElement>(r.el, '[aria-label="Eliminar la zona Silvania"]').click();
    await r.estable();
    q<HTMLButtonElement>(r.el, '[role="dialog"] button[aria-label="Cerrar"]').click();
    await r.estable();
    expect(r.el.querySelector('[role="dialog"]')).toBeNull();
    q<HTMLButtonElement>(r.el, '[aria-label="Eliminar la zona Silvania"]').click();
    await r.estable();
    let borrar!: (x: 'borrada') => void;
    ops.borrarZona.mockImplementation(() => new Promise((ok) => (borrar = ok)));
    botonPorTexto(r.el, 'Sí, eliminar').click();
    r.fixture.detectChanges();
    expect(r.el.textContent).toContain('Eliminando…');
    await interna(r.c).borrarZona(ZONAS[1]);
    borrar('borrada');
    await r.estable();
    expect(ops.borrarZona).toHaveBeenCalledTimes(1);
  });
});

describe('PagosAdminPage: casos de borde', () => {
  afterEach(() => TestBed.resetTestingModule());

  interface Interna {
    generar(): Promise<void>;
    confirmarPago(l: Liquidacion): Promise<void>;
  }

  it('genera varias, mientras genera lo indica y no repite; Reintentar tras un error', async () => {
    const ops = operaciones();
    ops.liquidaciones.mockImplementationOnce(rechaza(new ApiError(500, 'x')));
    const r = await montarAdmin(PagosAdminPage, ops);
    botonPorTexto(r.el, 'Reintentar').click();
    await r.estable();
    expect(r.el.textContent).toContain('Pedro Conductor');
    let generar!: (l: Liquidacion[]) => void;
    ops.generarLiquidaciones.mockImplementation(
      () => new Promise<Liquidacion[]>((ok) => (generar = ok)),
    );
    const toast = vi.spyOn(TestBed.inject(ToastService), 'exito');
    botonPorTexto(r.el, /Liquidar la semana pasada/).click();
    r.fixture.detectChanges();
    expect(r.el.querySelector('ti-icono.animate-spin')).toBeTruthy();
    await (r.c as unknown as Interna).generar();
    generar(LIQUIDACIONES);
    await r.estable();
    expect(ops.generarLiquidaciones).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith('2 liquidaciones generadas');
  });

  it('liquidación sin conductor y pagada sin referencia ni fecha; el modal se cierra con la X; pagar no se repite', async () => {
    const ops = operaciones();
    ops.liquidaciones.mockImplementation(async () => ({
      items: [
        { ...LIQUIDACIONES[0], conductor: null },
        { ...LIQUIDACIONES[1], id: 3, estado: 'pagada' as const, referencia: null, pagadaEn: null },
      ],
      total: 2,
      pagina: 1,
      tamano: 20,
    }));
    const r = await montarAdmin(PagosAdminPage, ops);
    expect(r.el.textContent).toContain('—');
    expect(r.el.textContent).toContain('Pagada');
    botonPorTexto(r.el, /Marcar pagada/).click();
    await r.estable();
    q<HTMLButtonElement>(r.el, '[role="dialog"] button[aria-label="Cerrar"]').click();
    await r.estable();
    expect(r.el.querySelector('[role="dialog"]')).toBeNull();
    botonPorTexto(r.el, /Marcar pagada/).click();
    await r.estable();
    escribir(q(r.el, '#referencia'), 'Nequi M1');
    await r.estable();
    let pagar!: (l: Liquidacion) => void;
    ops.pagarLiquidacion.mockImplementation(
      () => new Promise<never>((ok) => (pagar = ok as unknown as (l: Liquidacion) => void)),
    );
    botonPorTexto(r.el, /Confirmar/).click();
    r.fixture.detectChanges();
    expect(r.el.querySelector('[role="dialog"] ti-icono.animate-spin')).toBeTruthy();
    await (r.c as unknown as Interna).confirmarPago(LIQUIDACIONES[0]);
    pagar({ ...LIQUIDACIONES[0], estado: 'pagada', referencia: 'Nequi M1', pagadaEn: new Date() });
    await r.estable();
    expect(ops.pagarLiquidacion).toHaveBeenCalledTimes(1);
  });

  it('cobros: mientras cargan, sin mensaje, en efectivo sin teléfono, otros estados y Reintentar', async () => {
    const ops = operaciones();
    let cargar!: (p: { items: PagoAdmin[]; total: number; pagina: number; tamano: number }) => void;
    ops.pagos.mockImplementationOnce(
      () => new Promise<never>((ok) => (cargar = ok as unknown as typeof cargar)),
    );
    const r = await montarAdmin(PagosAdminPage, ops);
    botonPorTexto(r.el, 'Cobros de envíos').click();
    r.fixture.detectChanges();
    cargar({
      items: [
        {
          ...PAGO_ADMIN,
          idEnvio: 6,
          metodo: 'efectivo',
          telefono: null,
          mensaje: null,
          estado: 'por_cobrar',
        },
        { ...PAGO_ADMIN, idEnvio: 7, estado: 'anulado', mensaje: null },
      ],
      total: 2,
      pagina: 1,
      tamano: 20,
    });
    await r.estable();
    expect(r.el.textContent).toContain('Efectivo');
    expect(r.el.textContent).toContain('Por cobrar');
    expect(r.el.querySelector('.bg-niebla')).toBeTruthy();
    ops.pagos.mockImplementationOnce(rechaza(new ApiError(500, 'x')));
    elegir(Array.from(r.el.querySelectorAll('select'))[0], 2);
    await r.estable();
    botonPorTexto(r.el, 'Reintentar').click();
    await r.estable();
    expect(r.el.textContent).toContain('Ana Cliente');
  });
});
