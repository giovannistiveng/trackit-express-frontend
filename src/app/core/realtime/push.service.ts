import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { LoggerPort, RealtimePort } from '../ports';

export type EstadoPush = 'no-soportado' | 'bloqueado' | 'inactivo' | 'activo' | 'activando';

/** Plugin PushNotifications de Capacitor (solo existe dentro de la app Android/iOS). */
export interface PluginPushCapacitor {
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  addListener(evento: 'registration', fn: (t: { value: string }) => void): Promise<unknown>;
  addListener(evento: 'registrationError', fn: (e: unknown) => void): Promise<unknown>;
  addListener(
    evento: 'pushNotificationActionPerformed',
    fn: (a: { notification: { data?: { url?: string } } }) => void,
  ): Promise<unknown>;
}

export interface CapacitorGlobal {
  isNativePlatform(): boolean;
  getPlatform(): string;
  Plugins: { PushNotifications?: PluginPushCapacitor };
}

/** window.Capacitor cuando la app corre empaquetada; null en el navegador. */
export const CAPACITOR = new InjectionToken<CapacitorGlobal | null>('CAPACITOR', {
  providedIn: 'root',
  factory: () => {
    const c = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
    return c?.isNativePlatform?.() ? c : null;
  },
});

/**
 * Notificaciones push en el dispositivo, con la misma interfaz en la web y en la app móvil:
 *  - Navegador / PWA instalada: Web Push con el service worker de Angular (solo en producción).
 *  - App Android/iOS empaquetada con Capacitor: Firebase Cloud Messaging con el plugin nativo.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly sw = inject(SwPush);
  private readonly puerto = inject(RealtimePort);
  private readonly router = inject(Router);
  private readonly log = inject(LoggerPort);
  private readonly capacitor = inject(CAPACITOR);

  readonly estado = signal<EstadoPush>('inactivo');
  private escuchando = false;
  private tokenNativo: string | null = null;

  /** Revisa si el dispositivo admite push y si ya está activo. */
  async comprobar(): Promise<EstadoPush> {
    if (this.capacitor) {
      this.estado.set(this.capacitor.Plugins.PushNotifications ? this.estado() : 'no-soportado');
      return this.estado();
    }
    if (!this.sw.isEnabled || typeof Notification === 'undefined') {
      this.estado.set('no-soportado');
      return 'no-soportado';
    }
    this.escucharClics();
    if (Notification.permission === 'denied') this.estado.set('bloqueado');
    else this.estado.set((await this.suscripcionActual()) ? 'activo' : 'inactivo');
    return this.estado();
  }

  async activar(): Promise<EstadoPush> {
    this.estado.set('activando');
    try {
      if (this.capacitor) await this.activarNativo(this.capacitor);
      else await this.activarWeb();
    } catch (e) {
      this.log.warn('Push', 'No se pudieron activar las notificaciones', e);
      const negado = typeof Notification !== 'undefined' && Notification.permission === 'denied';
      this.estado.set(negado ? 'bloqueado' : 'inactivo');
    }
    return this.estado();
  }

  async desactivar(): Promise<void> {
    if (this.tokenNativo) {
      await this.puerto.desuscribirPush(this.tokenNativo).catch(() => undefined);
      this.tokenNativo = null;
    }
    const s = await this.suscripcionActual();
    if (s) {
      await this.puerto.desuscribirPush(s.endpoint).catch(() => undefined);
      await this.sw.unsubscribe().catch(() => undefined);
    }
    this.estado.set('inactivo');
  }

  private async activarWeb(): Promise<void> {
    if (!this.sw.isEnabled) {
      this.estado.set('no-soportado');
      return;
    }
    const clave = await this.puerto.clavePush();
    if (!clave) {
      this.estado.set('no-soportado');
      return;
    }
    const s = await this.sw.requestSubscription({ serverPublicKey: clave });
    const json = s.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    await this.puerto.suscribirPush({
      plataforma: 'web',
      endpoint: json.endpoint,
      keys: json.keys,
    });
    this.escucharClics();
    this.estado.set('activo');
  }

  private async activarNativo(c: CapacitorGlobal): Promise<void> {
    const plugin = c.Plugins.PushNotifications;
    if (!plugin) {
      this.estado.set('no-soportado');
      return;
    }
    const permiso = await plugin.requestPermissions();
    if (permiso.receive !== 'granted') {
      this.estado.set('bloqueado');
      return;
    }
    const plataforma = c.getPlatform() === 'ios' ? 'ios' : 'android';
    await plugin.addListener('registration', (t) => {
      this.tokenNativo = t.value;
      void this.puerto
        .suscribirPush({ plataforma, token: t.value })
        .then(() => this.estado.set('activo'));
    });
    await plugin.addListener('pushNotificationActionPerformed', (a) => {
      const url = a.notification.data?.url;
      if (url) void this.router.navigateByUrl(url);
    });
    await plugin.register();
  }

  private async suscripcionActual(): Promise<PushSubscription | null> {
    if (!this.sw.isEnabled) return null;
    return new Promise((ok) => {
      const s = this.sw.subscription.subscribe((x) => {
        ok(x);
        queueMicrotask(() => s.unsubscribe());
      });
    });
  }

  /** Al tocar una notificación con la app abierta, se navega dentro de la app. */
  private escucharClics(): void {
    if (this.escuchando || !this.sw.isEnabled) return;
    this.escuchando = true;
    this.sw.notificationClicks.subscribe(({ notification }) => {
      const url = (notification.data as { url?: string } | undefined)?.url;
      if (url) void this.router.navigateByUrl(url);
    });
  }
}
