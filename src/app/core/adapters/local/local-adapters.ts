import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Envio,
  PerfilConductor,
  Ubicacion,
  Usuario,
  Zona,
  esCoordenadaValida,
  ordenarRecientes,
} from '../../domain';
import {
  ClientShipmentsPort,
  DriverBoardPort,
  DriverProfilePort,
  KeyValueStorePort,
  LocationTransportPort,
  ShipmentsPort,
  ZonesPort,
} from '../../ports';
import { APP_CONFIG } from '../../config/app-config';
import { ApiError } from '../../http/api-error';
import { SILENCIAR_404 } from '../../http/http-context';
import { apiUrl } from '../http/api-url';
import { ApiEnvio } from '../http/backend.types';
import { aEnvio } from '../http/mappers';
import { ZONAS_SEMBRADAS } from '../mock/seed-data';

/** Brecha 2 (flag zonasEndpoint apagado): zonas sembradas por database/seed.sql. */
@Injectable({ providedIn: 'root' })
export class SeededZonesAdapter implements ZonesPort {
  async listar(): Promise<Zona[]> {
    return ZONAS_SEMBRADAS.map((z) => ({ ...z }));
  }
}

/**
 * Brecha 3 (flag clienteEnviosEndpoint apagado): guarda los id_envio creados por el cliente
 * en LocalForage y los refresca con GET /api/envios/:id.
 */
@Injectable({ providedIn: 'root' })
export class LocalShipmentsCache implements ClientShipmentsPort {
  private readonly store = inject(KeyValueStorePort);
  private readonly shipments = inject(ShipmentsPort);

  static clave(idCliente: number): string {
    return `trackit.envios.${idCliente}`;
  }

  async ids(idCliente: number): Promise<number[]> {
    return (await this.store.get<number[]>(LocalShipmentsCache.clave(idCliente))) ?? [];
  }

  async recordar(idCliente: number, idEnvio: number): Promise<void> {
    const ids = await this.ids(idCliente);
    if (ids.includes(idEnvio)) return;
    await this.store.set(LocalShipmentsCache.clave(idCliente), [...ids, idEnvio]);
  }

  async listar(idCliente: number): Promise<Envio[]> {
    const ids = await this.ids(idCliente);
    const resultados = await Promise.allSettled(ids.map((id) => this.shipments.obtener(id)));
    const envios: Envio[] = [];
    const vigentes: number[] = [];
    resultados.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value.idCliente === idCliente) {
        envios.push(r.value);
        vigentes.push(ids[i]);
      } else if (
        r.status === 'rejected' &&
        !(r.reason instanceof ApiError && r.reason.status === 404)
      ) {
        vigentes.push(ids[i]); // error temporal: se conserva
      }
    });
    if (
      resultados.length > 0 &&
      resultados.every((r) => r.status === 'rejected') &&
      vigentes.length === ids.length
    ) {
      throw (resultados[0] as PromiseRejectedResult).reason;
    }
    if (vigentes.length !== ids.length)
      await this.store.set(LocalShipmentsCache.clave(idCliente), vigentes);
    return ordenarRecientes(envios);
  }
}

/**
 * Brecha 1 (flag conductorMe apagado): relaciona el usuario con su fila de Conductor
 * mediante environment.demo.conductores. Si no está, el perfil queda sin id (bloqueo real).
 */
@Injectable({ providedIn: 'root' })
export class DemoDriverProfileAdapter implements DriverProfilePort {
  private readonly demo = inject(APP_CONFIG).demo;

  async obtener(usuario: Usuario): Promise<PerfilConductor> {
    const c = this.demo.conductores.find((x) => x.idUsuario === usuario.id);
    return c
      ? { idConductor: c.idConductor, estadoAprobacion: c.estadoAprobacion }
      : { idConductor: null, estadoAprobacion: 'Pendiente' };
  }
}

export const MAX_IDS_SONDEO = 60;
export const FALLOS_SEGUIDOS_PARA_PARAR = 5;

/**
 * Brecha 4 (flag disponiblesEndpoint apagado): no hay listado, así que se recorren los ids con
 * GET /api/envios/:id (endpoint existente) y se muestran los Pendiente. El PIN se descarta.
 * Se detiene tras 5 ids seguidos inexistentes o 60 consultas.
 */
@Injectable({ providedIn: 'root' })
export class ProbeDriverBoardAdapter implements DriverBoardPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async disponibles(): Promise<Envio[]> {
    const encontrados: Envio[] = [];
    let fallos = 0;
    const contexto = new HttpContext().set(SILENCIAR_404, true);
    for (let id = 1; id <= MAX_IDS_SONDEO && fallos < FALLOS_SEGUIDOS_PARA_PARAR; id++) {
      try {
        const r = await firstValueFrom(
          this.http.get<{ envio: ApiEnvio }>(this.url(`/envios/${id}`), { context: contexto }),
        );
        fallos = 0;
        const envio = aEnvio(r.envio, false);
        if (envio.estado === 'Pendiente' && envio.idConductor === null) encontrados.push(envio);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) fallos++;
        else throw e;
      }
    }
    return encontrados.sort((a, b) => b.id - a.id);
  }
}

export const CLAVE_CALIFICADOS = 'trackit.calificados';

/** Brecha 9: recuerda localmente qué envíos ya calificó el cliente. */
@Injectable({ providedIn: 'root' })
export class RatedShipments {
  private readonly store = inject(KeyValueStorePort);

  async lista(): Promise<number[]> {
    return (await this.store.get<number[]>(CLAVE_CALIFICADOS)) ?? [];
  }

  async estaCalificado(id: number): Promise<boolean> {
    return (await this.lista()).includes(id);
  }

  async marcar(id: number): Promise<void> {
    const ids = await this.lista();
    if (!ids.includes(id)) await this.store.set(CLAVE_CALIFICADOS, [...ids, id]);
  }
}

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
