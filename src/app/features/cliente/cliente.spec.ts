import { TestBed } from '@angular/core/testing';
import { CLIENTE, buildEnvio } from '../../../testing/fixtures';
import { FakeGeo, botonPorTexto, elegir, escribir, q, rechaza } from '../../../testing/fakes';
import { montar } from '../../../testing/pantallas';
import { ApiError } from '../../core/http/api-error';
import { Cotizacion, PagoResumen, Seguimiento, SolicitudCotizacion } from '../../core/domain';
import {
  ClientShipmentsPort,
  GeoPort,
  PaymentsPort,
  TrackingPort,
  QuotePort,
  RatingPort,
  ShipmentsPort,
  ZonesPort,
} from '../../core/ports';
import { ToastService } from '../../shared/ui/toast.service';
import { CalificarModalComponent } from './components/calificar-modal.component';
import { PinEnvioComponent } from './components/pin-envio.component';
import { EnvioDetallePage, INTERVALO_TRAZABILIDAD_MS } from './envio-detalle.page';
import { EnviosPage } from './envios.page';
import {
  ESPERA_AUTOCOTIZAR_MS,
  NuevoEnvioPage,
  VIGENCIA_COTIZACION_MS,
  errorFechaProgramada,
  fechaLocalInput,
} from './nuevo-envio.page';
import {
  CampoDireccionComponent,
  ESPERA_BUSQUEDA_MS,
} from '../../shared/ui/campo-direccion.component';
import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

const DESGLOSE = {
  categoria: 'Moto Express' as const,
  banderazo: 2000,
  distancia: 24150,
  tiempo: 3450,
  recargoZona: 2000,
  paradas: 0,
  recargoParadas: 0,
  idaYVuelta: false,
  recargoNocturno: 0,
  minimoAplicado: false,
  total: 31600,
};

const COTIZACION: Cotizacion = {
  distanciaKm: 34.5,
  tarifaBase: 2000,
  tarifaTotal: 31600,
  moneda: 'COP',
  duracionMin: 69,
  distanciaExacta: false,
  categoria: 'Moto Express',
  zona: { id: 4, nombre: 'Silvania' },
  zonaOrigen: null,
  desglose: DESGLOSE,
  opciones: [
    { categoria: 'Moto Express', tarifaTotal: 31600, minimoAplicado: false },
    { categoria: 'Motocarro', tarifaTotal: 44300, minimoAplicado: false },
    { categoria: 'Camioneta', tarifaTotal: 75500, minimoAplicado: false },
  ],
  nocturno: false,
  origenCoords: null,
  destinoCoords: null,
};

const ZONAS = [
  { id: 1, nombre: 'Casco Urbano', tarifaBase: 0 },
  { id: 2, nombre: 'Vereda Pekín', tarifaBase: 1500 },
  { id: 3, nombre: 'Vereda Novillero', tarifaBase: 2000 },
  { id: 4, nombre: 'Silvania', tarifaBase: 2000 },
  { id: 5, nombre: 'Pasca', tarifaBase: 2000 },
];

const FUSA = { lat: 4.3369, lon: -74.3638 };
const SILVANIA = { lat: 4.4036, lon: -74.3881 };

function puertosNuevoEnvio() {
  return {
    zonas: { listar: vi.fn(async () => ZONAS) },
    cotizar: {
      cotizar: vi.fn(async (_s: SolicitudCotizacion): Promise<Cotizacion> => COTIZACION),
    },
    envios: {
      crear: vi.fn(async () => buildEnvio({ id: 2, pin: '6175', tarifa: 31600 })),
      obtener: vi.fn(),
    },
  };
}

function pagosFalsos() {
  return {
    estado: vi.fn(async () => PAGO_PENDIENTE),
    reintentar: vi.fn(async () => PAGO_PENDIENTE),
    pagarEnEfectivo: vi.fn(async () => ({
      ...PAGO_PENDIENTE,
      metodo: 'efectivo' as const,
      estado: 'por_cobrar' as const,
    })),
  };
}

const PAGO_PENDIENTE: PagoResumen = {
  metodo: 'nequi',
  estado: 'pendiente',
  monto: 31600,
  telefono: '*** *** 4567',
  mensaje: 'Acepta el pago',
  actualizado: new Date(),
};

async function montarNuevo(p = puertosNuevoEnvio()) {
  const r = await montar(NuevoEnvioPage, {
    usuario: CLIENTE,
    providers: [
      { provide: ZonesPort, useValue: p.zonas },
      { provide: QuotePort, useValue: p.cotizar },
      { provide: ShipmentsPort, useValue: p.envios },
      { provide: PaymentsPort, useValue: pagosFalsos() },
    ],
  });
  await r.estable();
  return { ...r, p, geo: TestBed.inject(GeoPort) as FakeGeo };
}

