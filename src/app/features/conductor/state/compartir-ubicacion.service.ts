import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { LocationQueue } from '../../../core/adapters/local/location-queue';
import { LoggerPort } from '../../../core/ports';
import { GEOLOCALIZACION } from './geolocalizacion';

export type EstadoUbicacion = 'apagado' | 'activo' | 'denegado' | 'no-disponible';

/**
 * Si el conductor está quieto, el navegador no vuelve a llamar a watchPosition: cada tanto
 * se reenvía la última posición con la hora actual para que el cliente vea la señal "en vivo".
 */
export const LATIDO_UBICACION_MS = 20_000;

/** CU-008 lado conductor: observa la posición y la envía (o la encola sin conexión). */
@Injectable({ providedIn: 'root' })
export class CompartirUbicacionService implements OnDestroy {
  private readonly geo = inject(GEOLOCALIZACION);
  private readonly cola = inject(LocationQueue);
  private readonly log = inject(LoggerPort);

  readonly estado = signal<EstadoUbicacion>('apagado');
  readonly ultimaEnvio = signal<Date | null>(null);
  readonly ultimaPosicion = signal<{ lat: number; lon: number } | null>(null);
  private watchId: number | null = null;
  private latido: ReturnType<typeof setInterval> | null = null;
  private idEnvio: number | null = null;
  private readonly alConectar = () => void this.cola.sincronizar();

  constructor() {
    window.addEventListener('online', this.alConectar);
  }

  ngOnDestroy(): void {
    this.detener();
    window.removeEventListener('online', this.alConectar);
  }

  iniciar(idEnvio: number): void {
    if (!this.geo) {
      this.estado.set('no-disponible');
      return;
    }
    this.detener();
    this.ultimaPosicion.set(null);
    this.idEnvio = idEnvio;
    this.estado.set('activo');
    this.watchId = this.geo.watchPosition(
      (pos) => void this.alPosicion(pos),
      (err) => {
        this.log.warn('Ubicacion', `Error de geolocalización (código ${err.code})`);
        if (err.code === err.PERMISSION_DENIED) {
          this.estado.set('denegado');
          this.detener(false);
          return;
        }
        // Tiempo agotado o señal perdida: son pasajeros. Se sigue observando y el latido
        // reenvía la última posición conocida; solo se avisa si aún no hay ninguna.
        if (!this.ultimaPosicion()) this.estado.set('no-disponible');
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    this.latido = setInterval(() => void this.reenviar(), LATIDO_UBICACION_MS);
    this.log.info('Ubicacion', `Ubicación compartida para el envío #${idEnvio}`);
  }

  detener(reiniciarEstado = true): void {
    if (this.watchId !== null) this.geo?.clearWatch(this.watchId);
    if (this.latido !== null) clearInterval(this.latido);
    this.latido = null;
    this.watchId = null;
    this.idEnvio = null;
    if (reiniciarEstado) this.estado.set('apagado');
  }

  /** true si está compartiendo para ese envío. */
  compartiendo(idEnvio: number): boolean {
    return this.estado() === 'activo' && this.idEnvio === idEnvio;
  }

  private async alPosicion(pos: GeolocationPosition): Promise<void> {
    if (this.idEnvio === null) return;
    this.estado.set('activo');
    const punto = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    await this.enviar(punto, new Date(pos.timestamp));
  }

  private async reenviar(): Promise<void> {
    const p = this.ultimaPosicion();
    if (p && this.idEnvio !== null) await this.enviar(p, new Date());
  }

  private async enviar(punto: { lat: number; lon: number }, cuando: Date): Promise<void> {
    if (this.idEnvio === null) return;
    const ok = await this.cola.registrar(this.idEnvio, {
      ...punto,
      capturadoEn: cuando.toISOString(),
    });
    if (ok) {
      this.ultimaPosicion.set(punto);
      this.ultimaEnvio.set(new Date());
    } else this.log.warn('Ubicacion', 'Coordenadas fuera de rango descartadas');
  }
}
