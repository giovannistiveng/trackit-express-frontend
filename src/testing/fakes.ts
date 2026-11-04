import { EnvironmentProviders, Provider, makeEnvironmentProviders } from '@angular/core';
import { AppEnvironment } from '../environments/environment.model';
import { Coordenadas, Notificacion, SugerenciaDireccion } from '../app/core/domain';
import { APP_CONFIG } from '../app/core/config/app-config';
import {
  EventoLog,
  GeoPort,
  KeyValueStorePort,
  NotificationsPort,
  LogTransportPort,
  RealtimePort,
  EventosPort,
  PushPort,
  LoggerPort,
  SessionStoragePort,
} from '../app/core/ports';
import { Geo, GEOLOCALIZACION } from '../app/features/conductor/state/geolocalizacion';
import { SwPush } from '@angular/service-worker';
import { EMPTY, of } from 'rxjs';
import { EventosSseAdapter, FUENTE_EVENTOS } from '../app/core/adapters/sse/eventos-sse.adapter';
import { PushHibridoAdapter } from '../app/core/adapters/push/push-hibrido.adapter';
import { ENTORNO_UBICACION } from '../app/shared/ui/campo-direccion.component';
import { EntornoUbicacion } from '../app/shared/util/ubicacion';

export const API_BASE = 'http://api.test/api';

export function configPrueba(parcial: Partial<AppEnvironment> = {}): AppEnvironment {
  return {
    production: false,
    apiBaseUrl: API_BASE,
    logs: { nivelMinimo: 'DEBUG', enviarAlServidor: false, consola: false },
    ...parcial,
  };
}

export function provideConfig(cfg: AppEnvironment = configPrueba()): Provider {
  return { provide: APP_CONFIG, useValue: cfg };
}

export class FakeSessionStorage implements SessionStoragePort {
  readonly datos = new Map<string, string>();
  leer(c: string) {
    return this.datos.get(c) ?? null;
  }
  guardar(c: string, v: string) {
    this.datos.set(c, v);
  }
  borrar(c: string) {
    this.datos.delete(c);
  }
}

/** Doble de LocalForage en memoria (copia los valores como lo haría IndexedDB). */
export class FakeLocalForage implements KeyValueStorePort {
  readonly datos = new Map<string, unknown>();
  async get<T>(c: string): Promise<T | null> {
    return this.datos.has(c) ? (structuredClone(this.datos.get(c)) as T) : null;
  }
  async set<T>(c: string, v: T): Promise<void> {
    this.datos.set(c, structuredClone(v));
  }
  async remove(c: string): Promise<void> {
    this.datos.delete(c);
  }
}

export class FakeLogger implements LoggerPort {
  readonly eventos: { nivel: string; contexto: string; mensaje: string; meta?: unknown }[] = [];
  debug(contexto: string, mensaje: string, meta?: unknown) {
    this.eventos.push({ nivel: 'DEBUG', contexto, mensaje, meta });
  }
  info(contexto: string, mensaje: string, meta?: unknown) {
    this.eventos.push({ nivel: 'INFO', contexto, mensaje, meta });
  }
  warn(contexto: string, mensaje: string, meta?: unknown) {
    this.eventos.push({ nivel: 'WARN', contexto, mensaje, meta });
  }
  error(contexto: string, mensaje: string, meta?: unknown) {
    this.eventos.push({ nivel: 'ERROR', contexto, mensaje, meta });
  }
  de(nivel: string): string[] {
    return this.eventos.filter((e) => e.nivel === nivel).map((e) => e.mensaje);
  }
}

export class FakeLogTransport implements LogTransportPort {
  readonly lotes: EventoLog[][] = [];
  readonly balizas: EventoLog[][] = [];
  fallo: unknown = null;
  balizaOk = true;
  async enviar(eventos: EventoLog[]) {
    if (this.fallo) throw this.fallo;
    this.lotes.push(eventos);
  }
  enviarAlSalir(eventos: EventoLog[]) {
    if (this.balizaOk) this.balizas.push(eventos);
    return this.balizaOk;
  }
}

/** Notificaciones en memoria (por defecto, ninguna). */
export class FakeNotifications implements NotificationsPort {
  items: Notificacion[] = [];
  async listar() {
    return { noLeidas: this.items.filter((n) => !n.leida).length, items: this.items };
  }
  async noLeidas() {
    return this.items.filter((n) => !n.leida).length;
  }
  async leer(id: number) {
    this.items = this.items.map((n) => (n.id === id ? { ...n, leida: true } : n));
  }
  async leerTodas() {
    this.items = this.items.map((n) => ({ ...n, leida: true }));
  }
  async borrar(id: number) {
    this.items = this.items.filter((n) => n.id !== id);
  }
  async borrarLeidas() {
    const antes = this.items.length;
    this.items = this.items.filter((n) => !n.leida);
    return antes - this.items.length;
  }
}

/** Canal de eventos y push falsos: sin servidor (el canal SSE no se abre en jsdom). */
export class FakeRealtime implements RealtimePort {
  clave: string | null = 'CLAVE';
  readonly suscripciones: unknown[] = [];
  readonly bajas: string[] = [];
  async ticket() {
    return 'ticket';
  }
  urlEventos(ticket: string) {
    return `${API_BASE}/eventos?ticket=${ticket}`;
  }
  async clavePush() {
    return this.clave;
  }
  async suscribirPush(d: unknown) {
    this.suscripciones.push(d);
  }
  async desuscribirPush(endpoint: string) {
    this.bajas.push(endpoint);
  }
}

