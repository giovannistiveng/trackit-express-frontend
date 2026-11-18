import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ADMIN, CLIENTE, CONDUCTOR } from '../../testing/fixtures';
import {
  FakeNotifications,
  FakeSessionStorage,
  q,
  rechaza,
  vaciarPromesas,
} from '../../testing/fakes';
import { WritableSignal, signal } from '@angular/core';
import { EMPTY, Subject } from 'rxjs';
import { configurar, montar } from '../../testing/pantallas';
import { CLAVE_SESION, SessionService } from '../core/auth/session.service';
import { SincronizacionSesion } from './sincronizacion-sesion';
import { Notificacion } from '../core/domain';
import { EventosPort, NotificationsPort, PushPort, SessionStoragePort } from '../core/ports';
import { ToastService } from '../shared/ui/toast.service';
import { CampanaComponent } from './campana.component';
import {
  INTERVALO_NOTIFICACIONES_MS,
  NotificacionesStore,
  rutaDeNotificacion,
} from './notificaciones.store';
import { iniciales } from '../core/domain';

const aviso = (id: number, p: Partial<Notificacion> = {}): Notificacion => ({
  id,
  tipo: 'envio_aceptado',
  titulo: `Aviso ${id}`,
  mensaje: 'm',
  idEnvio: 9,
  leida: false,
  fecha: new Date(),
  ...p,
});

describe('rutaDeNotificacion e iniciales', () => {
  it('lleva a cada rol a la pantalla correcta', () => {
    expect(rutaDeNotificacion({ tipo: 'ruta_iniciada', idEnvio: 9 }, '2')).toBe(
      '/cliente/envios/9',
    );
    expect(rutaDeNotificacion({ tipo: 'envio_cancelado', idEnvio: null }, '2')).toBe(
      '/cliente/envios',
    );
    expect(rutaDeNotificacion({ tipo: 'conductor_aprobado', idEnvio: null }, '3')).toBe(
      '/conductor/perfil',
    );
    expect(rutaDeNotificacion({ tipo: 'calificacion_recibida', idEnvio: 9 }, '3')).toBe(
      '/conductor/ganancias',
    );
    expect(rutaDeNotificacion({ tipo: 'envio_cancelado', idEnvio: 9 }, '3')).toBe(
      '/conductor/servicio/9',
    );
    expect(rutaDeNotificacion({ tipo: 'envio_cancelado', idEnvio: 9 }, '1')).toBeNull();
    expect(iniciales('Laura Méndez Ríos')).toBe('LM');
    expect(iniciales('')).toBe('?');
  });
});

describe('NotificacionesStore', () => {
  afterEach(() => vi.useRealTimers());

  it('consulta cada 30 s y avisa con un toast cuando llega algo nuevo', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout'] });
    configurar({ usuario: CLIENTE });
    const fake = TestBed.inject(NotificationsPort) as FakeNotifications;
    const store = TestBed.inject(NotificacionesStore);
    const toast = vi.spyOn(TestBed.inject(ToastService), 'mostrar');
    store.iniciar();
    await vaciarPromesas(10);
    expect(store.noLeidas()).toBe(0);
    fake.items = [aviso(1, { titulo: 'Tu envío va en camino' })];
    await vi.advanceTimersByTimeAsync(INTERVALO_NOTIFICACIONES_MS);
    expect(store.noLeidas()).toBe(1);
    expect(toast).toHaveBeenCalledWith('Tu envío va en camino');
    expect(store.sonando()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.sonando()).toBe(false);
    await store.marcarLeida(store.items()[0]);
    expect(store.noLeidas()).toBe(0);
    await store.marcarLeida(store.items()[0]);
    store.detener();
    expect(store.items()).toEqual([]);
  });

  it('tolera fallos del backend', async () => {
    configurar({
      usuario: CLIENTE,
      providers: [
        {
          provide: NotificationsPort,
          useValue: {
            noLeidas: vi.fn(async () => {
              throw new Error('x');
            }),
            listar: vi.fn(async () => {
              throw new Error('x');
            }),
            leer: vi.fn(async () => {
              throw new Error('x');
            }),
            leerTodas: vi.fn(async () => {
              throw new Error('x');
            }),
          },
        },
      ],
    });
    const store = TestBed.inject(NotificacionesStore);
    await store.revisar();
    await store.cargar();
    store.items.set([aviso(1)]);
    store.noLeidas.set(1);
    await store.marcarLeida(aviso(1));
    await store.marcarTodas();
    expect(store.noLeidas()).toBe(0);
  });
});