/** Ubica un campo de dirección como si el cliente eligiera una sugerencia. */
function ubicar(
  fixture: ComponentFixture<unknown>,
  id: string,
  nombre: string,
  coords: { lat: number; lon: number },
) {
  const campo = fixture.debugElement
    .queryAll(By.directive(CampoDireccionComponent))
    .map((d) => d.componentInstance as CampoDireccionComponent)
    .find((c) => c.idCampo() === id);
  if (!campo) throw new Error(`No hay campo ${id}`);
  campo.seleccionar({ nombre, detalle: nombre, coords });
  fixture.detectChanges();
}

async function llenarCotizacion(fixture: ComponentFixture<unknown>, el: HTMLElement, tipo = 1) {
  ubicar(fixture, 'origen', 'Casco Urbano', FUSA);
  ubicar(fixture, 'destino', 'Silvania', SILVANIA);
  elegir(q(el, '#tipoCarga'), tipo);
}

/** Avanza los temporizadores falsos y redibuja (dos veces: para las promesas que encadenan). */
const pasoCon =
  (fixture: ComponentFixture<unknown>) =>
  async (ms = 0): Promise<void> => {
    await vi.advanceTimersByTimeAsync(ms);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
  };

const confirmar = (el: HTMLElement) => botonPorTexto(el, /Confirmar|Pagar con Nequi/);

