export type Leaflet = typeof import('leaflet');

/**
 * Carga Leaflet bajo demanda. Leaflet es un módulo CommonJS: en el build de desarrollo la
 * importación dinámica trae sus funciones directamente, pero en el de producción vienen
 * dentro de `default`. Se aceptan las dos formas.
 */
export async function cargarLeaflet(): Promise<Leaflet> {
  return normalizarLeaflet(await import('leaflet'));
}

export function normalizarLeaflet(modulo: Leaflet | { default: Leaflet }): Leaflet {
  return 'map' in modulo && typeof modulo.map === 'function'
    ? modulo
    : (modulo as { default: Leaflet }).default;
}