describe('CampanaComponent', () => {
  it('muestra el contador, la lista y navega al abrir un aviso', async () => {
    const fake = new FakeNotifications();
    fake.items = [
      aviso(1, { tipo: 'envio_entregado', titulo: '¡Tu envío fue entregado!' }),
      aviso(2, { leida: true }),
    ];
    const { el, estable, navegarUrl } = await montar(CampanaComponent, {
      usuario: CLIENTE,
      providers: [{ provide: NotificationsPort, useValue: fake }],
    });
    TestBed.inject(NotificacionesStore).noLeidas.set(1);
    await estable();
    const boton = q<HTMLButtonElement>(el, 'button[aria-controls="panel-notificaciones"]');
    expect(boton.textContent).toContain('1 sin leer');
    boton.click();
    await estable();
    expect(el.querySelectorAll('#panel-notificaciones li')).toHaveLength(2);
    expect(el.textContent).toContain('hace un momento');
    (el.querySelector('#panel-notificaciones li button + button') as HTMLButtonElement).click();
    await estable();
    expect(navegarUrl).toHaveBeenCalledWith('/cliente/envios/9');
    expect(el.querySelector('#panel-notificaciones')).toBeNull();
  });

  it('marca todas como leídas, se cierra al hacer clic fuera y muestra vacío', async () => {
    const fake = new FakeNotifications();
    fake.items = [aviso(1)];
    const { el, estable } = await montar(CampanaComponent, {
      usuario: CONDUCTOR,
      providers: [{ provide: NotificationsPort, useValue: fake }],
    });
    q<HTMLButtonElement>(el, 'button[aria-controls="panel-notificaciones"]').click();
    await estable();
    (
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Marcar leídas'),
      ) as HTMLButtonElement
    ).click();
    await estable();
    expect(fake.items.every((n) => n.leida)).toBe(true);
    document.body.click();
    await estable();
    expect(el.querySelector('#panel-notificaciones')).toBeNull();
    fake.items = [];
    q<HTMLButtonElement>(el, 'button[aria-controls="panel-notificaciones"]').click();
    await estable();
    await vaciarPromesas();
    await estable();
    expect(el.textContent).toContain('No tienes notificaciones todavía.');
  });
});

