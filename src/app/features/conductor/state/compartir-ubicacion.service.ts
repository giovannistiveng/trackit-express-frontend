import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { LocationQueue } from '../../../core/adapters/local/location-queue';
import { LoggerPort } from '../../../core/ports';
import { GEOLOCALIZACION } from './geolocalizacion';

export type EstadoUbicacion = 'apagado' | 'activo' | 'denegado' | 'no-disponible';

/** CU-008 lado conductor: observa la posición y la envía (o la encola sin conexión). */
@Injectable({ providedIn: 'root' })
export class CompartirUbicacionService implements OnDestroy {
  private readonly geo = inject(GEOLOCALIZACION);
  private readonly cola = inject(LocationQueue);
  private readonly log = inject(LoggerPort);

  readonly estado = signal<EstadoUbicacion>('apagado');
  readonly ultimaEnvio = signal<Date | null>(null);
  private watchId: number | null = null;
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
    this.idEnvio = idEnvio;
    this.estado.set('activo');
    this.watchId = this.geo.watchPosition(
      (pos) => void this.alPosicion(pos),
      (err) => {
        this.estado.set(err.code === err.PERMISSION_DENIED ? 'denegado' : 'no-disponible');
        this.log.warn('Ubicacion', `Error de geolocalización (código ${err.code})`);
        this.detener(false);
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    this.log.info('Ubicacion', `Ubicación compartida para el envío #${idEnvio}`);
  }

  detener(reiniciarEstado = true): void {
    if (this.watchId !== null) this.geo?.clearWatch(this.watchId);
    this.watchId = null;
    this.idEnvio = null;
    if (reiniciarEstado) this.estado.set('apagado');
  }

  private async alPosicion(pos: GeolocationPosition): Promise<void> {
    if (this.idEnvio === null) return;
    const ok = await this.cola.registrar(this.idEnvio, {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      capturadoEn: new Date(pos.timestamp).toISOString(),
    });
    if (ok) this.ultimaEnvio.set(new Date());
    else this.log.warn('Ubicacion', 'Coordenadas fuera de rango descartadas');
  }
}
