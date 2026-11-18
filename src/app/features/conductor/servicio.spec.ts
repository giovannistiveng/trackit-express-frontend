import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { EMPTY, Subject } from 'rxjs';
import { CONDUCTOR, buildEnvio } from '../../../testing/fixtures';
import { botonPorTexto, q, rechaza } from '../../../testing/fakes';
import { montar } from '../../../testing/pantallas';
import { ApiError } from '../../core/http/api-error';
import { Envio, MensajeChat, Notificacion, Parada } from '../../core/domain';
import {
  ChatPort,
  DeliveryPort,
  DriverProfilePort,
  DriverServicePort,
  EventosPort,
  EvidenceStoragePort,
  TrackingPort,
} from '../../core/ports';
import { By } from '@angular/platform-browser';
import { ServicioPage } from './servicio.page';
import { EntregaModalComponent } from './components/entrega-modal.component';
import { CompartirUbicacionService } from './state/compartir-ubicacion.service';
import { DriverProfileStore } from './state/driver-profile.store';

const PARADA: Parada = {
  id: 11,
  orden: 1,
  direccion: 'Chinauta',
  coords: { lat: 4.27, lon: -74.4 },
  notas: null,
  completadaEn: null,
};

type EstadoUbicacion = 'apagado' | 'activo' | 'denegado' | 'no-disponible';

function ubicacionFalsa() {
  return {
    estado: signal<EstadoUbicacion>('apagado'),
    motivo: signal(''),
    ultimaPosicion: signal(null),
    compartiendo: vi.fn(() => false),
    iniciar: vi.fn(),
    detener: vi.fn(),
  };
}

function armar(envio: Envio) {
  const notificaciones = new Subject<Notificacion>();
  const ubicacion = ubicacionFalsa();
  const servicio = {
    aceptar: vi.fn(),
    activo: vi.fn(),
    obtener: vi.fn(async () => envio),
    llegadaRecogida: vi.fn(async (): Promise<Envio> => ({ ...envio, etapa: 'en_recogida' })),
    recoger: vi.fn(),
    completarParada: vi.fn(async (): Promise<Parada[]> => [
      { ...PARADA, completadaEn: new Date() },
    ]),
    llegadaDestino: vi.fn(async (): Promise<Envio> => ({
      ...envio,
      destinoVisitadoEn: new Date(),
    })),
  };
  const seguimiento = vi.fn(rechaza(new ApiError(0, 'x')));
  return {
    servicio,
    ubicacion,
    notificaciones,
    seguimiento,
    providers: [
      {
        provide: DriverProfilePort,
        useValue: {
          obtener: vi.fn(async () => ({
            idConductor: 1,
            estadoAprobacion: 'Aprobado',
            motivoRechazo: null,
          })),
        },
      },
      { provide: DriverServicePort, useValue: servicio },
      { provide: TrackingPort, useValue: { seguimiento } },
      { provide: EvidenceStoragePort, useValue: { subir: vi.fn() } },
      { provide: DeliveryPort, useValue: { validar: vi.fn() } },
      { provide: CompartirUbicacionService, useValue: ubicacion },
      {
        provide: ChatPort,
        useValue: {
          mensajes: vi.fn(async () => ({ abierto: true, mensajes: [] as MensajeChat[] })),
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
          cambiosEnvio: () => EMPTY,
        },
      },
    ],
  };
}

async function montarServicio(
  a: ReturnType<typeof armar>,
  inputs: Record<string, unknown> = { id: '5' },
) {
  const r = await montar(ServicioPage, { usuario: CONDUCTOR, inputs, providers: a.providers });
  await TestBed.inject(DriverProfileStore).cargar(true);
  await r.c.cargar();
  await r.estable();
  return r;
}

const texto = (el: HTMLElement) => el.textContent?.replaceAll(/\s+/g, ' ') ?? '';
const base = (parcial: Partial<Envio> = {}) =>
  buildEnvio({ id: 5, estado: 'Asignado', pin: undefined, ...parcial });

