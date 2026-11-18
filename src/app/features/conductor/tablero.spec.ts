import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { EMPTY, Subject } from 'rxjs';
import { CONDUCTOR, buildEnvio } from '../../../testing/fixtures';
import { botonPorTexto, q, rechaza } from '../../../testing/fakes';
import { montar } from '../../../testing/pantallas';
import { Envio, Notificacion, PerfilConductor } from '../../core/domain';
import {
  DriverBoardPort,
  DriverProfilePort,
  DriverServicePort,
  EventosPort,
} from '../../core/ports';
import { DriverProfileStore } from './state/driver-profile.store';
import { TableroPage } from './tablero.page';

const APROBADO: PerfilConductor = {
  idConductor: 1,
  estadoAprobacion: 'Aprobado',
  motivoRechazo: null,
};

function armar(lista: Envio[], perfil: PerfilConductor = APROBADO) {
  const notificaciones = new Subject<Notificacion>();
  const tablero = { disponibles: vi.fn(async () => lista) };
  const servicio = {
    aceptar: vi.fn(async (id: number) => buildEnvio({ id, estado: 'Asignado', pin: undefined })),
    obtener: vi.fn(),
    activo: vi.fn<() => Promise<Envio | null>>(async () => null),
  };
  return {
    tablero,
    servicio,
    notificaciones,
    providers: [
      { provide: DriverProfilePort, useValue: { obtener: vi.fn(async () => perfil) } },
      { provide: DriverBoardPort, useValue: tablero },
      { provide: DriverServicePort, useValue: servicio },
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

async function montarTablero(a: ReturnType<typeof armar>) {
  const r = await montar(TableroPage, { usuario: CONDUCTOR, providers: a.providers });
  await TestBed.inject(DriverProfileStore).cargar(true);
  await r.c.inicializar();
  await r.estable();
  return r;
}

const texto = (el: HTMLElement) => el.textContent?.replaceAll(/\s+/g, ' ') ?? '';

function notificacion(tipo: Notificacion['tipo']): Notificacion {
  return { id: 1, tipo, titulo: 't', mensaje: 'm', idEnvio: 3, leida: false, fecha: new Date() };
}

describe('TableroPage: casos de borde', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('con moto ve solo pedidos de moto; con furgoneta, ambos', async () => {
    const r = await montarTablero(
      armar([], { ...APROBADO, vehiculo: { id: 1, placa: 'ABC12D', categoria: 'Moto Express' } }),
    );
    expect(texto(r.el)).toContain('Con tu Moto Express ves pedidos de Moto Express y');
    r.fixture.destroy();
    TestBed.resetTestingModule();
    const r2 = await montarTablero(
      armar([], { ...APROBADO, vehiculo: { id: 1, placa: 'ABC12D', categoria: 'Furgoneta' } }),
    );
    expect(texto(r2.el)).toContain('ves pedidos de Moto Express y Furgoneta');
    r2.fixture.destroy();
  });

  it('cada tarjeta muestra vehículo, pago, hora, paradas, ida y vuelta, detalle, notas, ganancia y distancia', async () => {
    const manana = new Date(Date.now() + 86_400_000);
    const hoy = new Date(Date.now() + 3_600_000);
    const parada = {
      id: 1,
      orden: 1,
      direccion: 'x',
      coords: { lat: 4.3, lon: -74.3 },
      notas: null,
      completadaEn: null,
    };
    const lista = [
      buildEnvio({
        id: 3,
        pin: undefined,
        categoria: 'Furgoneta',
        metodoPago: 'nequi',
        fechaProgramada: manana,
        paradas: [parada],
        idaYVuelta: true,
        tipoServicio: 'mercado',
        detalle: { lista: 'Arroz y panela', bultos: 2 },
        notas: 'Llamar al llegar',
        gananciaConductor: 16000,
        distanciaKm: 5.4,
        pideCodigoRecogida: true,
      }),
      buildEnvio({
        id: 4,
        pin: undefined,
        fechaProgramada: hoy,
        paradas: [parada, { ...parada, id: 2, orden: 2 }],
      }),
    ];
    const r = await montarTablero(armar(lista));
    const t = texto(r.el);
    expect(t).toContain('Furgoneta');
    expect(t).toContain('Pagado');
    expect(t).toContain('1 parada');
    expect(t).toContain('2 paradas');
    expect(t).toContain('Ida y vuelta');
    expect(t).toContain('Arroz y panela');
    expect(t).toContain('2 bultos');
    expect(t).toContain('Llamar al llegar');
    expect(t).toContain('Ganas');
    expect(t).toContain('5.4 km');
    botonPorTexto(r.el, 'Aceptar servicio').click();
    r.fixture.detectChanges();
    const dialogo = texto(q(r.el, '[role="dialog"]'));
    expect(dialogo).toContain('Mercado: Arroz y panela');
    expect(dialogo).toContain('Pagas la compra');
    expect(dialogo).toContain('te pedirán un código');
    expect(dialogo).toContain('Indicaciones: Llamar al llegar');
    botonPorTexto(q(r.el, '[role="dialog"]'), 'Cancelar').click();
    r.fixture.detectChanges();
    expect(r.el.querySelector('[role="dialog"]')).toBeNull();
    botonPorTexto(r.el, 'Aceptar servicio').click();
    r.fixture.detectChanges();
    q<HTMLButtonElement>(r.el, '[role="dialog"] button[aria-label="Cerrar"]').click();
    r.fixture.detectChanges();
    expect(r.el.querySelector('[role="dialog"]')).toBeNull();
    r.fixture.destroy();
  });

  it('mientras actualiza y mientras acepta lo indica; no acepta dos a la vez', async () => {
    const a = armar([buildEnvio({ id: 3, pin: undefined })]);
    const r = await montarTablero(a);
    let responder!: (l: Envio[]) => void;
    a.tablero.disponibles.mockImplementation(() => new Promise<Envio[]>((ok) => (responder = ok)));
    botonPorTexto(r.el, 'Refrescar').click();
    r.fixture.detectChanges();
    expect(texto(r.el)).toContain('Actualizando…');
    responder([buildEnvio({ id: 3, pin: undefined })]);
    await r.estable();
    let aceptar!: (e: Envio) => void;
    a.servicio.aceptar.mockImplementation(() => new Promise<Envio>((ok) => (aceptar = ok)));
    botonPorTexto(r.el, 'Aceptar servicio').click();
    r.fixture.detectChanges();
    botonPorTexto(q(r.el, '[role="dialog"]'), 'Aceptar servicio').click();
    r.fixture.detectChanges();
    expect(texto(q(r.el, '[role="dialog"]'))).toContain('Aceptando…');
    await (r.c as unknown as { aceptar(e: Envio): Promise<void> }).aceptar(buildEnvio({ id: 9 }));
    expect(a.servicio.aceptar).toHaveBeenCalledTimes(1);
    aceptar(buildEnvio({ id: 3, estado: 'Asignado' }));
    await r.estable();
    r.fixture.destroy();
  });

  it('con un servicio activo no acepta otro; si no responde cuál, sigue sin activo', async () => {
    const a = armar([buildEnvio({ id: 3, pin: undefined })]);
    a.servicio.activo.mockImplementation(async () => buildEnvio({ id: 5, estado: 'En Ruta' }));
    const r = await montarTablero(a);
    await (r.c as unknown as { aceptar(e: Envio): Promise<void> }).aceptar(buildEnvio({ id: 3 }));
    expect(a.servicio.aceptar).not.toHaveBeenCalled();
    r.fixture.destroy();
    TestBed.resetTestingModule();
    const b = armar([]);
    b.servicio.activo.mockImplementation(rechaza(new Error('sin red')));
    const r2 = await montarTablero(b);
    expect(texto(r2.el)).not.toContain('en curso');
    r2.fixture.destroy();
  });

  it('los avisos de servicios nuevos o cancelados refrescan; los demás no; sin aprobación no hay tablero', async () => {
    const a = armar([]);
    const r = await montarTablero(a);
    const antes = a.tablero.disponibles.mock.calls.length;
    a.notificaciones.next(notificacion('nuevo_servicio'));
    await r.estable();
    a.notificaciones.next(notificacion('envio_cancelado'));
    await r.estable();
    a.notificaciones.next(notificacion('mensaje_chat'));
    await r.estable();
    expect(a.tablero.disponibles.mock.calls.length).toBe(antes + 2);
    r.fixture.destroy();
    TestBed.resetTestingModule();
    const b = armar([], { ...APROBADO, estadoAprobacion: 'Pendiente' });
    const r2 = await montarTablero(b);
    b.notificaciones.next(notificacion('nuevo_servicio'));
    await r2.estable();
    expect(b.tablero.disponibles).not.toHaveBeenCalled();
    r2.fixture.destroy();
  });

  it('Reintentar tras un error vuelve a consultar', async () => {
    const a = armar([]);
    a.tablero.disponibles.mockImplementation(rechaza(new Error('caído')));
    const r = await montarTablero(a);
    a.tablero.disponibles.mockImplementation(async () => [buildEnvio({ id: 3, pin: undefined })]);
    botonPorTexto(r.el, 'Reintentar').click();
    await r.estable();
    expect(texto(r.el)).toContain('Aceptar servicio');
    r.fixture.destroy();
  });
});
