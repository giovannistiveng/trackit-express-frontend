import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { CLIENTE, buildEnvio } from '../../../testing/fixtures';
import { botonPorTexto, escribir, q, rechaza } from '../../../testing/fakes';
import { montar } from '../../../testing/pantallas';
import { ApiError } from '../../core/http/api-error';
import { Coordenadas, Cotizacion, Envio, PagoResumen } from '../../core/domain';
import { PaymentsPort, QuotePort, ShipmentsPort, ZonesPort } from '../../core/ports';
import { CampoDireccionComponent } from '../../shared/ui/campo-direccion.component';
import { ESPERA_AUTOCOTIZAR_MS, NuevoEnvioPage } from './nuevo-envio.page';

const FUSA = { lat: 4.3369, lon: -74.3638 };
const SILVANIA = { lat: 4.4036, lon: -74.3881 };

const COTIZACION: Cotizacion = {
  distanciaKm: 34.5,
  tarifaBase: 2000,
  tarifaTotal: 31600,
  moneda: 'COP',
  categoria: 'Moto Express',
  opciones: [
    { categoria: 'Moto Express', tarifaTotal: 31600, minimoAplicado: false },
    { categoria: 'Furgoneta', tarifaTotal: 75500, minimoAplicado: false },
  ],
  origenCoords: null,
  destinoCoords: null,
};

const PAGO: PagoResumen = {
  metodo: 'nequi',
  estado: 'pendiente',
  monto: 31600,
  telefono: '*** *** 4567',
  mensaje: null,
  actualizado: new Date(),
};

interface Interna {
  confirmar(): Promise<void>;
  cotizar(marcar?: boolean): Promise<void>;
  agregarParada(): void;
  elegirServicio(t: string): void;
  paradas(): {
    coords: { set(c: Coordenadas | null): void };
    control: { setValue(v: string): void };
  }[];
}

function puertos() {
  return {
    zonas: { listar: vi.fn(async () => []) },
    cotizar: { cotizar: vi.fn(async (): Promise<Cotizacion> => COTIZACION) },
    envios: {
      crear: vi.fn(async (): Promise<Envio> => buildEnvio({ id: 2, tarifa: 31600 })),
      obtener: vi.fn(async (): Promise<Envio> => buildEnvio()),
    },
    pagos: {
      estado: vi.fn(async () => PAGO),
      reintentar: vi.fn(async () => PAGO),
      pagarEnEfectivo: vi.fn(async () => ({
        ...PAGO,
        metodo: 'efectivo' as const,
        estado: 'por_cobrar' as const,
      })),
    },
  };
}

async function montarNuevo(p = puertos(), consulta: Record<string, string> = {}) {
  const r = await montar(NuevoEnvioPage, {
    usuario: CLIENTE,
    providers: [
      { provide: ZonesPort, useValue: p.zonas },
      { provide: QuotePort, useValue: p.cotizar },
      { provide: ShipmentsPort, useValue: p.envios },
      { provide: PaymentsPort, useValue: p.pagos },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(consulta) } },
      },
    ],
  });
  await r.estable();
  return { ...r, p, i: r.c as unknown as Interna };
}

function ubicar(
  fixture: ComponentFixture<unknown>,
  id: string,
  nombre: string,
  coords: Coordenadas,
) {
  const campo = fixture.debugElement
    .queryAll(By.directive(CampoDireccionComponent))
    .map((d) => d.componentInstance as CampoDireccionComponent)
    .find((c) => c.idCampo() === id);
  if (!campo) throw new Error(`No hay campo ${id}`);
  campo.seleccionar({ nombre, detalle: nombre, coords });
  fixture.detectChanges();
}

function ubicarAmbos(fixture: ComponentFixture<unknown>) {
  ubicar(fixture, 'origen', 'Casco Urbano', FUSA);
  ubicar(fixture, 'destino', 'Silvania', SILVANIA);
}

const texto = (el: HTMLElement) => el.textContent?.replaceAll(/\s+/g, ' ') ?? '';
const calcular = (el: HTMLElement) => botonPorTexto(el, /Calcular precio|Volver a cotizar/);

async function cotizado(p = puertos(), consulta: Record<string, string> = {}) {
  const r = await montarNuevo(p, consulta);
  ubicarAmbos(r.fixture);
  calcular(r.el).click();
  await r.estable();
  return r;
}