function notificacion(
  idEnvio: number,
  tipo: Notificacion['tipo'] = 'envio_cancelado',
): Notificacion {
  return { id: 1, tipo, titulo: 't', mensaje: 'm', idEnvio, leida: false, fecha: new Date() };
}

describe('ServicioPage: casos de borde', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('muestra la ganancia, quién entrega y quién recibe con sus teléfonos, y el detalle de la recogida', async () => {
    const a = armar(
      base({
        estado: 'En Ruta',
        gananciaConductor: 18000,
        tipoServicio: 'insumos',
        detalle: { insumo: 'Abono', contactoOrigenTelefono: '3001234567' },
        destinatarioTelefono: '3109876543',
        bultosRecogidos: 4,
        valorCompra: 12000,
        notas: 'Portón verde',
        distanciaKm: 8.2,
      }),
    );
    const r = await montarServicio(a);
    const t = texto(r.el);
    expect(t).toContain('Ganas');
    expect(t).toContain('Entrega: Sin nombre');
    expect(t).toContain('Recibe: Sin nombre');
    expect(r.el.querySelectorAll('a[href^="tel:"]')).toHaveLength(2);
    expect(t).toContain('Abono');
    expect(t).toContain('Contaste 4 bultos al recoger.');
    expect(t).toContain('Compra registrada');
    expect(t).toContain('Indicaciones del cliente: Portón verde');
    expect(t).toContain('(8.2 km)');
    r.fixture.destroy();
  });

  it('entregado: muestra lo ganado; con nombres de contacto y sin teléfonos', async () => {
    const a = armar(
      base({
        estado: 'Entregado',
        gananciaConductor: 18000,
        detalle: { contactoOrigenNombre: 'Don Pedro' },
        destinatarioNombre: 'Luisa',
        tipoServicio: 'trasteo',
        tipoCarga: '',
      }),
    );
    const r = await montarServicio(a);
    const t = texto(r.el);
    expect(t).toContain('Ganaste');
    expect(t).toContain('Entrega: Don Pedro');
    expect(t).toContain('Recibe: Luisa');
    expect(r.el.querySelector('a[href^="tel:"]')).toBeNull();
    r.fixture.destroy();
  });

  it('con dos paradas pendientes lo indica', async () => {
    const r = await montarServicio(
      armar(
        base({
          estado: 'En Ruta',
          etapa: 'en_destino',
          paradas: [PARADA, { ...PARADA, id: 12, orden: 2 }],
        }),
      ),
    );
    expect(texto(r.el)).toContain('Te faltan 2 paradas por marcar como hecha.');
    r.fixture.destroy();
  });

  it('un servicio cancelado no tiene siguiente paso', async () => {
    const r = await montarServicio(armar(base({ estado: 'Cancelado' })));
    expect(r.el.querySelector('[aria-label="Siguiente paso"]')).toBeNull();
    r.fixture.destroy();
  });

  it('textos de la ubicación compartida según el estado', async () => {
    const a = armar(base({ estado: 'En Ruta' }));
    const r = await montarServicio(a);
    const estado = () => texto(r.el);
    a.ubicacion.estado.set('denegado');
    r.fixture.detectChanges();
    expect(estado()).toContain('La ubicación está bloqueada');
    a.ubicacion.motivo.set('Activa el GPS');
    r.fixture.detectChanges();
    expect(estado()).toContain('Activa el GPS');
    a.ubicacion.estado.set('no-disponible');
    r.fixture.detectChanges();
    expect(estado()).toContain('Tu dispositivo no puede obtener la ubicación ahora.');
    a.ubicacion.estado.set('activo');
    r.fixture.detectChanges();
    q<HTMLButtonElement>(r.el, '[role="switch"]').click();
    expect(a.ubicacion.detener).toHaveBeenCalled();
    a.ubicacion.estado.set('apagado');
    r.fixture.detectChanges();
    q<HTMLButtonElement>(r.el, '[role="switch"]').click();
    expect(a.ubicacion.iniciar).toHaveBeenCalledWith(5);
    r.fixture.destroy();
    TestBed.resetTestingModule();
    const r2 = await montarServicio(armar(base({ estado: 'Cancelado' })));
    expect(texto(r2.el)).toContain('Disponible cuando el servicio esté en ruta.');
    r2.fixture.destroy();
  });

  it('acciones simultáneas no se repiten y los errores se informan', async () => {
    const a = armar(base({ estado: 'En Ruta', paradas: [PARADA] }));
    const r = await montarServicio(a);
    const c = r.c as unknown as {
      llegadaRecogida(e: Envio): Promise<void>;
      completarParada(e: Envio, id: number): Promise<void>;
      llegadaDestino(e: Envio): Promise<void>;
    };
    const e = base({ estado: 'En Ruta', paradas: [PARADA] });
    await Promise.all([c.completarParada(e, 11), c.completarParada(e, 11)]);
    expect(a.servicio.completarParada).toHaveBeenCalledTimes(1);
    await Promise.all([c.llegadaRecogida(e), c.llegadaRecogida(e)]);
    expect(a.servicio.llegadaRecogida).toHaveBeenCalledTimes(1);
    await Promise.all([c.llegadaDestino(e), c.llegadaDestino(e)]);
    expect(a.servicio.llegadaDestino).toHaveBeenCalledTimes(1);
    a.servicio.completarParada.mockImplementation(
      rechaza(new ApiError(400, 'La parada ya estaba hecha')),
    );
    a.servicio.llegadaRecogida.mockImplementation(rechaza(new ApiError(400, 'Aún no')));
    await c.llegadaRecogida(e);
    a.servicio.llegadaDestino.mockImplementation(rechaza(new ApiError(400, 'Aún no llegas')));
    await c.completarParada(e, 11);
    await c.llegadaDestino(e);
    r.fixture.destroy();
  });

  it('las respuestas sin paradas ni pago conservan las que ya tenía', async () => {
    const a = armar(
      base({
        paradas: [PARADA],
        pago: {
          metodo: 'efectivo',
          estado: 'por_cobrar',
          monto: 1,
          telefono: null,
          mensaje: null,
          actualizado: new Date(),
        },
      }),
    );
    a.servicio.llegadaRecogida.mockImplementation(async () =>
      base({ etapa: 'en_recogida', paradas: undefined, pago: undefined }),
    );
    a.servicio.llegadaDestino.mockImplementation(async () =>
      base({ estado: 'En Ruta', paradas: undefined, pago: undefined }),
    );
    const r = await montarServicio(a);
    const c = r.c as unknown as {
      llegadaRecogida(e: Envio): Promise<void>;
      llegadaDestino(e: Envio): Promise<void>;
    };
    await c.llegadaRecogida(base({ paradas: [PARADA] }));
    await c.llegadaDestino(base({ estado: 'En Ruta', paradas: [PARADA] }));
    r.fixture.detectChanges();
    expect(texto(r.el)).toContain('Chinauta');
    r.fixture.destroy();
  });

  it('los avisos del servicio lo recargan; los de otro servicio o de chat no', async () => {
    const a = armar(base());
    const r = await montarServicio(a);
    const antes = a.servicio.obtener.mock.calls.length;
    a.notificaciones.next(notificacion(5));
    a.notificaciones.next(notificacion(5, 'mensaje_chat'));
    a.notificaciones.next(notificacion(9));
    await r.estable();
    expect(a.servicio.obtener).toHaveBeenCalledTimes(antes + 1);
    r.fixture.destroy();
  });

  it('?chat=1 lleva al chat y el mapa se actualiza cada 15 s', async () => {
    const intervalos = vi.spyOn(globalThis, 'setInterval');
    const a = armar(base());
    const r = await montar(ServicioPage, {
      usuario: CONDUCTOR,
      inputs: { id: '5', chat: '1' },
      providers: a.providers,
    });
    await TestBed.inject(DriverProfileStore).cargar(true);
    await r.c.cargar();
    await r.estable();
    const desplazar = vi.fn();
    q(r.el, '#chat').scrollIntoView = desplazar;
    await new Promise((ok) => setTimeout(ok, 350));
    expect(desplazar).toHaveBeenCalledTimes(1);
    const mapa = intervalos.mock.calls.find((c) => c[1] === 15_000)?.[0] as () => void;
    const llamadas = a.seguimiento.mock.calls.length;
    mapa();
    await r.estable();
    expect(a.seguimiento.mock.calls.length).toBeGreaterThan(llamadas);
    // Recargar no vuelve a desplazar
    await r.c.cargar();
    await new Promise((ok) => setTimeout(ok, 350));
    expect(desplazar).toHaveBeenCalledTimes(1);
    r.fixture.destroy();
  });

  it('al recoger con la ubicación ya compartida no la reinicia', async () => {
    const a = armar(base({ paradas: [PARADA] }));
    a.ubicacion.compartiendo.mockReturnValue(true);
    const r = await montarServicio(a);
    (r.c as unknown as { alRecoger(e: Envio): void }).alRecoger(
      base({ estado: 'En Ruta', paradas: undefined }),
    );
    expect(a.ubicacion.iniciar).not.toHaveBeenCalled();
    r.fixture.destroy();
  });

  it('el modal de entrega y el de recogida se cierran', async () => {
    const a = armar(base({ etapa: 'en_recogida' }));
    const r = await montarServicio(a);
    const c = r.c as unknown as { ejecutar(t: string, e: Envio): Promise<void> };
    await c.ejecutar('recoger', base());
    r.fixture.detectChanges();
    expect(r.el.querySelector('ti-recogida-modal [role="dialog"]')).toBeTruthy();
    q<HTMLButtonElement>(r.el, '[role="dialog"] button[aria-label="Cerrar"]').click();
    r.fixture.detectChanges();
    expect(r.el.querySelector('[role="dialog"]')).toBeNull();
    await c.ejecutar('finalizar', base());
    r.fixture.detectChanges();
    const modal = () =>
      r.fixture.debugElement.query(By.directive(EntregaModalComponent))?.componentInstance as
        EntregaModalComponent | undefined;
    modal()?.cerrar.emit();
    r.fixture.detectChanges();
    expect(modal()).toBeUndefined();
    await c.ejecutar('finalizar', base());
    r.fixture.detectChanges();
    expect(modal()).toBeDefined();
    modal()?.entregado.emit();
    await r.estable();
    expect(modal()).toBeUndefined();
    expect(a.ubicacion.detener).toHaveBeenCalled();
    await c.ejecutar('finalizar', base());
    r.fixture.detectChanges();
    modal()?.yaEntregado.emit();
    await r.estable();
    expect(modal()).toBeUndefined();
    r.fixture.destroy();
  });

  it('Reintentar vuelve a cargar tras un error', async () => {
    const a = armar(base());
    a.servicio.obtener.mockImplementation(rechaza(new ApiError(500, 'x')));
    const r = await montarServicio(a);
    a.servicio.obtener.mockImplementation(async () => base());
    botonPorTexto(r.el, 'Reintentar').click();
    await r.estable();
    expect(texto(r.el)).toContain('#5');
    r.fixture.destroy();
  });

  it('mientras espera la respuesta el botón principal muestra que trabaja', async () => {
    const a = armar(base());
    let terminar!: (e: Envio) => void;
    a.servicio.llegadaRecogida.mockImplementation(
      () => new Promise<Envio>((ok) => (terminar = ok)),
    );
    const r = await montarServicio(a);
    botonPorTexto(r.el, /Llegué/).click();
    r.fixture.detectChanges();
    expect(r.el.querySelector('ti-icono.animate-spin')).toBeTruthy();
    terminar(base({ etapa: 'en_recogida' }));
    await r.estable();
    r.fixture.destroy();
  });
});
