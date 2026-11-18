import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { EMPTY, Subject } from 'rxjs';
import { CLIENTE, buildEnvio } from '../../../testing/fixtures';
import { botonPorTexto, escribir, q, rechaza } from '../../../testing/fakes';
import { montar } from '../../../testing/pantallas';
import { ApiError } from '../../core/http/api-error';
import { Envio, Notificacion, PagoResumen } from '../../core/domain';
import {
  ChatPort,
  EventosPort,
  PaymentsPort,
  RatingPort,
  ShipmentsPort,
  TrackingPort,
} from '../../core/ports';
import { ToastService } from '../../shared/ui/toast.service';
import { EnvioDetallePage, INTERVALO_TRAZABILIDAD_MS } from './envio-detalle.page';

const PAGO: PagoResumen = {
  metodo: 'nequi',
  estado: 'pendiente',
  monto: 39500,
  telefono: '*** *** 4567',
  mensaje: 'Acepta el pago',
  actualizado: new Date(),
};

const DESGLOSE = {
  categoria: 'Moto Express' as const,
  banderazo: 2000,
  distancia: 24150,
  tiempo: 3450,
  recargoZona: 0,
  paradas: 0,
  recargoParadas: 0,
  idaYVuelta: false,
  recargoNocturno: 0,
  extras: [],
  recargoAcceso: 0,
  minimoAplicado: false,
  total: 39500,
};

function notificacion(
  idEnvio: number | null,
  tipo: Notificacion['tipo'] = 'envio_aceptado',
): Notificacion {
  return { id: 1, tipo, titulo: 't', mensaje: 'm', idEnvio, leida: false, fecha: new Date() };
}

function armar(secuencia: Envio[]) {
  let i = 0;
  const notificaciones = new Subject<Notificacion>();
  const cambios = new Subject<number>();
  const envios = {
    crear: vi.fn(),
    obtener: vi.fn(async () => secuencia[Math.min(i++, secuencia.length - 1)]),
    cancelar: vi.fn(async () => secuencia[0]),
    editar: vi.fn(async (_id: number, c: Partial<Envio>): Promise<Envio> => ({
      ...secuencia[0],
      ...c,
      pin: undefined,
    })),
  };
  return {
    envios,
    notificaciones,
    cambios,
    providers: [
      { provide: ShipmentsPort, useValue: envios },
      { provide: TrackingPort, useValue: { seguimiento: vi.fn(rechaza(new Error('sin mapa'))) } },
      {
        provide: RatingPort,
        useValue: { calificar: vi.fn(async () => ({ id: 1, calificacion: 5 })) },
      },
      {
        provide: PaymentsPort,
        useValue: {
          estado: vi.fn(async () => PAGO),
          reintentar: vi.fn(async () => PAGO),
          pagarEnEfectivo: vi.fn(async () => ({
            ...PAGO,
            metodo: 'efectivo' as const,
            estado: 'por_cobrar' as const,
          })),
        },
      },
      {
        provide: ChatPort,
        useValue: {
          mensajes: vi.fn(async () => ({ abierto: true, mensajes: [] })),
          enviar: vi.fn(),
        },
      },
      {
        provide: EventosPort,
        useValue: {
          conectado: signal(false),
          iniciar: vi.fn(),
          detener: vi.fn(),
          notificaciones: () => notificaciones,
          mensajes: () => EMPTY,
          cambiosEnvio: () => cambios,
        },
      },
    ],
  };
}

async function montarDetalle(
  a: ReturnType<typeof armar>,
  inputs: Record<string, unknown> = { id: '1' },
) {
  const r = await montar(EnvioDetallePage, { usuario: CLIENTE, inputs, providers: a.providers });
  await r.estable();
  return r;
}

const texto = (el: HTMLElement) => el.textContent?.replaceAll(/\s+/g, ' ') ?? '';

