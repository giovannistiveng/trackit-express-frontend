/** Reglas de validación puras (sin Angular). */

const PLACA_RE = /^[A-Z]{3}\d{2}[A-Z0-9]$/;
const PIN_RE = /^\d{4}$/;
const NOMBRE_RE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?: [A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$/;

export const MAX_NOMBRE = 120;

/** usuario@dominio.tld sin espacios (sin expresión regular, para no tener retroceso costoso). */
function formatoCorreo(v: string): boolean {
  if (/\s/.test(v)) return false;
  const arroba = v.indexOf('@');
  if (arroba < 1 || arroba !== v.lastIndexOf('@')) return false;
  const dominio = v.slice(arroba + 1);
  const punto = dominio.lastIndexOf('.');
  return punto > 0 && dominio.length - punto - 1 >= 2;
}
export const MAX_CORREO = 180;
export const MAX_ARCHIVO_BYTES = 5 * 1024 * 1024;

/** Mayúsculas y sin espacios ni guiones: " abc-123 " → "ABC123". */
export function normalizarPlaca(valor: string): string {
  return valor.toUpperCase().replace(/[\s-]+/g, '');
}

/** Placa colombiana: ABC123 (carro) o ABC12D (moto). */
export function esPlacaValida(valor: string): boolean {
  return PLACA_RE.test(normalizarPlaca(valor));
}

export function esPinValido(valor: string): boolean {
  return PIN_RE.test(valor);
}

export interface RequisitosContrasena {
  longitud: boolean;
  mayuscula: boolean;
  numero: boolean;
}

export function requisitosContrasena(valor: string): RequisitosContrasena {
  return {
    longitud: valor.length >= 8,
    mayuscula: /[A-ZÁÉÍÓÚÑ]/.test(valor),
    numero: /\d/.test(valor),
  };
}

export function esContrasenaValida(valor: string): boolean {
  const r = requisitosContrasena(valor);
  return r.longitud && r.mayuscula && r.numero;
}

export function esCorreoValido(valor: string): boolean {
  const v = valor.trim();
  return v.length > 0 && v.length <= MAX_CORREO && formatoCorreo(v);
}

/** Colapsa espacios repetidos y recorta extremos. */
export function limpiarTexto(valor: string): string {
  return valor.trim().replace(/\s+/g, ' ');
}

/** Solo letras (con tildes y ñ) y espacios, máximo 120 caracteres. */
export function esNombreValido(valor: string): boolean {
  const v = limpiarTexto(valor);
  return v.length > 0 && v.length <= MAX_NOMBRE && NOMBRE_RE.test(v);
}

export function nombreCompleto(nombres: string, apellidos: string): string {
  return limpiarTexto(`${nombres} ${apellidos}`);
}

export type ErrorArchivo = 'tipo' | 'tamano' | 'vacio';

export function validarArchivo(
  archivo: { type: string; size: number } | null | undefined,
  tiposPermitidos: readonly string[],
  maxBytes = MAX_ARCHIVO_BYTES,
): ErrorArchivo | null {
  if (!archivo) return 'vacio';
  if (!tiposPermitidos.includes(archivo.type)) return 'tipo';
  if (archivo.size > maxBytes) return 'tamano';
  return null;
}

export function esIdValido(valor: unknown): boolean {
  const n = typeof valor === 'string' ? Number(valor) : valor;
  return (
    typeof n === 'number' &&
    Number.isInteger(n) &&
    n > 0 &&
    String(valor).trim() !== '' &&
    /^\d+$/.test(String(valor))
  );
}

export function esCoordenadaValida(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/** Iniciales para el avatar: "Laura Méndez Ríos" → "LM". */
export function iniciales(nombre: string | undefined): string {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
  return (
    partes
      .slice(0, 2)
      .map((p) => p[0])
      .join('') || '?'
  ).toUpperCase();
}