describe('NuevoEnvioPage: casos de borde', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('valida la longitud de las direcciones y señala origen igual a destino con solo escribir', async () => {
    const r = await montarNuevo();
    escribir(q(r.el, '#origen'), 'ab');
    escribir(q(r.el, '#destino'), 'cd');
    r.fixture.detectChanges();
    expect(q(r.el, '#origen-error').textContent).toContain('Escribe entre 3 y 200 caracteres.');
    expect(q(r.el, '#destino-error').textContent).toContain('Escribe entre 3 y 200 caracteres.');
    r.fixture.destroy();
    TestBed.resetTestingModule();
    const r2 = await montarNuevo();
    escribir(q(r2.el, '#origen'), 'Parque principal');
    const destino = q<HTMLInputElement>(r2.el, '#destino');
    destino.value = 'Parque principal';
    destino.dispatchEvent(new Event('input'));
    r2.fixture.detectChanges();
    expect(texto(r2.el)).toContain('El destino debe ser distinto del origen.');
    r2.fixture.destroy();
  });

  it('mandado pide qué hacer; insumos se llenan con las sugerencias', async () => {
    const r = await montarNuevo();
    r.i.elegirServicio('mandado');
    r.fixture.detectChanges();
    expect(r.el.querySelector('#det-lista')).toBeTruthy();
    r.i.elegirServicio('insumos');
    r.fixture.detectChanges();
    const chip = r.el.querySelector<HTMLButtonElement>('#det-insumo ~ div button.chip');
    chip?.click();
    r.fixture.detectChanges();
    expect(q<HTMLInputElement>(r.el, '#det-insumo').value).toBe(chip?.textContent?.trim());
    r.fixture.destroy();
  });

  it('mientras cotiza muestra que está calculando', async () => {
    const p = puertos();
    let responder!: (c: Cotizacion) => void;
    p.cotizar.cotizar.mockImplementation(() => new Promise<Cotizacion>((ok) => (responder = ok)));
    const r = await montarNuevo(p);
    ubicarAmbos(r.fixture);
    calcular(r.el).click();
    r.fixture.detectChanges();
    expect(texto(r.el)).toContain('Calculando tu precio…');
    expect(
      r.el.querySelector('form ti-icono.animate-spin, button ti-icono.animate-spin'),
    ).toBeTruthy();
    responder(COTIZACION);
    await r.estable();
    expect(texto(r.el)).not.toContain('Calculando tu precio…');
    r.fixture.destroy();
  });

  it('la cotización sin zona ni duración ni desglose y de noche', async () => {
    const p = puertos();
    p.cotizar.cotizar.mockImplementation(async () => ({
      ...COTIZACION,
      nocturno: true,
      zona: undefined,
      duracionMin: undefined,
    }));
    const r = await cotizado(p);
    expect(texto(r.el)).toContain('Horario nocturno');
    expect(r.el.querySelector('ti-desglose-tarifa')).toBeNull();
    r.fixture.destroy();
    TestBed.resetTestingModule();
    const p2 = puertos();
    p2.cotizar.cotizar.mockImplementation(async () => ({
      ...COTIZACION,
      desglose: {
        categoria: 'Moto Express',
        banderazo: 2000,
        distancia: 20000,
        tiempo: 5000,
        recargoZona: 0,
        paradas: 0,
        recargoParadas: 0,
        idaYVuelta: false,
        recargoNocturno: 0,
        extras: [],
        recargoAcceso: 0,
        minimoAplicado: false,
        total: 31600,
      },
    }));
    const r2 = await cotizado(p2);
    expect(r2.el.querySelector('ti-desglose-tarifa')).toBeTruthy();
    // La barra inferior (celular) también confirma
    q<HTMLButtonElement>(r2.el, '.fixed button.btn-acento, .fixed button.btn-primario').click();
    await r2.estable();
    expect(p2.envios.crear).toHaveBeenCalled();
    r2.fixture.destroy();
  });

  it('sin opciones por vehículo usa el total; volver a elegir el mínimo lo deja como "cualquiera"', async () => {
    const p = puertos();
    p.cotizar.cotizar.mockImplementation(async () => ({ ...COTIZACION, opciones: undefined }));
    const r = await cotizado(p);
    expect(texto(r.el)).toContain('31.600');
    r.fixture.destroy();
    TestBed.resetTestingModule();
    const p2 = puertos();
    p2.cotizar.cotizar.mockImplementation(async () => ({
      ...COTIZACION,
      opciones: [{ categoria: 'Moto Express', tarifaTotal: 31600, minimoAplicado: false }],
    }));
    const r2 = await cotizado(p2);
    q<HTMLInputElement>(r2.el, '#vehiculo-furgoneta').click();
    await r2.estable();
    // La furgoneta no vino en la cotización: se usa el total
    expect(texto(r2.el)).toContain('31.600');
    q<HTMLInputElement>(r2.el, '#vehiculo-moto').click();
    await r2.estable();
    expect(q<HTMLInputElement>(r2.el, '#vehiculo-moto').checked).toBe(true);
    r2.fixture.destroy();
  });

  it('una respuesta vieja de cotización (éxito o error) no pisa la más reciente', async () => {
    const p = puertos();
    const pendientes: { ok: (c: Cotizacion) => void; falla: (e: unknown) => void }[] = [];
    p.cotizar.cotizar.mockImplementation(
      () => new Promise<Cotizacion>((ok, falla) => pendientes.push({ ok, falla })),
    );
    const r = await montarNuevo(p);
    ubicarAmbos(r.fixture);
    void r.i.cotizar();
    void r.i.cotizar();
    void r.i.cotizar();
    pendientes[0].ok({ ...COTIZACION, tarifaTotal: 1 });
    pendientes[1].falla(new ApiError(500, 'x'));
    pendientes[2].ok(COTIZACION);
    await r.estable();
    expect(texto(r.el)).toContain('31.600');
    expect(texto(r.el)).not.toContain('Algo salió mal');
    r.fixture.destroy();
  });

  it('programar sin fecha no cotiza (el error se ve junto al campo)', async () => {
    const r = await montarNuevo();
    ubicarAmbos(r.fixture);
    q<HTMLInputElement>(r.el, 'input[formcontrolname="programar"]').click();
    r.fixture.detectChanges();
    calcular(r.el).click();
    await r.estable();
    expect(r.p.cotizar.cotizar).not.toHaveBeenCalled();
    expect(q(r.el, '#fecha-error').textContent).toContain('Elige la fecha y la hora.');
    r.fixture.destroy();
  });

  it('confirmar sin cotización vigente, con datos inválidos o con la hora ya vencida no crea el pedido', async () => {
    const r = await montarNuevo();
    await r.i.confirmar();
    expect(r.p.envios.crear).not.toHaveBeenCalled();
    r.fixture.destroy();
    TestBed.resetTestingModule();

    const r2 = await cotizado();
    escribir(q(r2.el, '#destTelefono'), '12');
    r2.fixture.detectChanges();
    await r2.i.confirmar();
    expect(r2.p.envios.crear).not.toHaveBeenCalled();
    r2.fixture.destroy();
    TestBed.resetTestingModule();

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T12:00:00'));
    const r3 = await montarNuevo();
    ubicarAmbos(r3.fixture);
    q<HTMLInputElement>(r3.el, 'input[formcontrolname="programar"]').click();
    r3.fixture.detectChanges();
    escribir(q(r3.el, '#fecha'), '2026-11-18T13:00');
    calcular(r3.el).click();
    await r3.estable();
    expect(r3.p.cotizar.cotizar).toHaveBeenCalled();
    vi.setSystemTime(new Date('2026-11-18T12:45:00'));
    await r3.i.confirmar();
    r3.fixture.detectChanges();
    expect(r3.p.envios.crear).not.toHaveBeenCalled();
    expect(texto(r3.el)).toContain('minutos de anticipación');
    r3.fixture.destroy();
  });

  it('mientras crea el pedido lo indica; el pedido programado y sin PIN se informa así', async () => {
    const p = puertos();
    let crear!: (e: Envio) => void;
    p.envios.crear.mockImplementation(() => new Promise<Envio>((ok) => (crear = ok)));
    const r = await cotizado(p);
    botonPorTexto(r.el, /Confirmar/).click();
    r.fixture.detectChanges();
    expect(texto(r.el)).toContain('Enviando pedido…');
    expect(texto(r.el)).toContain('Enviando…');
    crear(
      buildEnvio({
        id: 3,
        tarifa: 31600,
        pin: undefined,
        fechaProgramada: new Date('2026-11-20T15:00:00Z'),
      }),
    );
    await r.estable();
    expect(texto(r.el)).toContain('Lo publicaremos para los conductores una hora antes');
    expect(texto(r.el)).toContain('Programado');
    r.fixture.destroy();
  });

  it('pagado con Nequi: el panel de pago actualiza el pedido creado', async () => {
    const p = puertos();
    p.envios.crear.mockImplementation(async () =>
      buildEnvio({
        id: 4,
        tarifa: 31600,
        metodoPago: 'nequi',
        pago: { ...PAGO, estado: 'rechazado' },
      }),
    );
    p.pagos.estado.mockImplementation(async () => ({ ...PAGO, estado: 'rechazado' as const }));
    const r = await cotizado(p);
    Array.from(
      r.el.querySelectorAll<HTMLInputElement>('input[formcontrolname="metodoPago"]'),
    )[1].click();
    r.fixture.detectChanges();
    escribir(q(r.el, '#telNequi'), '3001234567');
    r.fixture.detectChanges();
    botonPorTexto(r.el, /Pagar con Nequi/).click();
    await r.estable();
    botonPorTexto(r.el, /Pagar en efectivo/).click();
    await r.estable();
    expect(p.pagos.pagarEnEfectivo).toHaveBeenCalledWith(4);
    r.fixture.destroy();
  });

  it('paradas: el máximo, la dirección vacía se envía como "Parada" y los pisos vacíos cuentan como 1', async () => {
    const r = await montarNuevo();
    for (let i = 0; i < 10; i++) r.i.agregarParada();
    const maximo = r.i.paradas().length;
    r.i.agregarParada();
    expect(r.i.paradas()).toHaveLength(maximo);
    r.fixture.destroy();
    TestBed.resetTestingModule();

    const r2 = await montarNuevo(puertos(), { servicio: 'trasteo' });
    ubicarAmbos(r2.fixture);
    r2.i.agregarParada();
    r2.i.paradas()[0].coords.set({ lat: 4.36, lon: -74.37 });
    escribir(q(r2.el, '#det-objetos'), 'Nevera y cama');
    escribir(q(r2.el, '#det-piso-o'), '');
    escribir(q(r2.el, '#det-piso-d'), '');
    r2.fixture.detectChanges();
    calcular(r2.el).click();
    await r2.estable();
    expect(r2.p.cotizar.cotizar).toHaveBeenCalledWith(
      expect.objectContaining({
        paradas: [{ direccion: 'Parada', coords: { lat: 4.36, lon: -74.37 } }],
        detalle: expect.objectContaining({ pisosOrigen: 1, pisosDestino: 1 }),
      }),
    );
    r2.fixture.destroy();
  });

  it('repetir un pedido: sin detalle, de insumos con todo y cuando no se puede leer', async () => {
    const p = puertos();
    p.envios.obtener.mockImplementation(async () => buildEnvio({ detalle: null, notas: null }));
    const r = await montarNuevo(p, { repetir: '5' });
    expect(q<HTMLInputElement>(r.el, '#origen').value).toBe('Casco Urbano');
    expect(q<HTMLInputElement>(r.el, '#det-que').value).toBe('Documentos');
    r.fixture.destroy();
    TestBed.resetTestingModule();
    const p2 = puertos();
    p2.envios.obtener.mockImplementation(async () =>
      buildEnvio({
        tipoServicio: 'insumos',
        detalle: { insumo: 'Abono', bultos: 4, pesoKg: 200, accesoDestapado: true, fragil: true },
        origenCoords: FUSA,
        destinoCoords: SILVANIA,
        destinatarioNombre: 'Luisa',
        destinatarioTelefono: '3001234567',
      }),
    );
    const r2 = await montarNuevo(p2, { repetir: '5' });
    expect(q<HTMLInputElement>(r2.el, '#det-insumo').value).toBe('Abono');
    expect(q<HTMLInputElement>(r2.el, '#det-peso').value).toBe('200');
    r2.fixture.destroy();
    TestBed.resetTestingModule();
    const p3 = puertos();
    p3.envios.obtener.mockImplementation(rechaza(new ApiError(404, 'No existe')));
    const r3 = await montarNuevo(p3, { repetir: '5' });
    expect(q<HTMLInputElement>(r3.el, '#origen').value).toBe('');
    r3.fixture.destroy();
  });

  it('cotiza sola tras ubicar las direcciones', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const r = await montarNuevo();
    ubicarAmbos(r.fixture);
    await vi.advanceTimersByTimeAsync(ESPERA_AUTOCOTIZAR_MS);
    expect(r.p.cotizar.cotizar).toHaveBeenCalledTimes(1);
    r.fixture.destroy();
  });
});