/** SwPush desactivado (como en desarrollo o en un navegador sin service worker). */
export const SW_PUSH_FALSO = {
  isEnabled: false,
  subscription: of(null),
  notificationClicks: EMPTY,
  messages: EMPTY,
  requestSubscription: vi.fn(async () => {
    throw new Error('sin service worker');
  }),
  unsubscribe: vi.fn(async () => undefined),
};

/** Ubicación del navegador simulada para "Usar mi ubicación". */
export class FakeEntornoUbicacion implements EntornoUbicacion {
  seguro = true;
  esWindows = true;
  estadoPermiso: PermissionState | null = 'prompt';
  /** Respuestas en orden: posición o código de error (1 denegado, 2 sin señal, 3 tiempo). */
  respuestas: (GeolocationPosition | number)[] = [];
  geolocation = {
    getCurrentPosition: (ok: PositionCallback, mal?: PositionErrorCallback | null) => {
      const r = this.respuestas.shift() ?? 2;
      if (typeof r === 'number') mal?.({ code: r, message: 'x' } as GeolocationPositionError);
      else ok(r);
    },
  } as Pick<Geolocation, 'getCurrentPosition'> | null;
  async permiso() {
    return this.estadoPermiso;
  }
}

export function posicion(lat: number, lon: number, precision = 20): GeolocationPosition {
  return {
    coords: { latitude: lat, longitude: lon, accuracy: precision },
    timestamp: Date.now(),
  } as GeolocationPosition;
}

export class FakeGeolocation implements Geo {
  exito: PositionCallback | null = null;
  fallo: PositionErrorCallback | null | undefined = null;
  limpiado: number[] = [];
  watchPosition(exito: PositionCallback, fallo?: PositionErrorCallback | null): number {
    this.exito = exito;
    this.fallo = fallo;
    return 7;
  }
  clearWatch(id: number): void {
    this.limpiado.push(id);
  }
  emitir(lat: number, lon: number, timestamp = Date.now()) {
    this.exito?.({ coords: { latitude: lat, longitude: lon }, timestamp } as GeolocationPosition);
  }
  fallar(code: number) {
    this.fallo?.({ code, PERMISSION_DENIED: 1, message: 'x' } as GeolocationPositionError);
  }
}

/** Buscador de direcciones falso: devuelve `resultados` y nombra cualquier punto como "Calle falsa". */
export class FakeGeo implements GeoPort {
  resultados: SugerenciaDireccion[] = [];
  fallo: unknown = null;
  readonly buscar = vi.fn(async (_texto: string) => {
    if (this.fallo) throw this.fallo;
    return this.resultados;
  });
  readonly inversa = vi.fn(async (p: Coordenadas): Promise<SugerenciaDireccion | null> => {
    if (this.fallo) throw this.fallo;
    return { nombre: 'Calle falsa 123', detalle: 'Calle falsa 123, Fusagasugá', coords: p };
  });
}

/** Dobles de infraestructura comunes a casi todas las pruebas. */
export function provideFakesBase(cfg?: AppEnvironment): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideConfig(cfg),
    { provide: SessionStoragePort, useClass: FakeSessionStorage },
    { provide: KeyValueStorePort, useClass: FakeLocalForage },
    { provide: LoggerPort, useClass: FakeLogger },
    { provide: LogTransportPort, useClass: FakeLogTransport },
    { provide: GEOLOCALIZACION, useClass: FakeGeolocation },
    { provide: NotificationsPort, useClass: FakeNotifications },
    { provide: GeoPort, useClass: FakeGeo },
    { provide: RealtimePort, useClass: FakeRealtime },
    { provide: SwPush, useValue: SW_PUSH_FALSO },
    { provide: FUENTE_EVENTOS, useValue: null },
    { provide: EventosPort, useExisting: EventosSseAdapter },
    { provide: PushPort, useExisting: PushHibridoAdapter },
    { provide: ENTORNO_UBICACION, useClass: FakeEntornoUbicacion },
  ]);
}

/** Espera a que se resuelvan promesas pendientes (microtareas encadenadas). */
export async function vaciarPromesas(veces = 5): Promise<void> {
  for (let i = 0; i < veces; i++) await Promise.resolve();
}

/** Atajos para pruebas de componentes. */
export function q<T extends Element = HTMLElement>(raiz: Element, selector: string): T {
  const el = raiz.querySelector<T>(selector);
  if (!el) throw new Error(`No se encontró ${selector}`);
  return el;
}

export function botonPorTexto(raiz: Element, texto: string | RegExp): HTMLButtonElement {
  const b = Array.from(raiz.querySelectorAll<HTMLButtonElement>('button')).find((x) =>
    typeof texto === 'string' ? x.textContent?.trim() === texto : texto.test(x.textContent ?? ''),
  );
  if (!b) throw new Error(`No hay botón "${texto}"`);
  return b;
}

export function escribir(input: HTMLInputElement | HTMLTextAreaElement, valor: string): void {
  input.value = valor;
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new Event('blur'));
}

export function elegir(select: HTMLSelectElement, indice: number): void {
  select.selectedIndex = indice;
  select.dispatchEvent(new Event('change'));
}

/** Implementación de mock que rechaza (evita rechazos sin manejar de mockRejectedValue). */
export function rechaza(error: unknown): () => Promise<never> {
  return async () => {
    throw error;
  };
}