describe('CU-005 y CU-006 NuevoEnvioPage', () => {
  afterEach(() => vi.useRealTimers());

  it('Dado las direcciones ubicadas, cuando cotizo, entonces muestra el precio, el desglose y el precio de cada vehículo', async () => {
    const { el, p, estable, fixture } = await montarNuevo();
    expect(el.querySelector('#zona')).toBeNull();
    await llenarCotizacion(fixture, el);
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    expect(p.cotizar.cotizar).toHaveBeenCalledWith({
      origen: 'Casco Urbano',
      destino: 'Silvania',
      categoria: undefined,
      origenCoords: FUSA,
      destinoCoords: SILVANIA,
      paradas: [],
      idaYVuelta: false,
      fechaProgramada: null,
    });
    const texto = el.textContent?.replace(/\s/g, ' ') ?? '';
    expect(texto).toContain('34.5 km');
    expect(texto).toContain('1 h 9 min');
    expect(texto).toContain('$ 31.600');
    expect(texto).toContain('Banderazo (Moto Express)');
    expect(texto).toContain('Recargo de zona · Silvania');
    expect(texto).toContain('Pagas en efectivo al recibir');
    const precios = Array.from(el.querySelectorAll('fieldset label .numeros')).map((x) =>
      x.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(precios).toEqual(['$ 31.600', '$ 31.600', '$ 44.300', '$ 75.500']);
    expect(confirmar(el).textContent).toMatch(/\$\s31\.600/);
  });

  it('Dado direcciones escritas a mano sin ubicar, pide ubicarlas y no cotiza', async () => {
    const { el, p, estable } = await montarNuevo();
    escribir(q(el, '#origen'), 'Casco Urbano');
    escribir(q(el, '#destino'), 'Silvania');
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    expect(p.cotizar.cotizar).not.toHaveBeenCalled();
    expect(q(el, '[role="alert"]').textContent).toContain('Ubica en el mapa todas las direcciones');
    expect(q(el, '#origen-error').textContent).toContain('Ubícala');
    expect(q(el, '#destino-error').textContent).toContain('Ubícala');
  });

  it('Dado un destino fuera de cobertura, muestra un mensaje claro', async () => {
    const p = puertosNuevoEnvio();
    p.cotizar.cotizar.mockImplementation(
      rechaza(new ApiError(400, 'La dirección de destino está fuera de nuestra zona de cobertura')),
    );
    const { el, estable, fixture } = await montarNuevo(p);
    await llenarCotizacion(fixture, el);
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    expect(q(el, '[role="alert"]').textContent).toContain('fuera de nuestra zona de cobertura');
  });

  it('Dado origen igual al destino, cuando cotizo, entonces lo señala y no llama a la API', async () => {
    const { el, p, estable } = await montarNuevo();
    escribir(q(el, '#origen'), 'Casco Urbano');
    escribir(q(el, '#destino'), 'casco urbano');
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    expect(q(el, '#destino-error').textContent).toContain('distinto del origen');
    expect(p.cotizar.cotizar).not.toHaveBeenCalled();
  });

  it('Dado que falta el tipo de carga, cuando confirmo, entonces no se crea la solicitud y se señala el campo', async () => {
    const { el, p, estable, fixture } = await montarNuevo();
    ubicar(fixture, 'origen', 'Casco Urbano', FUSA);
    ubicar(fixture, 'destino', 'Silvania', SILVANIA);
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    confirmar(el).click();
    await estable();
    expect(q(el, '#tipo-error').textContent).toContain('tipo de carga');
    expect(p.envios.crear).not.toHaveBeenCalled();
  });

  it('debería aceptar "Otro" con texto libre', async () => {
    const { el, p, estable, fixture } = await montarNuevo();
    await llenarCotizacion(fixture, el, 5);
    await estable();
    escribir(q(el, '#otroTipo'), 'Bicicleta');
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    confirmar(el).click();
    await estable();
    expect(p.envios.crear).toHaveBeenCalledWith(
      expect.objectContaining({ tipoCarga: 'Bicicleta' }),
    );
  });

  it('Dado una cotización vigente, cuando confirmo en efectivo, entonces crea el envío y muestra el PIN grande', async () => {
    const { el, p, estable, fixture } = await montarNuevo();
    await llenarCotizacion(fixture, el);
    escribir(q(el, '#destNombre'), '  Ana  Pérez ');
    escribir(q(el, '#destTelefono'), '300 123 4567');
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    confirmar(el).click();
    await estable();
    expect(p.envios.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoCarga: 'Documentos',
        origenCoords: FUSA,
        destinoCoords: SILVANIA,
        metodoPago: 'efectivo',
        telefonoNequi: undefined,
        destinatarioNombre: 'Ana Pérez',
        destinatarioTelefono: '3001234567',
      }),
    );
    expect(q(el, '[aria-label="PIN de entrega: 6 1 7 5"]')).toBeTruthy();
    expect(el.textContent).toContain('Avisamos a los conductores disponibles');
    expect(el.textContent).not.toContain('distinta de la cotizada');
  });

  it('un teléfono de quien recibe inválido se señala', async () => {
    const { el, estable } = await montarNuevo();
    escribir(q(el, '#destTelefono'), '12');
    await estable();
    expect(el.textContent).toContain('Escribe un teléfono de 7 a 15 dígitos');
  });

  it('con Nequi exige el celular, crea el cobro y muestra cómo aceptarlo', async () => {
    const p = puertosNuevoEnvio();
    p.envios.crear.mockImplementation(async () =>
      buildEnvio({ id: 2, pin: '6175', tarifa: 31600, metodoPago: 'nequi', pago: PAGO_PENDIENTE }),
    );
    const { el, estable, fixture } = await montarNuevo(p);
    await llenarCotizacion(fixture, el);
    const nequi = Array.from(el.querySelectorAll('fieldset label')).find((l) =>
      l.textContent?.includes('Pagas ahora desde tu app'),
    ) as HTMLElement;
    q<HTMLInputElement>(nequi, 'input').click();
    await estable();
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    expect(confirmar(el).textContent).toContain('Pagar con Nequi');
    escribir(q(el, '#telNequi'), '123');
    confirmar(el).click();
    await estable();
    expect(p.envios.crear).not.toHaveBeenCalled();
    expect(q(el, '#nequi-error').textContent).toContain('10 dígitos');
    escribir(q(el, '#telNequi'), '300 123 4567');
    confirmar(el).click();
    await estable();
    expect(p.envios.crear).toHaveBeenCalledWith(
      expect.objectContaining({ metodoPago: 'nequi', telefonoNequi: '3001234567' }),
    );
    expect(el.textContent).toContain('Acepta el cobro en tu app Nequi');
    expect(el.textContent).toContain('Esperando que aceptes el cobro');
  });

  it('agrega paradas (con recargo), exige ubicarlas y las envía en la cotización; también se pueden quitar', async () => {
    const { el, p, estable, fixture } = await montarNuevo();
    await llenarCotizacion(fixture, el);
    botonPorTexto(el, /Agregar una parada/).click();
    await estable();
    expect(el.textContent).toContain('Parada 1');
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    expect(el.textContent).toContain('Ubícala');
    p.cotizar.cotizar.mockClear();
    ubicar(fixture, 'parada-1', 'Chinauta', { lat: 4.27, lon: -74.4 });
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    expect(p.cotizar.cotizar).toHaveBeenLastCalledWith(
      expect.objectContaining({
        paradas: [{ direccion: 'Chinauta', coords: { lat: 4.27, lon: -74.4 } }],
      }),
    );
    botonPorTexto(el, /Agregar una parada/).click();
    botonPorTexto(el, /Agregar una parada/).click();
    await estable();
    expect(el.textContent).not.toContain('Agregar una parada');
    q<HTMLButtonElement>(el, 'button[aria-label="Quitar parada 3"]').click();
    q<HTMLButtonElement>(el, 'button[aria-label="Quitar parada 2"]').click();
    await estable();
    expect(el.textContent).not.toContain('Parada 2');
  });

  it('ida y vuelta y envío programado: valida la hora y la envía en la cotización', async () => {
    const { el, p, estable, fixture } = await montarNuevo();
    await llenarCotizacion(fixture, el);
    const opcion = (t: string) =>
      q<HTMLInputElement>(
        Array.from(el.querySelectorAll('fieldset label')).find((l) =>
          l.textContent?.includes(t),
        ) as HTMLElement,
        'input',
      );
    opcion('Ida y vuelta').click();
    opcion('Programar').click();
    await estable();
    const fecha = q<HTMLInputElement>(el, '#fecha');
    expect(fecha.min).toBeTruthy();
    escribir(fecha, fechaLocalInput(new Date(Date.now() + 10 * 60_000)));
    await estable();
    expect(q(el, '#fecha-error').textContent).toContain('al menos 30 minutos');
    escribir(fecha, fechaLocalInput(new Date(Date.now() + 10 * 86_400_000)));
    await estable();
    expect(q(el, '#fecha-error').textContent).toContain('hasta 7 días');
    const valida = new Date(Date.now() + 3 * 3_600_000);
    escribir(fecha, fechaLocalInput(valida));
    await estable();
    expect(el.querySelector('#fecha-error')).toBeNull();
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    const pedido = p.cotizar.cotizar.mock.lastCall?.[0] as SolicitudCotizacion;
    expect(pedido.idaYVuelta).toBe(true);
    expect(Math.abs(pedido.fechaProgramada!.getTime() - valida.getTime())).toBeLessThan(60_000);
  });

  it('el desglose muestra paradas e ida y vuelta', async () => {
    const p = puertosNuevoEnvio();
    p.cotizar.cotizar.mockImplementation(async () => ({
      ...COTIZACION,
      desglose: { ...DESGLOSE, paradas: 2, recargoParadas: 3000, idaYVuelta: true },
    }));
    const { el, estable, fixture } = await montarNuevo(p);
    await llenarCotizacion(fixture, el);
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    const texto = el.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(texto).toContain('2 paradas');
    expect(texto).toContain('(ida y vuelta)');
  });

  it('errorFechaProgramada y fechaLocalInput', () => {
    const ahora = new Date('2026-11-02T12:00:00');
    expect(errorFechaProgramada('', ahora)).toContain('Elige');
    expect(errorFechaProgramada('x', ahora)).toContain('no es válida');
    expect(errorFechaProgramada('2026-11-02T14:00', ahora)).toBe('');
    expect(fechaLocalInput(ahora)).toBe('2026-11-02T12:00');
  });

  it('debería avisar si la tarifa del envío difiere de la cotizada', async () => {
    const p = puertosNuevoEnvio();
    p.envios.crear.mockImplementation(async () => buildEnvio({ id: 2, tarifa: 41000 }));
    const { el, estable, fixture } = await montarNuevo(p);
    await llenarCotizacion(fixture, el);
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    confirmar(el).click();
    await estable();
    expect(el.textContent).toContain('distinta de la cotizada');
    botonPorTexto(el, 'Pedir otro envío').click();
    await estable();
    expect(el.textContent).toContain('Nuevo envío');
  });

  it('debería invalidar la cotización si cambia una dirección', async () => {
    const { el, estable, fixture } = await montarNuevo();
    await llenarCotizacion(fixture, el);
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    expect(confirmar(el).disabled).toBe(false);
    escribir(q(el, '#destino'), 'Pasca');
    await estable();
    expect(confirmar(el).disabled).toBe(true);
    expect(el.textContent).toContain('Cotización vencida');
  });

  it('debería invalidar la cotización a los 15 minutos', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { el, fixture } = await montarNuevo();
    await llenarCotizacion(fixture, el);
    botonPorTexto(el, 'Cotizar').click();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(confirmar(el).disabled).toBe(false);
    await vi.advanceTimersByTimeAsync(VIGENCIA_COTIZACION_MS);
    fixture.detectChanges();
    expect(confirmar(el).disabled).toBe(true);
  });

  it('si las zonas no cargan el formulario sigue; muestra el error de creación', async () => {
    const p = puertosNuevoEnvio();
    p.zonas.listar.mockImplementationOnce(rechaza(new ApiError(0, 'x')));
    p.envios.crear.mockImplementation(rechaza(new ApiError(500, 'Error interno del servidor')));
    const { el, estable, fixture } = await montarNuevo(p);
    await llenarCotizacion(fixture, el);
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    confirmar(el).click();
    await estable();
    expect(q(el, '[role="alert"]').textContent).toContain('Algo salió mal');
  });

  it('al cambiar de vehículo recotiza solo y crea con la categoría y las notas', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { el, p, fixture } = await montarNuevo();
    const paso = pasoCon(fixture);
    expect(q<HTMLInputElement>(el, '#categoria').checked).toBe(true);
    await llenarCotizacion(fixture, el);
    await paso(ESPERA_AUTOCOTIZAR_MS);
    expect(p.cotizar.cotizar).toHaveBeenCalledTimes(1);
    const camioneta = Array.from(el.querySelectorAll('fieldset label')).find((l) =>
      l.textContent?.includes('Camioneta'),
    );
    q<HTMLInputElement>(camioneta as HTMLElement, 'input[type=radio]').click();
    await paso(ESPERA_AUTOCOTIZAR_MS);
    expect(p.cotizar.cotizar).toHaveBeenCalledTimes(2);
    expect(p.cotizar.cotizar).toHaveBeenLastCalledWith(
      expect.objectContaining({ categoria: 'Camioneta' }),
    );
    expect(confirmar(el).textContent).toMatch(/\$\s75\.500/);
    escribir(q(el, '#notas'), '  Portería  ');
    await paso();
    confirmar(el).click();
    await paso();
    expect(p.envios.crear).toHaveBeenCalledWith(
      expect.objectContaining({ categoria: 'Camioneta', notas: 'Portería' }),
    );
  });

  it('con las dos direcciones elegidas de las sugerencias cotiza solo, con coordenadas y vista del mapa', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { el, p, fixture, geo } = await montarNuevo();
    const paso = pasoCon(fixture);
    geo.resultados = [
      {
        nombre: 'Parque principal, Fusagasugá',
        detalle: 'Parque principal, Fusagasugá, Cundinamarca',
        coords: FUSA,
      },
    ];
    escribir(q(el, '#origen'), 'Parque');
    await paso(ESPERA_BUSQUEDA_MS);
    expect(geo.buscar).toHaveBeenCalledWith('Parque');
    (el.querySelector('[role="option"]') as HTMLElement).click();
    await paso();
    expect(q<HTMLInputElement>(el, '#origen').value).toBe('Parque principal, Fusagasugá');
    expect(el.textContent).toContain('Ubicada en el mapa');
    expect(p.cotizar.cotizar).not.toHaveBeenCalled();

    geo.resultados = [{ nombre: 'Silvania', detalle: 'Silvania, Cundinamarca', coords: SILVANIA }];
    escribir(q(el, '#destino'), 'Silvania');
    await paso(ESPERA_BUSQUEDA_MS);
    (el.querySelectorAll('[role="option"]')[0] as HTMLElement).click();
    await paso(ESPERA_AUTOCOTIZAR_MS);
    expect(p.cotizar.cotizar).toHaveBeenCalledWith(
      expect.objectContaining({ origenCoords: FUSA, destinoCoords: SILVANIA }),
    );
    expect(el.querySelector('ti-mapa-envio')).toBeTruthy();
    expect(confirmar(el).disabled).toBe(false);
  });
});

