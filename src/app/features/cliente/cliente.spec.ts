import { TestBed } from '@angular/core/testing';
import { CLIENTE, buildEnvio } from '../../../testing/fixtures';
import { botonPorTexto, elegir, escribir, q, rechaza } from '../../../testing/fakes';
import { montar } from '../../../testing/pantallas';
import { ApiError } from '../../core/http/api-error';
import {
  ClientShipmentsPort,
  LocationTransportPort,
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
import { NuevoEnvioPage, VIGENCIA_COTIZACION_MS } from './nuevo-envio.page';

const COTIZACION = {
  distanciaKm: 34.5,
  tarifaBase: 5000,
  tarifaTotal: 39500,
  moneda: 'COP' as const,
};

const ZONAS = [
  { id: 1, nombre: 'Casco Urbano', tarifaBase: 5000 },
  { id: 2, nombre: 'Vereda Pekín', tarifaBase: 7000 },
  { id: 3, nombre: 'Vereda Novillero', tarifaBase: 7000 },
  { id: 4, nombre: 'Silvania', tarifaBase: 9000 },
  { id: 5, nombre: 'Pasca', tarifaBase: 9000 },
];

function puertosNuevoEnvio() {
  return {
    zonas: { listar: vi.fn(async () => ZONAS) },
    cotizar: { cotizar: vi.fn(async () => COTIZACION) },
    envios: {
      crear: vi.fn(async () => buildEnvio({ id: 2, pin: '6175', tarifa: 39500 })),
      obtener: vi.fn(),
    },
  };
}

async function montarNuevo(p = puertosNuevoEnvio()) {
  const r = await montar(NuevoEnvioPage, {
    usuario: CLIENTE,
    providers: [
      { provide: ZonesPort, useValue: p.zonas },
      { provide: QuotePort, useValue: p.cotizar },
      { provide: ShipmentsPort, useValue: p.envios },
    ],
  });
  await r.estable();
  return { ...r, p };
}

async function llenarCotizacion(el: HTMLElement, tipo = 1) {
  escribir(q(el, '#origen'), '  Casco   Urbano ');
  escribir(q(el, '#destino'), 'Silvania');
  elegir(q(el, '#zona'), 1);
  elegir(q(el, '#tipoCarga'), tipo);
}

describe('CU-005 y CU-006 NuevoEnvioPage', () => {
  afterEach(() => vi.useRealTimers());

  it('Dado datos válidos, cuando cotizo, entonces muestra distancia estimada, tarifa base y total sin recalcular', async () => {
    const { el, p, estable } = await montarNuevo();
    expect(el.querySelectorAll('#zona option')).toHaveLength(6);
    expect(el.querySelectorAll('#lugares option')).toHaveLength(6);
    await llenarCotizacion(el);
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    expect(p.cotizar.cotizar).toHaveBeenCalledWith({
      origen: 'Casco Urbano',
      destino: 'Silvania',
      idZona: 1,
    });
    const texto = el.textContent?.replace(/\s/g, ' ') ?? '';
    expect(texto).toContain('34.5 km');
    expect(texto).toContain('$ 5.000');
    expect(texto).toContain('$ 39.500');
    expect(texto).toContain('La distancia es una estimación');
  });

  it('Dado una zona inexistente (404), cuando cotizo, entonces muestra el error y no calcula', async () => {
    const p = puertosNuevoEnvio();
    p.cotizar.cotizar.mockImplementation(rechaza(new ApiError(404, 'Zona no encontrada')));
    const { el, estable } = await montarNuevo(p);
    await llenarCotizacion(el);
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    expect(q(el, '[role="alert"]').textContent).toContain('La zona elegida no existe');
    expect(el.textContent).not.toContain('Confirmar solicitud');
  });

  it('Dado origen igual al destino, cuando cotizo, entonces lo señala y no llama a la API', async () => {
    const { el, p, estable } = await montarNuevo();
    await llenarCotizacion(el);
    escribir(q(el, '#destino'), 'casco urbano');
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    expect(q(el, '#destino-error').textContent).toContain('distinto del origen');
    expect(p.cotizar.cotizar).not.toHaveBeenCalled();
  });

  it('Dado que falta el tipo de carga, cuando intento cotizar, entonces no se crea la solicitud y se señala el campo', async () => {
    const { el, p, estable } = await montarNuevo();
    escribir(q(el, '#origen'), 'Casco Urbano');
    escribir(q(el, '#destino'), 'Silvania');
    elegir(q(el, '#zona'), 1);
    q(el, '#tipoCarga').dispatchEvent(new Event('blur'));
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    expect(q(el, '#tipo-error').textContent).toContain('tipo de carga');
    expect(p.cotizar.cotizar).not.toHaveBeenCalled();
    expect(p.envios.crear).not.toHaveBeenCalled();
  });

  it('debería aceptar "Otro" con texto libre', async () => {
    const { el, p, estable } = await montarNuevo();
    await llenarCotizacion(el, 5);
    await estable();
    escribir(q(el, '#otroTipo'), 'Bicicleta');
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    botonPorTexto(el, 'Confirmar solicitud').click();
    await estable();
    expect(p.envios.crear).toHaveBeenCalledWith(
      expect.objectContaining({ tipoCarga: 'Bicicleta' }),
    );
  });

  it('Dado una cotización vigente, cuando confirmo, entonces crea el envío y muestra el PIN grande con el aviso', async () => {
    const { el, p, estable } = await montarNuevo();
    await llenarCotizacion(el);
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    botonPorTexto(el, 'Confirmar solicitud').click();
    await estable();
    expect(p.envios.crear).toHaveBeenCalledWith(
      expect.objectContaining({ idZona: 1, tipoCarga: 'Documentos', categoria: undefined }),
    );
    expect(q(el, '[aria-label="PIN de entrega: 6 1 7 5"]')).toBeTruthy();
    expect(el.textContent).toContain('Entrega este PIN al conductor solo al recibir tu paquete.');
    expect(el.textContent).not.toContain('distinta de la cotizada');
  });

  it('debería avisar si la tarifa del envío difiere de la cotizada', async () => {
    const p = puertosNuevoEnvio();
    p.envios.crear.mockImplementation(async () => buildEnvio({ id: 2, tarifa: 41000 }));
    const { el, estable } = await montarNuevo(p);
    await llenarCotizacion(el);
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    botonPorTexto(el, 'Confirmar solicitud').click();
    await estable();
    expect(el.textContent).toContain('distinta de la cotizada');
    botonPorTexto(el, 'Pedir otro envío').click();
    await estable();
    expect(el.textContent).toContain('Nuevo envío');
  });

  it('debería invalidar la cotización si cambia un campo', async () => {
    const { el, estable } = await montarNuevo();
    await llenarCotizacion(el);
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    expect(botonPorTexto(el, 'Confirmar solicitud').disabled).toBe(false);
    escribir(q(el, '#destino'), 'Pasca');
    await estable();
    expect(botonPorTexto(el, 'Confirmar solicitud').disabled).toBe(true);
    expect(el.textContent).toContain('Cotización vencida');
  });

  it('debería invalidar la cotización a los 15 minutos', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { el, fixture } = await montarNuevo();
    await llenarCotizacion(el);
    botonPorTexto(el, 'Cotizar').click();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(botonPorTexto(el, 'Confirmar solicitud').disabled).toBe(false);
    await vi.advanceTimersByTimeAsync(VIGENCIA_COTIZACION_MS);
    fixture.detectChanges();
    expect(botonPorTexto(el, 'Confirmar solicitud').disabled).toBe(true);
  });

  it('debería mostrar el error de creación y permitir reintentar la carga de zonas', async () => {
    const p = puertosNuevoEnvio();
    p.zonas.listar.mockImplementationOnce(rechaza(new ApiError(0, 'x')));
    p.envios.crear.mockImplementation(rechaza(new ApiError(500, 'Error interno del servidor')));
    const { el, estable } = await montarNuevo(p);
    expect(el.textContent).toContain('No se pudieron cargar las zonas');
    botonPorTexto(el, 'Reintentar').click();
    await estable();
    await llenarCotizacion(el);
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    botonPorTexto(el, 'Confirmar solicitud').click();
    await estable();
    expect(q(el, '[role="alert"]').textContent).toContain('Algo salió mal');
  });

  it('debería enviar la categoría de vehículo elegida al crear', async () => {
    const { el, p, estable } = await montarNuevo();
    expect(q<HTMLSelectElement>(el, '#categoria').options[0].textContent).toContain(
      'Cualquier vehículo',
    );
    await llenarCotizacion(el);
    elegir(q(el, '#categoria'), 3);
    botonPorTexto(el, 'Cotizar').click();
    await estable();
    botonPorTexto(el, 'Confirmar solicitud').click();
    await estable();
    expect(p.envios.crear).toHaveBeenCalledWith(
      expect.objectContaining({ categoria: 'Camioneta' }),
    );
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
      ubicacion: {
        enviar: vi.fn(),
        ultima: vi.fn(async () => ({ lat: 4.3, lon: -74.3, capturadoEn: 'x' })),
      },
      rating: { calificar: vi.fn(async () => ({ id: 1, calificacion: 4 })) },
    };
  }

  async function montarDetalle(p: ReturnType<typeof puertos>, id = '1') {
    return montar(EnvioDetallePage, {
      usuario: CLIENTE,
      inputs: { id },
      providers: [
        { provide: ShipmentsPort, useValue: p.envios },
        { provide: LocationTransportPort, useValue: p.ubicacion },
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

  it('debería mostrar el mapa En Ruta con la última posición, y avisar si aún no hay', async () => {
    const p = puertos([buildEnvio({ estado: 'En Ruta' })]);
    const { el, estable, fixture } = await montarDetalle(p);
    await estable();
    expect(p.ubicacion.ultima).toHaveBeenCalledWith(1);
    expect(el.querySelector('ti-mapa-envio')).toBeTruthy();
    expect(el.textContent).not.toContain('todavía no comparte');
    fixture.destroy();
    TestBed.resetTestingModule();
    const p2 = puertos([buildEnvio({ estado: 'En Ruta' })]);
    p2.ubicacion.ultima.mockImplementation(async () => null as never);
    const r2 = await montarDetalle(p2);
    await r2.estable();
    expect(r2.el.textContent).toContain('El conductor todavía no comparte su ubicación.');
    r2.fixture.destroy();
  });

  it('no debería consultar la ubicación de un envío Pendiente o Entregado', async () => {
    const p = puertos([buildEnvio({ estado: 'Pendiente' })]);
    const r = await montarDetalle(p);
    await r.estable();
    expect(p.ubicacion.ultima).not.toHaveBeenCalled();
    expect(r.el.querySelector('ti-mapa-envio')).toBeNull();
    r.fixture.destroy();
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
    expect(rating.calificar).toHaveBeenCalledWith(1, 4);
    expect(toast).toHaveBeenCalledWith('¡Gracias por calificar!');
    expect(salidas).toEqual([4]);
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
