/**
 * Ubicación del dispositivo con diagnóstico de por qué falla. En Windows, Chrome usa la
 * ubicación del sistema: si "Servicios de ubicación" o "Permitir que las aplicaciones de
 * escritorio accedan a la ubicación" están apagados, el navegador responde "permiso denegado"
 * aunque el sitio sí tenga permiso. Por eso se cruza el error con navigator.permissions.
 */
export type MotivoFalloUbicacion =
  | 'no-soportado'
  | 'inseguro'
  | 'bloqueado-sitio'
  | 'bloqueado-sistema'
  | 'rechazado'
  | 'no-disponible';

export class ErrorUbicacion extends Error {
  constructor(
    readonly motivo: MotivoFalloUbicacion,
    message: string,
  ) {
    super(message);
    this.name = 'ErrorUbicacion';
  }
}

/** Precisión (metros) por encima de la cual se pide confirmar el punto en el mapa. */
export const PRECISION_DUDOSA_M = 1_000;

export interface EntornoUbicacion {
  geolocation: Pick<Geolocation, 'getCurrentPosition'> | null;
  seguro: boolean;
  permiso(): Promise<PermissionState | null>;
  esWindows: boolean;
}

export function entornoNavegador(): EntornoUbicacion {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  return {
    geolocation: nav && 'geolocation' in nav ? nav.geolocation : null,
    seguro: typeof isSecureContext === 'undefined' ? true : isSecureContext,
    esWindows: !!nav && /windows/i.test(nav.userAgent),
    permiso: async () => {
      try {
        const r = await nav?.permissions?.query({ name: 'geolocation' as PermissionName });
        return r?.state ?? null;
      } catch {
        return null;
      }
    },
  };
}

export function mensajeUbicacion(motivo: MotivoFalloUbicacion, esWindows = true): string {
  switch (motivo) {
    case 'no-soportado':
      return 'Este navegador no permite obtener la ubicación. Márcala en el mapa.';
    case 'inseguro':
      return 'La ubicación solo funciona en una conexión segura (https) o en localhost. Márcala en el mapa.';
    case 'bloqueado-sistema':
      return esWindows
        ? 'El navegador tiene permiso, pero Windows tiene la ubicación apagada. Ve a Configuración › Privacidad y seguridad › Ubicación, activa "Servicios de ubicación" y "Permitir que las aplicaciones de escritorio accedan a tu ubicación", y vuelve a intentarlo.'
        : 'El navegador tiene permiso, pero la ubicación del sistema está apagada. Actívala en los ajustes del dispositivo y vuelve a intentarlo.';
    case 'bloqueado-sitio':
      return 'La ubicación está bloqueada para este sitio. Toca el ícono junto a la dirección web › Ubicación › Permitir, y vuelve a intentarlo.';
    case 'rechazado':
      return 'No aceptaste el permiso de ubicación. Vuelve a tocar "Usar mi ubicación" y elige Permitir.';
    case 'no-disponible':
      return 'No pudimos detectar tu ubicación (sin señal o tardó demasiado). Márcala en el mapa.';
  }
}

function pedir(
  geo: Pick<Geolocation, 'getCurrentPosition'>,
  opciones: PositionOptions,
): Promise<GeolocationPosition> {
  return new Promise((ok, mal) => geo.getCurrentPosition(ok, mal, opciones));
}

/** Clasifica un PERMISSION_DENIED según el estado real del permiso del sitio. */
export async function motivoDenegado(entorno: EntornoUbicacion): Promise<MotivoFalloUbicacion> {
  const estado = await entorno.permiso();
  if (estado === 'granted') return 'bloqueado-sistema';
  if (estado === 'denied') return 'bloqueado-sitio';
  return 'rechazado';
}

/**
 * Primero un intento rápido de baja precisión (wifi/red, responde en 1-2 s) y, si no hay
 * respuesta, uno con GPS. Lanza ErrorUbicacion con un mensaje listo para mostrar.
 */
export async function obtenerUbicacion(
  entorno: EntornoUbicacion = entornoNavegador(),
): Promise<GeolocationPosition> {
  const geo = entorno.geolocation;
  if (!geo) throw new ErrorUbicacion('no-soportado', mensajeUbicacion('no-soportado'));
  if (!entorno.seguro) throw new ErrorUbicacion('inseguro', mensajeUbicacion('inseguro'));
  try {
    return await pedir(geo, { enableHighAccuracy: false, timeout: 8_000, maximumAge: 120_000 });
  } catch (e) {
    const err = e as GeolocationPositionError;
    if (err?.code === 1) {
      const motivo = await motivoDenegado(entorno);
      throw new ErrorUbicacion(motivo, mensajeUbicacion(motivo, entorno.esWindows));
    }
  }
  try {
    return await pedir(geo, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 });
  } catch (e) {
    const err = e as GeolocationPositionError;
    if (err?.code === 1) {
      const motivo = await motivoDenegado(entorno);
      throw new ErrorUbicacion(motivo, mensajeUbicacion(motivo, entorno.esWindows));
    }
    throw new ErrorUbicacion('no-disponible', mensajeUbicacion('no-disponible'));
  }
}
