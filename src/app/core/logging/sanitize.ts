const EXACTAS = ['pin', 'pin_seguridad', 'pinseguridad', 'apikey', 'api_key'];
const FRAGMENTOS = ['password', 'contrasena', 'contraseña', 'token', 'secret', 'authorization'];

export function esClaveSensible(clave: string): boolean {
  const k = clave.toLowerCase();
  return EXACTAS.includes(k) || FRAGMENTOS.some((f) => k.includes(f));
}

/** Copia del valor con las claves sensibles reemplazadas por [OCULTO]. */
export function sanitizar(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 5) return '[...]';
  if (valor === null || valor === undefined) return valor;
  if (valor instanceof Error)
    return { nombre: valor.name, mensaje: valor.message, stack: recortarStack(valor.stack) };
  if (typeof File !== 'undefined' && valor instanceof Blob) return `[Archivo ${valor.size} bytes]`;
  if (Array.isArray(valor)) return valor.map((v) => sanitizar(v, profundidad + 1));
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === 'object') {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      salida[k] = esClaveSensible(k) ? '[OCULTO]' : sanitizar(v, profundidad + 1);
    }
    return salida;
  }
  return valor;
}

export function recortarStack(stack: string | undefined, lineas = 15): string | undefined {
  return stack?.split('\n').slice(0, lineas).join('\n');
}
