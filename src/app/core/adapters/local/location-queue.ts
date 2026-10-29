import { Injectable, inject } from '@angular/core';
import { Ubicacion, esCoordenadaValida } from '../../domain';
import { KeyValueStorePort, LocationTransportPort } from '../../ports';

export const CLAVE_COLA_UBICACION = 'trackit.locationQueue';
export const MAX_COLA_UBICACION = 500;

export interface UbicacionEnCola extends Ubicacion {
  idEnvio: number;
}

/**
 * CU-008: cola de coordenadas sin conexión. Envía en orden, sin duplicar, conserva lo que falte
 * si la sincronización falla a mitad, respeta el tope de 500 descartando las más antiguas.
 */
@Injectable({ providedIn: 'root' })
export class LocationQueue {
  private readonly store = inject(KeyValueStorePort);
  private readonly transporte = inject(LocationTransportPort);
  private sincronizando: Promise<number> | null = null;

  async pendientes(): Promise<UbicacionEnCola[]> {
    return (await this.store.get<UbicacionEnCola[]>(CLAVE_COLA_UBICACION)) ?? [];
  }

  /** Intenta enviar; si falla o no hay red, encola. Devuelve false si la coordenada es inválida. */
  async registrar(idEnvio: number, u: Ubicacion, enLinea = navigator.onLine): Promise<boolean> {
    if (!esCoordenadaValida(u.lat, u.lon)) return false;
    const cola = await this.pendientes();
    if (enLinea && cola.length === 0) {
      try {
        await this.transporte.enviar(idEnvio, u);
        return true;
      } catch {
        /* se encola abajo */
      }
    }
    await this.encolar({ ...u, idEnvio });
    if (enLinea) void this.sincronizar();
    return true;
  }

  /** Envía la cola en orden. Devuelve cuántas se enviaron. */
  sincronizar(): Promise<number> {
    this.sincronizando ??= this.ejecutarSincronizacion().finally(() => (this.sincronizando = null));
    return this.sincronizando;
  }

  private async ejecutarSincronizacion(): Promise<number> {
    const cola = await this.pendientes();
    let enviadas = 0;
    for (const item of cola) {
      try {
        const { idEnvio, ...u } = item;
        await this.transporte.enviar(idEnvio, u);
        enviadas++;
      } catch {
        break;
      }
    }
    if (enviadas > 0) {
      // Relee por si llegaron coordenadas nuevas mientras se enviaba
      const actual = await this.pendientes();
      await this.store.set(CLAVE_COLA_UBICACION, actual.slice(enviadas));
    }
    return enviadas;
  }

  private async encolar(item: UbicacionEnCola): Promise<void> {
    const cola = await this.pendientes();
    const duplicada = cola.some(
      (c) => c.idEnvio === item.idEnvio && c.capturadoEn === item.capturadoEn,
    );
    if (duplicada) return;
    cola.push(item);
    await this.store.set(CLAVE_COLA_UBICACION, cola.slice(-MAX_COLA_UBICACION));
  }
}
