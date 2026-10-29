import { EnvironmentProviders, Provider, makeEnvironmentProviders } from '@angular/core';
import { AppEnvironment, FeatureFlags } from '../environments/environment.model';
import { APP_CONFIG } from '../app/core/config/app-config';
import {
  EventoLog,
  KeyValueStorePort,
  LogTransportPort,
  LoggerPort,
  SessionStoragePort,
} from '../app/core/ports';
import { Geo, GEOLOCALIZACION } from '../app/features/conductor/state/geolocalizacion';

export const API_BASE = 'http://api.test/api';

export const FLAGS_APAGADOS: FeatureFlags = {
  conductorMe: false,
  zonasEndpoint: false,
  clienteEnviosEndpoint: false,
  disponiblesEndpoint: false,
  iniciarRutaEndpoint: false,
  pendientesEndpoint: false,
  evidenciaUpload: false,
  ubicacion: false,
  reputacion: false,
  motivoRechazo: false,
  adminDashboard: false,
  categoriaEnvio: false,
};

export function configPrueba(
  parcial: Partial<Omit<AppEnvironment, 'features'>> & { features?: Partial<FeatureFlags> } = {},
): AppEnvironment {
  return {
    production: false,
    apiBaseUrl: API_BASE,
    cloudinary: { cloudName: '', uploadPreset: '' },
    logs: { nivelMinimo: 'DEBUG', enviarAlServidor: false, consola: false },
    demo: { conductores: [{ idUsuario: 2, idConductor: 1, estadoAprobacion: 'Aprobado' }] },
    ...parcial,
    features: { ...FLAGS_APAGADOS, ...(parcial.features ?? {}) },
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

/** Dobles de infraestructura comunes a casi todas las pruebas. */
export function provideFakesBase(cfg?: AppEnvironment): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideConfig(cfg),
    { provide: SessionStoragePort, useClass: FakeSessionStorage },
    { provide: KeyValueStorePort, useClass: FakeLocalForage },
    { provide: LoggerPort, useClass: FakeLogger },
    { provide: LogTransportPort, useClass: FakeLogTransport },
    { provide: GEOLOCALIZACION, useClass: FakeGeolocation },
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