describe('E6-HU2 EnviosPage', () => {
  function puerto(
    envios = [
      buildEnvio({
        id: 1,
        estado: 'Asignado',
        conductor: {
          nombre: 'Con',
          placa: 'ABC12D',
          vehiculo: 'Moto Express',
          calificacionPromedio: 4.7,
        },
      }),
      buildEnvio({ id: 2, estado: 'Entregado' }),
    ],
  ) {
    return { listar: vi.fn(async () => envios) };
  }

  it('debería separar Activos e Historial y ocultar el PIN por defecto', async () => {
    const p = puerto();
    const { el, estable } = await montar(EnviosPage, {
      usuario: CLIENTE,
      providers: [{ provide: ClientShipmentsPort, useValue: p }],
    });
    await estable();
    expect(p.listar).toHaveBeenCalled();
    expect(el.textContent).toContain('Envío #1');
    expect(el.textContent).not.toContain('Envío #2');
    expect(q(el, '[aria-label="PIN oculto: • • • •"]')).toBeTruthy();
    expect(el.textContent).toContain('Con');
    botonPorTexto(el, 'Mostrar PIN').click();
    await estable();
    expect(q(el, '[aria-label="PIN de entrega: 6 6 4 7"]')).toBeTruthy();
    q<HTMLButtonElement>(el, '#tab-historial').click();
    await estable();
    expect(el.textContent).toContain('Envío #2');
    expect(el.querySelector('[aria-label^="PIN"]')).toBeNull();
    q(el, '#tab-historial').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    await estable();
    expect(q(el, '#tab-activos').getAttribute('aria-selected')).toBe('true');
  });

  it('debería mostrar vacío y error con Reintentar', async () => {
    const p = puerto([]);
    p.listar.mockImplementationOnce(rechaza(new ApiError(0, 'x', 'SIN_CONEXION')));
    const { el, estable } = await montar(EnviosPage, {
      usuario: CLIENTE,
      providers: [{ provide: ClientShipmentsPort, useValue: p }],
    });
    await estable();
    expect(q(el, '[role="alert"]').textContent).toContain('No hay conexión');
    botonPorTexto(el, 'Reintentar').click();
    await estable();
    expect(el.textContent).toContain('No tienes envíos en curso.');
  });
});

