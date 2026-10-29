import { Injectable, OnDestroy, inject } from '@angular/core';
import { NivelLog } from '../../../environments/environment.model';
import { APP_CONFIG } from '../config/app-config';
import { EventoLog, KeyValueStorePort, LogTransportPort, LoggerPort } from '../ports';
import { ApiError } from '../http/api-error';
import { sanitizar } from './sanitize';

const PESO: Record<NivelLog, number> = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };

export const CLAVE_COLA_LOGS = 'trackit.logQueue';
export const INTERVALO_ENVIO_MS = 10_000;
export const UMBRAL_LOTE = 20;
export const MAX_LOTE = 50;
export const MAX_COLA = 300;

/**
 * Logger del frontend. Acumula eventos y los envía por lotes a POST /api/logs/frontend,
 * que los escribe en logs/frontend-AAAA-MM-DD.txt. Sin conexión los guarda en LocalForage
 * y los reenvía al volver la red.
 */
@Injectable({ providedIn: 'root' })
export class LoggerService implements LoggerPort, OnDestroy {
  private readonly config = inject(APP_CONFIG);
  private readonly transporte = inject(LogTransportPort);
  private readonly almacen = inject(KeyValueStorePort);

  private pendientes: EventoLog[] = [];
  private enviando = false;
  private pausaHasta = 0;
  private usuario: number | undefined;
  private readonly sesion = crearIdSesion();
  private readonly intervalo: ReturnType<typeof setInterval> | null = null;
  private readonly alOcultar = () => {
    if (document.visibilityState === 'hidden') this.vaciarAlSalir();
  };
  private readonly alSalir = () => this.vaciarAlSalir();
  private readonly alConectar = () => void this.reenviarCola();

  constructor() {
    if (this.config.logs.enviarAlServidor) {
      this.intervalo = setInterval(() => void this.enviar(), INTERVALO_ENVIO_MS);
      if (typeof window !== 'undefined') {
        document.addEventListener('visibilitychange', this.alOcultar);
        window.addEventListener('pagehide', this.alSalir);
        window.addEventListener('online', this.alConectar);
      }
      void this.reenviarCola();
    }
  }

  ngOnDestroy(): void {
    if (this.intervalo) clearInterval(this.intervalo);
    if (typeof window !== 'undefined') {
      document.removeEventListener('visibilitychange', this.alOcultar);
      window.removeEventListener('pagehide', this.alSalir);
      window.removeEventListener('online', this.alConectar);
    }
  }

  debug(contexto: string, mensaje: string, meta?: unknown): void {
    this.registrar('DEBUG', contexto, mensaje, meta);
  }
  info(contexto: string, mensaje: string, meta?: unknown): void {
    this.registrar('INFO', contexto, mensaje, meta);
  }
  warn(contexto: string, mensaje: string, meta?: unknown): void {
    this.registrar('WARN', contexto, mensaje, meta);
  }
  error(contexto: string, mensaje: string, meta?: unknown): void {
    this.registrar('ERROR', contexto, mensaje, meta);
  }

  establecerUsuario(id: number | undefined): void {
    this.usuario = id;
  }

  /** Envía lo pendiente. Se llama por intervalo, por tamaño de lote o ante un ERROR. */
  async enviar(): Promise<void> {
    if (!this.config.logs.enviarAlServidor || this.enviando || this.pendientes.length === 0) return;
    if (Date.now() < this.pausaHasta) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await this.encolar(this.pendientes.splice(0));
      return;
    }
    this.enviando = true;
    const lote = this.pendientes.splice(0, MAX_LOTE);
    try {
      await this.transporte.enviar(lote);
    } catch (e) {
      // Nunca se registra un fallo de envío de logs (evita bucles)
      if (e instanceof ApiError && e.status === 429) this.pausaHasta = Date.now() + 60_000;
      await this.encolar(lote);
    } finally {
      this.enviando = false;
    }
    if (this.pendientes.length >= UMBRAL_LOTE) await this.enviar();
  }

  /** Reenvía en orden lo guardado sin conexión. */
  async reenviarCola(): Promise<void> {
    if (!this.config.logs.enviarAlServidor) return;
    const cola = (await this.leerCola()) ?? [];
    if (cola.length === 0) return;
    await this.almacen.remove(CLAVE_COLA_LOGS);
    this.pendientes = [...cola, ...this.pendientes];
    while (this.pendientes.length > 0 && !this.enviando) {
      const antes = this.pendientes.length;
      await this.enviar();
      if (this.pendientes.length >= antes) break;
      const enCola = await this.leerCola();
      if (enCola && enCola.length > 0) break; // volvió a fallar
    }
  }

  private registrar(nivel: NivelLog, contexto: string, mensaje: string, meta?: unknown): void {
    const { logs } = this.config;
    if (PESO[nivel] < PESO[logs.nivelMinimo]) return;
    const evento: EventoLog = {
      nivel,
      mensaje: mensaje.slice(0, 2000),
      contexto,
      fecha: new Date().toISOString(),
      url: typeof location !== 'undefined' ? location.pathname : undefined,
      sesion: this.sesion,
      usuario: this.usuario,
      ...(meta !== undefined ? { meta: sanitizar(meta) } : {}),
    };
    if (logs.consola) this.aConsola(evento);
    if (!logs.enviarAlServidor) return;

    this.pendientes.push(evento);
    if (nivel === 'ERROR' || this.pendientes.length >= UMBRAL_LOTE) void this.enviar();
  }

  private vaciarAlSalir(): void {
    if (this.pendientes.length === 0) return;
    while (this.pendientes.length > 0) {
      const lote = this.pendientes.splice(0, MAX_LOTE);
      if (!this.transporte.enviarAlSalir(lote)) {
        void this.encolar([...lote, ...this.pendientes.splice(0)]);
        return;
      }
    }
  }

  private async encolar(eventos: EventoLog[]): Promise<void> {
    if (eventos.length === 0) return;
    const cola = [...((await this.leerCola()) ?? []), ...eventos];
    await this.almacen.set(CLAVE_COLA_LOGS, cola.slice(-MAX_COLA));
  }

  private async leerCola(): Promise<EventoLog[] | null> {
    try {
      return await this.almacen.get<EventoLog[]>(CLAVE_COLA_LOGS);
    } catch {
      return null;
    }
  }

  private aConsola(e: EventoLog): void {
    const linea = `[${e.nivel}] [${e.contexto}] ${e.mensaje}`;
    const args: unknown[] = e.meta !== undefined ? [linea, e.meta] : [linea];
    if (e.nivel === 'ERROR') console.error(...args);
    else if (e.nivel === 'WARN') console.warn(...args);
    else if (e.nivel === 'INFO') console.info(...args);
    else console.debug(...args);
  }
}

function crearIdSesion(): string {
  const clave = 'trackit.logSession';
  try {
    const existente = sessionStorage.getItem(clave);
    if (existente) return existente;
    const nuevo = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
    sessionStorage.setItem(clave, nuevo);
    return nuevo;
  } catch {
    return Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  }
}
