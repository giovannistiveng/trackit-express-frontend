import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { ApiNotificacion } from '../core/adapters/http/backend.types';
import { aNotificacion } from '../core/adapters/http/mappers';
import { EventosService } from '../core/realtime/eventos.service';
import { Notificacion, Rol } from '../core/domain';
import { LoggerPort, NotificationsPort } from '../core/ports';
import { ToastService } from '../shared/ui/toast.service';

/**
 * Respaldo por si se cae el canal en tiempo real: cada cuánto se pregunta si hay avisos nuevos
 * (solo con la pestaña visible y sin conexión de eventos).
 */
export const INTERVALO_NOTIFICACIONES_MS = 30_000;

/** Ruta a la que lleva cada aviso según el rol. */
export function rutaDeNotificacion(
  n: Pick<Notificacion, 'tipo' | 'idEnvio'>,
  rol: Rol | null,
): string | null {
  if (rol === '2') return n.idEnvio ? `/cliente/envios/${n.idEnvio}` : '/cliente/envios';
  if (rol === '3') {
    if (n.tipo === 'conductor_aprobado' || n.tipo === 'conductor_rechazado')
      return '/conductor/perfil';
    if (n.tipo === 'calificacion_recibida' || n.tipo === 'liquidacion')
      return '/conductor/ganancias';
    if (n.tipo === 'nuevo_servicio' || !n.idEnvio) return '/conductor/tablero';
    return `/conductor/servicio/${n.idEnvio}`;
  }
  return null;
}

/** Campana de notificaciones: contador sin leer, lista y aviso emergente cuando llega algo nuevo. */
@Injectable({ providedIn: 'root' })
export class NotificacionesStore implements OnDestroy {
  private readonly puerto = inject(NotificationsPort);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerPort);
  private readonly eventos = inject(EventosService);

  readonly noLeidas = signal(0);
  readonly items = signal<Notificacion[]>([]);
  readonly cargando = signal(false);
  /** Se pone en true un instante para animar la campana. */
  readonly sonando = signal(false);
  private temporizador: ReturnType<typeof setInterval> | null = null;
  private suscripcion: Subscription | null = null;
  private iniciado = false;
  private readonly alVolver = () => {
    if (document.visibilityState === 'visible') void this.revisar();
  };

  iniciar(): void {
    if (this.iniciado) return;
    this.iniciado = true;
    void this.revisar(false);
    this.eventos.iniciar();
    this.suscripcion = this.eventos
      .de<ApiNotificacion>('notificacion')
      .subscribe((n) => this.recibir(n));
    this.temporizador = setInterval(() => {
      const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
      if (visible && !this.eventos.conectado()) void this.revisar();
    }, INTERVALO_NOTIFICACIONES_MS);
    document.addEventListener('visibilitychange', this.alVolver);
  }

  /** Aviso que llega al instante por el canal de eventos. */
  private recibir(api: ApiNotificacion): void {
    // Sin id (no se pudo guardar) se usa uno negativo: no existe en el servidor
    const n = aNotificacion({
      ...api,
      id: api.id ?? -Date.now(),
      leida: false,
      fecha: api.fecha ?? new Date().toISOString(),
    });
    this.items.update((l) => [n, ...l.filter((x) => x.id !== n.id)].slice(0, 30));
    this.noLeidas.update((c) => c + 1);
    this.toast.mostrar(n.titulo);
    this.sonando.set(true);
    setTimeout(() => this.sonando.set(false), 1000);
  }

  detener(): void {
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = null;
    this.iniciado = false;
    this.suscripcion?.unsubscribe();
    this.suscripcion = null;
    this.eventos.detener();
    document.removeEventListener('visibilitychange', this.alVolver);
    this.noLeidas.set(0);
    this.items.set([]);
  }

  ngOnDestroy(): void {
    this.detener();
  }

  /** Consulta el contador; si subió, trae la lista y avisa con el más reciente. */
  async revisar(avisar = true): Promise<void> {
    try {
      const antes = this.noLeidas();
      const ahora = await this.puerto.noLeidas();
      this.noLeidas.set(ahora);
      if (ahora > antes) {
        await this.cargar();
        const nuevo = this.items().find((n) => !n.leida);
        if (avisar && nuevo) {
          this.toast.mostrar(nuevo.titulo);
          this.sonando.set(true);
          setTimeout(() => this.sonando.set(false), 1000);
        }
      }
    } catch (e) {
      this.log.debug('Notificaciones', 'No se pudo consultar el contador', e);
    }
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const r = await this.puerto.listar();
      this.items.set(r.items);
      this.noLeidas.set(r.noLeidas);
    } catch (e) {
      this.log.warn('Notificaciones', 'No se pudo cargar la lista', e);
    } finally {
      this.cargando.set(false);
    }
  }

  async marcarLeida(n: Notificacion): Promise<void> {
    if (n.leida) return;
    if (n.id < 0) {
      this.items.update((l) => l.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
      this.noLeidas.update((c) => Math.max(0, c - 1));
      return;
    }
    this.items.update((l) => l.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
    this.noLeidas.update((c) => Math.max(0, c - 1));
    try {
      await this.puerto.leer(n.id);
    } catch (e) {
      this.log.warn('Notificaciones', 'No se pudo marcar como leída', e);
    }
  }

  async borrar(n: Notificacion): Promise<void> {
    this.items.update((l) => l.filter((x) => x.id !== n.id));
    if (!n.leida) this.noLeidas.update((c) => Math.max(0, c - 1));
    try {
      await this.puerto.borrar(n.id);
    } catch (e) {
      this.log.warn('Notificaciones', 'No se pudo borrar la notificación', e);
    }
  }

  async borrarLeidas(): Promise<void> {
    this.items.update((l) => l.filter((x) => !x.leida));
    try {
      await this.puerto.borrarLeidas();
    } catch (e) {
      this.log.warn('Notificaciones', 'No se pudieron borrar las leídas', e);
    }
  }

  async marcarTodas(): Promise<void> {
    this.items.update((l) => l.map((x) => ({ ...x, leida: true })));
    this.noLeidas.set(0);
    try {
      await this.puerto.leerTodas();
    } catch (e) {
      this.log.warn('Notificaciones', 'No se pudieron marcar todas', e);
    }
  }
}