describe('CU-008 y CU-010 EnvioDetallePage', () => {
  afterEach(() => vi.useRealTimers());

  function puertos(secuencia: ReturnType<typeof buildEnvio>[]) {
    let i = 0;
    return {
      envios: {
        crear: vi.fn(),
        obtener: vi.fn(async () => secuencia[Math.min(i++, secuencia.length - 1)]),
      },
      tracking: {
        seguimiento: vi.fn(async (): Promise<Seguimiento> => seguimientoDe(true)),
      },
      rating: { calificar: vi.fn(async () => ({ id: 1, calificacion: 4 })) },
    };
  }

  function seguimientoDe(enVivo: boolean, eta: number | null = 14): Seguimiento {
    return {
      idEnvio: 1,
      estado: 'En Ruta',
      origen: { direccion: 'Casco Urbano', coords: { lat: 4.3369, lon: -74.3638 } },
      destino: { direccion: 'Silvania', coords: { lat: 4.4033, lon: -74.3878 } },
      ultima: {
        lat: 4.35,
        lon: -74.37,
        capturadoEn: new Date(Date.now() - 5 * 60_000).toISOString(),
      },
      recorrido: [],
      enVivo,
      distanciaRestanteKm: eta ? 6.2 : null,
      etaMinutos: eta,
    };
  }

  async function montarDetalle(p: ReturnType<typeof puertos>, id = '1') {
    return montar(EnvioDetallePage, {
      usuario: CLIENTE,
      inputs: { id },
      providers: [
        { provide: ShipmentsPort, useValue: p.envios },
        { provide: TrackingPort, useValue: p.tracking },
        { provide: RatingPort, useValue: p.rating },
      ],
    });
  }

  it('debería mostrar la línea de tiempo cronológica, el estado actual y el PIN mientras está activo', async () => {
    const p = puertos([buildEnvio({ estado: 'Asignado' })]);
    const { el, estable, fixture } = await montarDetalle(p);
    await estable();
    const pasos = Array.from(el.querySelectorAll('ol[aria-label="Recorrido del envío"] li')).map(
      (li) => li.querySelector('p')?.textContent?.replace(' (estado actual)', '').trim(),
    );
    expect(pasos).toEqual(['Pendiente', 'Asignado', 'En Ruta', 'Entregado']);
    expect(q(el, '[aria-current="step"]').textContent).toContain('Asignado');
    expect(el.textContent).toContain('Un conductor tomó tu envío');
    expect(el.querySelector('ti-mapa-envio')).toBeTruthy();
    expect(q(el, '[aria-label="PIN oculto: • • • •"]')).toBeTruthy();
    fixture.destroy();
  });

  it('debería consultar cada 10 s y detenerse al quedar Entregado, abriendo la calificación', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const p = puertos([buildEnvio({ estado: 'Asignado' }), buildEnvio({ estado: 'Entregado' })]);
    const { el, fixture } = await montarDetalle(p);
    await vi.advanceTimersByTimeAsync(0);
    expect(p.envios.obtener).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(INTERVALO_TRAZABILIDAD_MS);
    fixture.detectChanges();
    expect(p.envios.obtener).toHaveBeenCalledTimes(2);
    expect(q(el, '[role="dialog"]').textContent).toContain('¿Cómo te fue con la entrega?');
    await vi.advanceTimersByTimeAsync(INTERVALO_TRAZABILIDAD_MS * 3);
    expect(p.envios.obtener).toHaveBeenCalledTimes(2);
    fixture.destroy();
  });

  it('no debería ofrecer calificar si el backend dice que ya está calificado', async () => {
    const p = puertos([buildEnvio({ estado: 'Entregado', calificado: true })]);
    const r = await montarDetalle(p);
    await r.estable();
    expect(r.el.querySelector('[role="dialog"]')).toBeNull();
    expect(r.el.textContent).toContain('Ya calificaste este envío.');
    r.fixture.destroy();
  });

  it('En Ruta debería mostrar el mapa con la llegada estimada, la distancia y la señal en vivo', async () => {
    const p = puertos([buildEnvio({ estado: 'En Ruta' })]);
    const { el, estable, fixture } = await montarDetalle(p);
    await estable();
    expect(p.tracking.seguimiento).toHaveBeenCalledWith(1);
    expect(el.querySelector('ti-mapa-envio')).toBeTruthy();
    const texto = el.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(texto).toContain('14 min');
    expect(texto).toContain('6,2 km');
    expect(texto).toContain('En vivo');
    fixture.destroy();
    TestBed.resetTestingModule();
    const p2 = puertos([buildEnvio({ estado: 'En Ruta' })]);
    p2.tracking.seguimiento.mockImplementation(async () => seguimientoDe(false, null));
    const r2 = await montarDetalle(p2);
    await r2.estable();
    expect(r2.el.textContent).toContain('hace 5 min');
    expect(r2.el.textContent).not.toContain('En vivo');
    r2.fixture.destroy();
  });

  it('si el mapa falla, la pantalla sigue funcionando sin él', async () => {
    const p = puertos([buildEnvio({ estado: 'Asignado' })]);
    p.tracking.seguimiento.mockImplementation(rechaza(new ApiError(0, 'x', 'SIN_CONEXION')));
    const r = await montarDetalle(p);
    await r.estable();
    expect(r.el.textContent).toContain('Un conductor tomó tu envío');
    expect(r.el.textContent).toContain('Sin señal aún');
    r.fixture.destroy();
  });

  it('no debería consultar el mapa de un envío Pendiente o Entregado', async () => {
    const p = puertos([buildEnvio({ estado: 'Pendiente' })]);
    const r = await montarDetalle(p);
    await r.estable();
    expect(p.tracking.seguimiento).not.toHaveBeenCalled();
    expect(r.el.querySelector('ti-mapa-envio')).toBeNull();
    r.fixture.destroy();
  });

  it('el cliente puede cancelar un envío Pendiente con motivo', async () => {
    const p = puertos([buildEnvio({ estado: 'Pendiente' })]);
    const cancelar = vi.fn(async () => buildEnvio({ estado: 'Cancelado' }));
    (p.envios as unknown as { cancelar: typeof cancelar }).cancelar = cancelar;
    const r = await montarDetalle(p);
    await r.estable();
    botonPorTexto(r.el, /Cancelar envío/).click();
    await r.estable();
    escribir(q(r.el, '#motivo'), 'Ya no lo necesito');
    p.envios.obtener.mockImplementation(async () =>
      buildEnvio({ estado: 'Cancelado', motivoCancelacion: 'Ya no lo necesito' }),
    );
    botonPorTexto(r.el, 'Sí, cancelar envío').click();
    await r.estable();
    expect(cancelar).toHaveBeenCalledWith(1, 'Ya no lo necesito');
    expect(r.el.textContent).toContain('Este envío fue cancelado');
    expect(r.el.textContent).toContain('Ya no lo necesito');
    expect(r.el.textContent).not.toContain('Sí, cancelar envío');
    r.fixture.destroy();
  });

  it('no ofrece cancelar cuando ya hay conductor, y muestra el error del backend', async () => {
    const p = puertos([buildEnvio({ estado: 'Asignado' })]);
    const r = await montarDetalle(p);
    await r.estable();
    expect(r.el.textContent).not.toContain('Cancelar envío');
    r.fixture.destroy();
    TestBed.resetTestingModule();
    const p2 = puertos([buildEnvio({ estado: 'Pendiente' })]);
    (p2.envios as unknown as { cancelar: unknown }).cancelar = vi.fn(
      rechaza(
        new ApiError(400, 'Solo puedes cancelar un envío mientras ningún conductor lo ha tomado'),
      ),
    );
    const r2 = await montarDetalle(p2);
    await r2.estable();
    botonPorTexto(r2.el, /Cancelar envío/).click();
    await r2.estable();
    botonPorTexto(r2.el, 'Sí, cancelar envío').click();
    await r2.estable();
    expect(q(r2.el, '[role="dialog"] [role="alert"]').textContent).toContain(
      'un conductor tomó tu envío',
    );
    r2.fixture.destroy();
  });

  it('debería informar id inválido, 404 y envío de otro cliente', async () => {
    const r1 = await montarDetalle(puertos([]), 'abc');
    expect(r1.el.textContent).toContain('Ese número de envío no es válido.');
    TestBed.resetTestingModule();
    const p404 = puertos([]);
    p404.envios.obtener.mockImplementation(
      rechaza(new ApiError(404, 'No existe el envío con id 9')),
    );
    const r2 = await montarDetalle(p404, '9');
    await r2.estable();
    expect(r2.el.textContent).toContain('No encontramos ese envío.');
    r2.fixture.destroy();
    TestBed.resetTestingModule();
    const p403 = puertos([]);
    p403.envios.obtener.mockImplementation(
      rechaza(new ApiError(403, 'No tienes permiso para ver este envío')),
    );
    const r3 = await montarDetalle(p403);
    await r3.estable();
    expect(r3.el.textContent).toContain('no pertenece a tu cuenta');
    expect(r3.el.textContent).not.toContain('6647');
    r3.fixture.destroy();
  });

  it('debería mostrar el error de red con Reintentar', async () => {
    const p = puertos([buildEnvio()]);
    p.envios.obtener.mockImplementationOnce(rechaza(new ApiError(500, 'x')));
    const r = await montarDetalle(p);
    await r.estable();
    expect(r.el.textContent).toContain('Algo salió mal');
    botonPorTexto(r.el, 'Reintentar').click();
    await r.estable();
    expect(r.el.textContent).toContain('Buscando un conductor');
    r.fixture.destroy();
  });
});