describe('EnvioDetallePage: detalle completo', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('muestra el código de recogida según la etapa y el PIN cuando el conductor llegó al destino', async () => {
    const a = armar([
      buildEnvio({ estado: 'Asignado', codigoRecogida: 'K7Q2', etapa: 'en_recogida' }),
    ]);
    const r = await montarDetalle(a);
    expect(texto(r.el)).toContain(
      'El conductor ya llegó: quien entrega la carga debe decirle este código.',
    );
    expect(q(r.el, '[aria-labelledby="titulo-codigo"]').classList).toContain('ring-4');
    r.fixture.destroy();
    TestBed.resetTestingModule();
    const b = armar([buildEnvio({ estado: 'Asignado', codigoRecogida: 'K7Q2' })]);
    const r2 = await montarDetalle(b);
    expect(texto(r2.el)).toContain('Compártelo con quien entregue la carga.');
    r2.fixture.destroy();
    TestBed.resetTestingModule();
    const c = armar([buildEnvio({ estado: 'En Ruta', etapa: 'en_destino' })]);
    const r3 = await montarDetalle(c);
    expect(texto(r3.el)).toContain('El conductor llegó: quien recibe le da este PIN');
    expect(r3.el.querySelector('#titulo-codigo')).toBeNull();
    r3.fixture.destroy();
  });

  it('un envío cancelado sin motivo lo indica', async () => {
    const r = await montarDetalle(
      armar([buildEnvio({ estado: 'Cancelado', motivoCancelacion: null })]),
    );
    expect(texto(r.el)).toContain('Sin motivo registrado.');
    r.fixture.destroy();
  });

  it('comparte el seguimiento: WhatsApp con el nombre de quien recibe, copiar y el menú del sistema', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const writeText = vi.fn(async () => undefined);
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const a = armar([
      buildEnvio({
        estado: 'Pendiente',
        tokenSeguimiento: 'tok',
        destinatarioNombre: 'Luisa Gómez',
        destinatarioTelefono: '3001234567',
      }),
    ]);
    const r = await montarDetalle(a);
    const enlace = q<HTMLAnchorElement>(r.el, 'a[href^="https://wa.me/"]').href;
    expect(decodeURIComponent(enlace)).toContain('Hola Luisa, te envié un paquete');
    expect(decodeURIComponent(enlace)).toContain('/seguimiento/tok');
    botonPorTexto(r.el, /Copiar enlace/).click();
    await vi.advanceTimersByTimeAsync(0);
    r.fixture.detectChanges();
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/seguimiento/tok`);
    expect(texto(r.el)).toContain('Copiado');
    await vi.advanceTimersByTimeAsync(2500);
    r.fixture.detectChanges();
    expect(texto(r.el)).toContain('Copiar enlace');
    botonPorTexto(r.el, /Más opciones/).click();
    await vi.advanceTimersByTimeAsync(0);
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Envío #1 · TrackIt Express' }),
    );
    // Si el portapapeles falla se muestra el enlace; si cierran el menú no pasa nada
    writeText.mockImplementation(rechaza(new Error('denegado')));
    share.mockImplementation(rechaza(new Error('AbortError')));
    const toast = vi.spyOn(TestBed.inject(ToastService), 'mostrar');
    botonPorTexto(r.el, /Copiar enlace/).click();
    botonPorTexto(r.el, /Más opciones/).click();
    await vi.advanceTimersByTimeAsync(0);
    expect(toast).toHaveBeenCalledWith(`${location.origin}/seguimiento/tok`);
    r.fixture.destroy();
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });

  it('WhatsApp sin nombre de quien recibe saluda sin nombre', async () => {
    const r = await montarDetalle(armar([buildEnvio({ tokenSeguimiento: 'tok' })]));
    expect(
      decodeURIComponent(q<HTMLAnchorElement>(r.el, 'a[href^="https://wa.me/"]').href),
    ).toContain('Hola, te envié');
    r.fixture.destroy();
  });

  it('la recogida muestra la factura de la compra, los bultos contados y el valor a pagar', async () => {
    const e = buildEnvio({
      estado: 'En Ruta',
      tipoServicio: 'mercado',
      detalle: { lista: 'Leche y pan', bultos: 3 },
      urlFotoRecogida: 'https://x/f.jpg',
      fechaRecogida: new Date('2026-10-29T08:00:00Z'),
      bultosRecogidos: 2,
      valorCompra: 45000,
    });
    const r = await montarDetalle(armar([e]));
    const t = texto(r.el);
    expect(t).toContain('Factura y compra');
    expect(t).toContain('Recogido');
    expect(t).toContain('El conductor contó 2 bultos (declaraste 3).');
    expect(t).toContain('Se paga en efectivo al recibir');
    expect(t).toContain('Leche y pan');
    r.fixture.destroy();
    TestBed.resetTestingModule();
    const iguales = {
      ...e,
      tipoServicio: 'paquete' as const,
      detalle: { bultos: 2 },
      valorCompra: null,
      fechaRecogida: null,
    };
    const r2 = await montarDetalle(armar([iguales]));
    expect(texto(r2.el)).toContain('Foto al recoger');
    expect(texto(r2.el)).toContain('El conductor contó 2 bultos.');
    expect(texto(r2.el)).not.toContain('Recogido');
    r2.fixture.destroy();
    TestBed.resetTestingModule();
    const sinBultos = {
      ...iguales,
      bultosRecogidos: null,
      detalle: { fragil: true },
      tipoServicio: 'trasteo' as const,
      tipoCarga: '',
    };
    const r3 = await montarDetalle(armar([sinBultos]));
    expect(texto(r3.el)).not.toContain('El conductor contó');
    expect(texto(r3.el)).toContain('Frágil');
    r3.fixture.destroy();
  });

  it('paradas, ida y vuelta, distancia, vehículo, desglose y datos del conductor', async () => {
    const e = buildEnvio({
      estado: 'En Ruta',
      paradas: [
        {
          id: 1,
          orden: 1,
          direccion: 'Droguería',
          coords: { lat: 4.3, lon: -74.3 },
          notas: null,
          completadaEn: new Date(),
        },
        {
          id: 2,
          orden: 2,
          direccion: 'Panadería',
          coords: { lat: 4.31, lon: -74.31 },
          notas: null,
          completadaEn: null,
        },
      ],
      idaYVuelta: true,
      destinoVisitadoEn: new Date(),
      distanciaKm: 12.4,
      duracionMin: 30,
      categoria: 'Furgoneta',
      desglose: DESGLOSE,
      destinatarioTelefono: '3001234567',
      conductor: {
        nombre: 'Camilo Rojas',
        vehiculo: 'Furgoneta',
        placa: 'ABC12D',
        calificacionPromedio: 4.8,
      },
      chatNoLeidos: 1,
    });
    const r = await montarDetalle(armar([e]));
    const t = texto(r.el);
    expect(t).toContain('Parada 1 · hecha');
    expect(t).toContain('Parada 2');
    expect(t).toContain('en camino de vuelta');
    expect(t).toContain('12.4 km');
    expect(t).toContain('Recibe: 3001234567');
    expect(t).toContain('★ 4.8');
    expect(r.el.querySelector('ti-desglose-tarifa')).toBeTruthy();
    expect(r.el.querySelector('#chat ti-chat-envio')).toBeTruthy();
    r.fixture.destroy();
    TestBed.resetTestingModule();
    const sinDatos = {
      ...e,
      conductor: { nombre: 'Leo' },
      idaYVuelta: true,
      destinoVisitadoEn: null,
      desglose: { ...DESGLOSE },
      distanciaKm: null,
      duracionMin: null,
    };
    const r2 = await montarDetalle(armar([sinDatos]));
    expect(texto(r2.el)).toContain('Vehículo');
    expect(texto(r2.el)).not.toContain('en camino de vuelta');
    r2.fixture.destroy();
  });

  it('el chat se ve con mensajes sin leer aunque el servicio ya terminó', async () => {
    const e = buildEnvio({
      estado: 'Entregado',
      calificado: true,
      conductor: { nombre: 'Leo' },
      chatNoLeidos: 2,
    });
    const r = await montarDetalle(armar([e]));
    expect(r.el.querySelector('#chat')).toBeTruthy();
    r.fixture.destroy();
  });

  it('el panel de pago actualiza el método del envío', async () => {
    const a = armar([buildEnvio({ estado: 'Pendiente', pago: PAGO, metodoPago: 'nequi' })]);
    const r = await montarDetalle(a);
    botonPorTexto(r.el, /efectivo/i).click();
    await r.estable();
    r.fixture.detectChanges();
    expect(texto(r.el)).toContain('efectivo');
    r.fixture.destroy();
  });

  it('?chat=1 lleva al chat cuando ya hay conductor', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const a = armar([buildEnvio({ estado: 'Asignado', conductor: { nombre: 'Leo' } })]);
    const r = await montar(EnvioDetallePage, {
      usuario: CLIENTE,
      inputs: { id: '1', chat: '1' },
      providers: a.providers,
    });
    await vi.advanceTimersByTimeAsync(0);
    r.fixture.detectChanges();
    const chat = q(r.el, '#chat');
    const desplazar = vi.fn();
    chat.scrollIntoView = desplazar;
    await vi.advanceTimersByTimeAsync(300);
    expect(desplazar).toHaveBeenCalled();
    r.fixture.destroy();
  });

  it('calificar desde el botón, cerrar el modal y marcarlo como calificado', async () => {
    const r = await montarDetalle(armar([buildEnvio({ estado: 'Entregado' })]));
    // Se abrió solo: se cierra y se vuelve a abrir con el botón
    botonPorTexto(q(r.el, '[role="dialog"]'), /Ahora no|Cerrar/).click();
    await r.estable();
    expect(r.el.querySelector('[role="dialog"]')).toBeNull();
    botonPorTexto(r.el, /Calificar el servicio/).click();
    await r.estable();
    r.el
      .querySelectorAll<HTMLButtonElement>('[role="dialog"] button[aria-label*="estrella"]')[4]
      ?.click();
    r.fixture.detectChanges();
    botonPorTexto(q(r.el, '[role="dialog"]'), /Enviar/).click();
    await r.estable();
    expect(texto(r.el)).toContain('Ya calificaste este envío.');
    r.fixture.destroy();
  });

  it('el modal de cancelación se cierra con Volver o con la X y avisa mientras cancela', async () => {
    const a = armar([
      buildEnvio({ estado: 'Pendiente', fechaProgramada: new Date('2026-11-20T15:00:00Z') }),
    ]);
    const r = await montarDetalle(a);
    expect(texto(r.el)).toContain('Programado:');
    botonPorTexto(r.el, /Cancelar envío/).click();
    await r.estable();
    botonPorTexto(r.el, 'Volver').click();
    await r.estable();
    expect(r.el.querySelector('#motivo')).toBeNull();
    botonPorTexto(r.el, /Cancelar envío/).click();
    await r.estable();
    q<HTMLButtonElement>(r.el, '[role="dialog"] button[aria-label="Cerrar"]').click();
    await r.estable();
    expect(r.el.querySelector('#motivo')).toBeNull();
    let terminar!: (e: Envio) => void;
    a.envios.cancelar.mockImplementation(() => new Promise<Envio>((ok) => (terminar = ok)));
    botonPorTexto(r.el, /Cancelar envío/).click();
    await r.estable();
    botonPorTexto(r.el, 'Sí, cancelar envío').click();
    r.fixture.detectChanges();
    expect(botonPorTexto(r.el, 'Cancelando…').disabled).toBe(true);
    terminar(buildEnvio({ estado: 'Cancelado' }));
    await r.estable();
    r.fixture.destroy();
  });

  it('edita los datos de un envío pendiente, valida el tipo de carga y muestra el error', async () => {
    const a = armar([
      buildEnvio({
        estado: 'Pendiente',
        notas: 'Portón',
        destinatarioNombre: 'Luisa',
        destinatarioTelefono: '300',
      }),
    ]);
    const r = await montarDetalle(a);
    const abrir = () => botonPorTexto(r.el, /Editar datos del envío/).click();
    abrir();
    await r.estable();
    expect(q<HTMLTextAreaElement>(r.el, '#ed-notas').value).toBe('Portón');
    botonPorTexto(r.el, 'Cancelar').click();
    await r.estable();
    expect(r.el.querySelector('#ed-tipo')).toBeNull();
    abrir();
    await r.estable();
    q<HTMLButtonElement>(r.el, '[role="dialog"] button[aria-label="Cerrar"]').click();
    await r.estable();
    expect(r.el.querySelector('#ed-tipo')).toBeNull();

    abrir();
    await r.estable();
    escribir(q(r.el, '#ed-tipo'), '   ');
    botonPorTexto(r.el, /Guardar cambios/).click();
    await r.estable();
    expect(q(r.el, '[role="dialog"] [role="alert"]').textContent).toContain(
      'Indica el tipo de carga.',
    );

    escribir(q(r.el, '#ed-tipo'), 'Ropa');
    escribir(q(r.el, '#ed-nombre'), ' Luisa Gómez ');
    escribir(q(r.el, '#ed-tel'), '300 123-4567');
    escribir(q(r.el, '#ed-notas'), ' Timbre 2 ');
    botonPorTexto(r.el, /Guardar cambios/).click();
    await r.estable();
    expect(a.envios.editar).toHaveBeenCalledWith(1, {
      tipoCarga: 'Ropa',
      notas: 'Timbre 2',
      destinatarioNombre: 'Luisa Gómez',
      destinatarioTelefono: '3001234567',
    });
    expect(r.el.querySelector('#ed-tipo')).toBeNull();
    // Conserva el PIN que ya tenía
    expect(r.el.querySelector('ti-pin-envio')).toBeTruthy();

    a.envios.editar.mockImplementation(rechaza(new ApiError(400, 'El envío ya fue tomado')));
    abrir();
    await r.estable();
    botonPorTexto(r.el, /Guardar cambios/).click();
    await r.estable();
    expect(q(r.el, '[role="dialog"] [role="alert"]').textContent).toBeTruthy();
    r.fixture.destroy();
  });

  it('edición de un envío sin datos opcionales y respuesta con PIN', async () => {
    const a = armar([
      buildEnvio({
        estado: 'Pendiente',
        notas: null,
        destinatarioNombre: null,
        destinatarioTelefono: null,
      }),
    ]);
    let terminar!: (e: Envio) => void;
    a.envios.editar.mockImplementation(() => new Promise<Envio>((ok) => (terminar = ok)));
    const r = await montarDetalle(a);
    botonPorTexto(r.el, /Editar datos del envío/).click();
    await r.estable();
    expect(q<HTMLInputElement>(r.el, '#ed-nombre').value).toBe('');
    botonPorTexto(r.el, /Guardar cambios/).click();
    r.fixture.detectChanges();
    expect(q(r.el, '[role="dialog"] ti-icono.animate-spin')).toBeTruthy();
    terminar({ ...buildEnvio(), pin: '1111' });
    await r.estable();
    expect(a.envios.editar).toHaveBeenCalled();
    r.fixture.destroy();
  });

  it('los avisos en vivo del envío lo vuelven a consultar; los de otro envío o de chat no', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const a = armar([buildEnvio({ estado: 'Asignado' })]);
    const r = await montar(EnvioDetallePage, {
      usuario: CLIENTE,
      inputs: { id: '1' },
      providers: a.providers,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(a.envios.obtener).toHaveBeenCalledTimes(1);
    a.notificaciones.next(notificacion(1));
    a.notificaciones.next(notificacion(1, 'mensaje_chat'));
    a.notificaciones.next(notificacion(7));
    await vi.advanceTimersByTimeAsync(0);
    expect(a.envios.obtener).toHaveBeenCalledTimes(2);
    a.cambios.next(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(a.envios.obtener).toHaveBeenCalledTimes(3);
    r.fixture.destroy();
  });

  it('con el sondeo detenido (envío terminado) un aviso consulta directamente', async () => {
    const a = armar([buildEnvio({ estado: 'Entregado', calificado: true })]);
    const r = await montarDetalle(a);
    const antes = a.envios.obtener.mock.calls.length;
    a.cambios.next(1);
    await r.estable();
    expect(a.envios.obtener).toHaveBeenCalledTimes(antes + 1);
    r.fixture.destroy();
  });

  it('un aviso antes de cargar el envío se ignora', async () => {
    const a = armar([buildEnvio()]);
    a.envios.obtener.mockImplementation(() => new Promise<Envio>(() => undefined));
    const r = await montar(EnvioDetallePage, {
      usuario: CLIENTE,
      inputs: { id: '1' },
      providers: a.providers,
    });
    a.cambios.next(1);
    expect(a.envios.obtener).toHaveBeenCalledTimes(1);
    r.fixture.destroy();
  });

  it('Reintentar tras un 404 reinicia la consulta; con un id inválido no hay nada que reintentar', async () => {
    const a = armar([buildEnvio({ estado: 'Pendiente' })]);
    a.envios.obtener.mockImplementationOnce(rechaza(new ApiError(404, 'No existe')));
    const r = await montarDetalle(a);
    expect(texto(r.el)).toContain('No encontramos ese envío.');
    (r.c as unknown as { reintentar(): void }).reintentar();
    await r.estable();
    expect(texto(r.el)).toContain('Buscando conductor');
    r.fixture.destroy();
    TestBed.resetTestingModule();
    const b = armar([]);
    const r2 = await montarDetalle(b, { id: 'x' });
    (r2.c as unknown as { reintentar(): void }).reintentar();
    expect(b.envios.obtener).not.toHaveBeenCalled();
    r2.fixture.destroy();
  });

  it('un error de red con el envío ya cargado no lo reemplaza', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const a = armar([buildEnvio({ estado: 'Pendiente' })]);
    const r = await montar(EnvioDetallePage, {
      usuario: CLIENTE,
      inputs: { id: '1' },
      providers: a.providers,
    });
    await vi.advanceTimersByTimeAsync(0);
    a.envios.obtener.mockImplementation(rechaza(new ApiError(0, 'x', 'SIN_CONEXION')));
    await vi.advanceTimersByTimeAsync(INTERVALO_TRAZABILIDAD_MS);
    r.fixture.detectChanges();
    expect(texto(r.el)).toContain('Buscando conductor');
    r.fixture.destroy();
  });
});
