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

/**
 * Teselas del mapa. OpenStreetMap es gratuito con atribución; para mucho tráfico se puede
 * cambiar aquí por un proveedor (Mapbox, Stadia, MapTiler) sin tocar las pantallas.
 */
export const TESELAS = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  atribucion:
    '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
};

/** Agrega la capa base con el estilo de TrackIt (clase mapa-base: colores más suaves). */
export function agregarCapaBase(L: Leaflet, mapa: import('leaflet').Map): void {
  L.tileLayer(TESELAS.url, {
    maxZoom: TESELAS.maxZoom,
    attribution: TESELAS.atribucion,
    className: 'mapa-base',
  }).addTo(mapa);
}

/** Pin con una letra o número (A = recoger, B = entregar, 1-3 = paradas). */
export function htmlPinLetra(fondo: string, texto: string, letra = '#ffffff'): string {
  return `<span class="pin-mapa" style="--pin:${fondo};color:${letra}"><b>${texto}</b></span>`;
}