describe('CU-010 CalificarModalComponent', () => {
  async function montarModal(rating: { calificar: ReturnType<typeof vi.fn> }) {
    const r = await montar(CalificarModalComponent, {
      inputs: { idEnvio: 1 },
      providers: [{ provide: RatingPort, useValue: rating }],
    });
    const salidas: (number | null)[] = [];
    r.c.calificado.subscribe((v) => salidas.push(v));
    return { ...r, salidas };
  }

  it('Dado 4 estrellas, cuando envío, entonces registra un entero y agradece', async () => {
    const rating = { calificar: vi.fn(async () => ({ id: 1, calificacion: 4 })) };
    const { el, estable, salidas } = await montarModal(rating);
    const toast = vi.spyOn(TestBed.inject(ToastService), 'exito');
    expect(botonPorTexto(el, 'Enviar calificación').disabled).toBe(true);
    q<HTMLButtonElement>(el, '[aria-label="4 estrellas"]').click();
    await estable();
    botonPorTexto(el, 'Enviar calificación').click();
    await estable();
    expect(rating.calificar).toHaveBeenCalledWith(1, 4, undefined);
    expect(toast).toHaveBeenCalledWith('¡Gracias por calificar!');
    expect(salidas).toEqual([4]);
  });

  it('debería armar el comentario con las sugerencias y enviarlo', async () => {
    const rating = { calificar: vi.fn(async () => ({ id: 1, calificacion: 5 })) };
    const { el, estable } = await montarModal(rating);
    expect(el.textContent).not.toContain('¿Qué destacas?');
    q<HTMLButtonElement>(el, '[aria-label="5 estrellas"]').click();
    await estable();
    botonPorTexto(el, 'Puntual').click();
    botonPorTexto(el, 'Amable').click();
    botonPorTexto(el, 'Puntual').click();
    await estable();
    expect(q<HTMLTextAreaElement>(el, '#comentario').value).toBe('Amable');
    expect(botonPorTexto(el, 'Amable').getAttribute('aria-pressed')).toBe('true');
    botonPorTexto(el, 'Enviar calificación').click();
    await estable();
    expect(rating.calificar).toHaveBeenCalledWith(1, 5, 'Amable');
  });

  it('Dado que ya fue calificado, cuando envío, entonces lo marca y cierra sin volver a ofrecerlo', async () => {
    const rating = { calificar: vi.fn(rechaza(new ApiError(400, 'Este envío ya fue calificado'))) };
    const { el, estable, salidas } = await montarModal(rating);
    q<HTMLButtonElement>(el, '[aria-label="5 estrellas"]').click();
    await estable();
    botonPorTexto(el, 'Enviar calificación').click();
    await estable();
    expect(salidas).toEqual([null]);
  });

  it('debería mostrar otros errores sin cerrar', async () => {
    const rating = {
      calificar: vi.fn(
        rechaza(new ApiError(400, 'Solo se pueden calificar envíos que ya fueron entregados')),
      ),
    };
    const { el, estable, salidas } = await montarModal(rating);
    q<HTMLButtonElement>(el, '[aria-label="2 estrellas"]').click();
    await estable();
    botonPorTexto(el, 'Enviar calificación').click();
    await estable();
    expect(q(el, '[role="alert"]').textContent).toContain(
      'Solo puedes calificar un envío entregado.',
    );
    expect(salidas).toEqual([]);
  });
});

describe('PinEnvioComponent', () => {
  it('debería copiar el PIN al portapapeles y avisar si falla', async () => {
    const { el, estable } = await montar(PinEnvioComponent, { inputs: { pin: '1234' } });
    const toast = TestBed.inject(ToastService);
    const exito = vi.spyOn(toast, 'exito');
    const error = vi.spyOn(toast, 'error');
    const escribirClip = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: escribirClip },
      configurable: true,
    });
    botonPorTexto(el, 'Copiar PIN').click();
    await estable();
    expect(escribirClip).toHaveBeenCalledWith('1234');
    expect(exito).toHaveBeenCalledWith('PIN copiado');
    escribirClip.mockImplementation(rechaza(new Error('denegado')));
    botonPorTexto(el, 'Copiar PIN').click();
    await estable();
    expect(error).toHaveBeenCalled();
  });
});