describe('NotificacionesStore y CampanaComponent: casos de borde', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('avisos en vivo, volver a la pestaña, pestaña oculta, sin novedad sin leer e iniciar dos veces', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout'] });
    const eventos = new Subject<Notificacion>();
    configurar({
      usuario: CONDUCTOR,
      providers: [
        {
          provide: EventosPort,
          useValue: {
            conectado: signal(false),
            iniciar: vi.fn(),
            detener: vi.fn(),
            notificaciones: () => eventos,
            mensajes: () => EMPTY,
            cambiosEnvio: () => EMPTY,
          },
        },
      ],
    });
    const fake = TestBed.inject(NotificationsPort) as FakeNotifications;
    const store = TestBed.inject(NotificacionesStore);
    store.iniciar();
    store.iniciar();
    await vaciarPromesas(10);
    eventos.next(aviso(5, { titulo: 'Nuevo servicio' }));
    eventos.next(aviso(5, { titulo: 'Nuevo servicio' }));
    expect(store.items()).toHaveLength(1);
    expect(store.noLeidas()).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.sonando()).toBe(false);
    // Volver a la pestaña revisa; oculta no consulta en el intervalo
    const noLeidas = vi.spyOn(fake, 'noLeidas');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(INTERVALO_NOTIFICACIONES_MS);
    expect(noLeidas).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vaciarPromesas(10);
    expect(noLeidas).toHaveBeenCalled();
    // Subió el contador pero todo lo listado está leído: no avisa
    store.noLeidas.set(0);
    fake.items = [aviso(6, { leida: true })];
    vi.spyOn(fake, 'noLeidas').mockResolvedValueOnce(3);
    const toast = vi.spyOn(TestBed.inject(ToastService), 'mostrar');
    await store.revisar();
    expect(toast).not.toHaveBeenCalled();
    store.detener();
  });

  it('marcar una local, borrar leídas y no leídas, y fallos al borrar', async () => {
    configurar({ usuario: CLIENTE });
    const fake = TestBed.inject(NotificationsPort) as FakeNotifications;
    const store = TestBed.inject(NotificacionesStore);
    store.items.set([aviso(-1), aviso(2), aviso(3, { leida: true })]);
    store.noLeidas.set(2);
    await store.marcarLeida(store.items()[0]);
    expect(store.items()[1].leida).toBe(false);
    expect(store.noLeidas()).toBe(1);
    await store.borrar(store.items()[2]);
    expect(store.noLeidas()).toBe(1);
    await store.borrar(store.items()[1]);
    expect(store.noLeidas()).toBe(0);
    await store.borrarLeidas();
    expect(store.items()).toEqual([]);
    vi.spyOn(fake, 'borrar').mockImplementation(rechaza(new Error('x')));
    vi.spyOn(fake, 'borrarLeidas').mockImplementation(rechaza(new Error('x')));
    await store.borrar(aviso(9));
    await store.borrarLeidas();
    expect(rutaDeNotificacion(aviso(1, { tipo: 'nuevo_servicio' }), '3')).toBe(
      '/conductor/tablero',
    );
  });

  it('la campana: más de 9, cargando, borrar con los botones y estados de los avisos del dispositivo', async () => {
    const fake = new FakeNotifications();
    fake.items = [aviso(1), aviso(2, { leida: true })];
    const { el, estable } = await montar(CampanaComponent, {
      usuario: CLIENTE,
      providers: [{ provide: NotificationsPort, useValue: fake }],
    });
    const store = TestBed.inject(NotificacionesStore);
    store.noLeidas.set(12);
    store.sonando.set(true);
    await estable();
    expect(el.textContent).toContain('9+');
    q<HTMLButtonElement>(el, 'button[aria-controls="panel-notificaciones"]').click();
    await estable();
    q<HTMLButtonElement>(el, '[aria-label="Eliminar notificación: Aviso 1"]').click();
    await estable();
    (
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Borrar leídas'),
      ) as HTMLButtonElement
    ).click();
    await estable();
    expect(fake.items).toEqual([]);
    store.cargando.set(true);
    store.items.set([]);
    await estable();
    expect(el.querySelector('#panel-notificaciones ti-icono.animate-spin')).toBeTruthy();
    const push = TestBed.inject(PushPort) as unknown as {
      estado: WritableSignal<string>;
      activar: () => Promise<void>;
    };
    const activar = vi.spyOn(push, 'activar').mockResolvedValue(undefined);
    push.estado.set('inactivo');
    await estable();
    (
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Recibir avisos'),
      ) as HTMLButtonElement
    ).click();
    expect(activar).toHaveBeenCalled();
    push.estado.set('activando');
    await estable();
    expect(el.textContent).toContain('Activando avisos…');
    push.estado.set('bloqueado');
    await estable();
    expect(el.textContent).toContain('bloqueados');
  });

  it('la campana de administración: abrir un aviso sin pantalla, alternar y Escape', async () => {
    const fake = new FakeNotifications();
    fake.items = [aviso(1)];
    const { el, estable, navegarUrl } = await montar(CampanaComponent, {
      usuario: ADMIN,
      providers: [{ provide: NotificationsPort, useValue: fake }],
    });
    const boton = q<HTMLButtonElement>(el, 'button[aria-controls="panel-notificaciones"]');
    boton.click();
    await estable();
    boton.click();
    await estable();
    expect(el.querySelector('#panel-notificaciones')).toBeNull();
    boton.click();
    await estable();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await estable();
    expect(el.querySelector('#panel-notificaciones')).toBeNull();
    boton.click();
    await estable();
    (el.querySelector('#panel-notificaciones li button + button') as HTMLButtonElement).click();
    await estable();
    expect(navegarUrl).not.toHaveBeenCalled();
  });

  it('la sincronización ignora cambios de otras claves', () => {
    configurar({ usuario: CLIENTE });
    const sync = TestBed.inject(SincronizacionSesion);
    const aplicar = vi.spyOn(sync, 'aplicar');
    sync.iniciar();
    globalThis.dispatchEvent(new StorageEvent('storage', { key: 'otra' }));
    expect(aplicar).not.toHaveBeenCalled();
    globalThis.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(aplicar).toHaveBeenCalledTimes(1);
    sync.ngOnDestroy();
  });
});

describe('SincronizacionSesion', () => {
  it('adopta el cierre o el cambio de cuenta hecho en otra pestaña', () => {
    configurar({ usuario: CLIENTE });
    const sync = TestBed.inject(SincronizacionSesion);
    const session = TestBed.inject(SessionService);
    const storage = TestBed.inject(SessionStoragePort) as FakeSessionStorage;
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const navegarUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const toast = vi.spyOn(TestBed.inject(ToastService), 'mostrar');
    sync.iniciar();
    // Misma cuenta: no pasa nada
    globalThis.dispatchEvent(new StorageEvent('storage', { key: CLAVE_SESION }));
    expect(toast).not.toHaveBeenCalled();
    // Otra cuenta en otra pestaña
    const token = storage.leer(CLAVE_SESION) as string;
    storage.guardar(CLAVE_SESION, JSON.stringify({ ...JSON.parse(token), user: CONDUCTOR }));
    globalThis.dispatchEvent(new StorageEvent('storage', { key: CLAVE_SESION }));
    expect(session.usuario()?.id).toBe(CONDUCTOR.id);
    expect(navegarUrl).toHaveBeenCalledWith('/conductor');
    expect(toast.mock.calls[0][0]).toContain('ventana privada');
    // Cierre en otra pestaña
    storage.borrar(CLAVE_SESION);
    globalThis.dispatchEvent(new StorageEvent('storage', { key: CLAVE_SESION }));
    expect(session.estaAutenticado()).toBe(false);
    expect(navegar).toHaveBeenCalledWith(['/login']);
    sync.ngOnDestroy();
  });
});
