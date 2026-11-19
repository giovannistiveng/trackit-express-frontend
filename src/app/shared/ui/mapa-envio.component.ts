import { agregarCapaBase, cargarLeaflet, htmlPinLetra } from '../util/leaflet';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { LayerGroup, Map as LeafletMap, Marker } from 'leaflet';
import { Coordenadas, RutaMapa, Seguimiento } from '../../core/domain';
import { GeoPort } from '../../core/ports';
import { IconoComponent } from './icono.component';

/** Centro por defecto: parque principal de Fusagasugá. */
export const CENTRO_FUSAGASUGA: Coordenadas = { lat: 4.3369, lon: -74.3638 };
/** Duración de la animación del conductor entre dos posiciones. */
export const DURACION_MOVIMIENTO_MS = 900;

const SVG_MOTO =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2"/></svg>';

/** Clave estable de una lista de puntos (para no pedir la misma ruta dos veces). */
export function claveRuta(puntos: Coordenadas[]): string {
  return puntos.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(';');
}

/** Punto intermedio entre a y b (t de 0 a 1). */
export function interpolar(a: Coordenadas, b: Coordenadas, t: number): Coordenadas {
  const k = Math.min(1, Math.max(0, t));
  return { lat: a.lat + (b.lat - a.lat) * k, lon: a.lon + (b.lon - a.lon) * k };
}

/**
 * Mapa del servicio: la ruta por calles (A recoger → paradas → B entregar), el recorrido real del
 * conductor y su posición, que se mueve suave entre una actualización y la siguiente.
 * Leaflet se carga de forma perezosa.
 */
@Component({
  selector: 'ti-mapa-envio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  // isolate: las capas de Leaflet (z-index 400+) no se salen del mapa ni tapan cabeceras o modales
  host: { class: 'relative isolate z-0 block' },
  template: `
    <div
      #mapa
      class="w-full overflow-hidden border border-linea bg-[#e6ece8]"
      [class]="clasesAlto()"
      role="img"
      [attr.aria-label]="descripcion()"
    ></div>
    @if (rutaInfo(); as r) {
      <p
        class="absolute right-3 top-3 z-[500] rounded-full bg-papel/95 px-3 py-1 text-xs font-semibold shadow-[var(--shadow-suave)]"
      >
        {{ r.km }} km por {{ r.exacta ? 'carretera' : 'línea recta' }}
      </p>
    }
    <button
      type="button"
      class="absolute bottom-3 right-3 z-[500] grid size-11 place-items-center rounded-full bg-papel text-tinta shadow-[var(--shadow-elevada)] hover:text-marca"
      (click)="centrar()"
      aria-label="Centrar el mapa en el envío"
    >
      <ti-icono nombre="locate" />
    </button>
  `,
})
export class MapaEnvioComponent implements AfterViewInit, OnDestroy {
  readonly seguimiento = input<Seguimiento | null>(null);
  /** Posición propia (vista del conductor), si se conoce antes de que llegue al servidor. */
  readonly posicionPropia = input<Coordenadas | null>(null);
  /** Paradas intermedias, en orden. */
  readonly paradas = input<Coordenadas[]>([]);
  /** Dibuja la ruta por calles entre origen, paradas y destino. */
  readonly conRuta = input(true);
  /** normal: tarjeta; alto: ocupa más pantalla (vista del conductor). */
  readonly alto = input<'normal' | 'alto'>('normal');

  private readonly geo = inject(GeoPort);
  /** El mapa se dibuja en el primer hijo del componente (el div #mapa). */
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly descripcion = signal('Mapa del envío');
  protected readonly rutaInfo = signal<RutaMapa | null>(null);
  private L: typeof import('leaflet') | null = null;
  private mapa: LeafletMap | null = null;
  private capa: LayerGroup | null = null;
  private conductor: Marker | null = null;
  private posicionMostrada: Coordenadas | null = null;
  private animacion = 0;
  private encuadrado = false;
  private claveRutaPedida = '';

  protected clasesAlto(): string {
    return this.alto() === 'alto' ? 'h-[52vh] min-h-72 rounded-3xl' : 'h-72 rounded-2xl sm:h-96';
  }

  constructor() {
    effect(() => this.pintar(this.seguimiento(), this.posicionPropia(), this.paradas()));
    effect(() => {
      const s = this.seguimiento();
      const puntos = [s?.origen.coords, ...this.paradas(), s?.destino.coords].filter(
        (p): p is Coordenadas => !!p,
      );
      if (this.conRuta() && puntos.length >= 2) void this.pedirRuta(puntos);
    });
  }

  ngAfterViewInit(): void {
    void this.inicializar();
  }

  /** Carga inicial (asíncrona); el hook de Angular no espera promesas. */
  async inicializar(): Promise<void> {
    this.L = await cargarLeaflet();
    const s = this.seguimiento();
    const centro = s?.ultima ?? s?.origen.coords ?? CENTRO_FUSAGASUGA;
    this.mapa = this.L.map(this.host.nativeElement.firstElementChild as HTMLElement, {
      zoomControl: true,
      scrollWheelZoom: false,
    }).setView([centro.lat, centro.lon], 14);
    agregarCapaBase(this.L, this.mapa);
    this.capa = this.L.layerGroup().addTo(this.mapa);
    this.pintar(this.seguimiento(), this.posicionPropia(), this.paradas());
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animacion);
    this.mapa?.stop();
    this.mapa?.remove();
    this.mapa = null;
  }

  /** Encaja en pantalla la ruta, las paradas y el conductor. */
  centrar(): void {
    if (!this.L || !this.mapa) return;
    const puntos = this.puntosVisibles(this.seguimiento(), this.posicionPropia());
    if (puntos.length === 1) this.mapa.setView([puntos[0].lat, puntos[0].lon], 15);
    else if (puntos.length > 1)
      this.mapa.fitBounds(this.L.latLngBounds(puntos.map((p) => [p.lat, p.lon])), {
        padding: [48, 48],
        maxZoom: 16,
      });
  }

  /** Pide la ruta por calles una sola vez por combinación de puntos; si falla, no se dibuja. */
  private async pedirRuta(puntos: Coordenadas[]): Promise<void> {
    const clave = claveRuta(puntos);
    if (clave === this.claveRutaPedida) return;
    this.claveRutaPedida = clave;
    try {
      const r = await this.geo.ruta(puntos);
      if (clave !== this.claveRutaPedida) return;
      this.rutaInfo.set(r);
      this.pintar(this.seguimiento(), this.posicionPropia(), this.paradas());
    } catch {
      this.rutaInfo.set(null);
    }
  }

  private puntosVisibles(s: Seguimiento | null, propia: Coordenadas | null): Coordenadas[] {
    const conductor = propia ?? s?.ultima ?? null;
    return [s?.origen.coords, ...this.paradas(), s?.destino.coords, conductor].filter(
      (p): p is Coordenadas => !!p,
    );
  }

  private pintar(s: Seguimiento | null, propia: Coordenadas | null, paradas: Coordenadas[]): void {
    if (!this.L || !this.mapa || !this.capa) return;
    const L = this.L;
    const capa = this.capa;
    capa.clearLayers();

    const ruta = this.rutaInfo();
    if (ruta && ruta.puntos.length > 1) {
      const linea = ruta.puntos.map((p) => [p.lat, p.lon] as [number, number]);
      // Borde blanco y trazo verde: la ruta se lee sobre cualquier fondo
      L.polyline(linea, { color: '#ffffff', weight: 9, opacity: 0.9, lineCap: 'round' }).addTo(
        capa,
      );
      L.polyline(linea, {
        color: '#0b5d45',
        weight: 5,
        opacity: 0.55,
        lineCap: 'round',
        dashArray: ruta.exacta ? undefined : '8 10',
      }).addTo(capa);
    }
    if (s && s.recorrido.length > 1) {
      L.polyline(
        s.recorrido.map((p) => [p.lat, p.lon] as [number, number]),
        { color: '#0b5d45', weight: 6, opacity: 0.95, lineCap: 'round' },
      ).addTo(capa);
    }

    const pin = (c: Coordenadas, fondo: string, texto: string, titulo: string, letra?: string) =>
      L.marker([c.lat, c.lon], {
        title: titulo,
        icon: L.divIcon({
          className: '',
          html: htmlPinLetra(fondo, texto, letra),
          iconSize: [34, 34],
          iconAnchor: [17, 34],
        }),
      })
        .bindTooltip(titulo, { direction: 'top', offset: [0, -32] })
        .addTo(capa);

    if (s?.origen.coords) pin(s.origen.coords, '#142019', 'A', `Recoger: ${s.origen.direccion}`);
    paradas.forEach((p, i) => pin(p, '#56635c', String(i + 1), `Parada ${i + 1}`));
    if (s?.destino.coords)
      pin(s.destino.coords, '#f5c518', 'B', `Entregar: ${s.destino.direccion}`, '#142019');

    const posicion = propia ?? s?.ultima ?? null;
    if (posicion) this.pintarConductor(L, s, posicion, !!propia || !!s?.enVivo);
    else {
      this.conductor = null;
      this.posicionMostrada = null;
    }
    this.descripcion.set(describirMapa(s, posicion));

    if (!this.encuadrado && this.puntosVisibles(s, propia).length > 0) {
      this.encuadrado = true;
      this.centrar();
    } else if (posicion && !this.mapa.getBounds().contains([posicion.lat, posicion.lon])) {
      this.mapa.panTo([posicion.lat, posicion.lon]);
    }
  }

  /** Marcador del conductor (con pulso si está en vivo) y la línea hacia su próxima meta. */
  private pintarConductor(
    L: typeof import('leaflet'),
    s: Seguimiento | null,
    posicion: Coordenadas,
    vivo: boolean,
  ): void {
    const capa = this.capa as LayerGroup;
    const meta = s?.estado === 'Asignado' ? s.origen.coords : s?.destino.coords;
    if (meta) {
      L.polyline(
        [
          [posicion.lat, posicion.lon],
          [meta.lat, meta.lon],
        ],
        { color: '#142019', weight: 2, opacity: 0.5, dashArray: '4 8' },
      ).addTo(capa);
    }
    const icono = L.divIcon({
      className: '',
      html: `<span class="marcador-vivo ${vivo ? 'activo' : ''}">${SVG_MOTO}</span>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
    const desde = this.posicionMostrada;
    this.conductor ??= L.marker([posicion.lat, posicion.lon], {
      icon: icono,
      title: 'Conductor',
      zIndexOffset: 1000,
    });
    this.conductor.setIcon(icono).addTo(capa);
    this.moverConductor(desde, posicion);
  }

  /** Desliza el marcador desde donde estaba hasta la posición nueva. */
  private moverConductor(desde: Coordenadas | null, hasta: Coordenadas): void {
    cancelAnimationFrame(this.animacion);
    const marcador = this.conductor as Marker;
    const reducido = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!desde || reducido || typeof requestAnimationFrame !== 'function') {
      marcador.setLatLng([hasta.lat, hasta.lon]);
      this.posicionMostrada = hasta;
      return;
    }
    const inicio = performance.now();
    const paso = (ahora: number) => {
      const p = interpolar(desde, hasta, (ahora - inicio) / DURACION_MOVIMIENTO_MS);
      marcador.setLatLng([p.lat, p.lon]);
      this.posicionMostrada = p;
      if (ahora - inicio < DURACION_MOVIMIENTO_MS) this.animacion = requestAnimationFrame(paso);
    };
    this.animacion = requestAnimationFrame(paso);
  }
}

/** Texto alternativo del mapa para lectores de pantalla. */
export function describirMapa(s: Seguimiento | null, posicion: Coordenadas | null): string {
  if (!posicion)
    return s
      ? `Mapa del envío de ${s.origen.direccion} a ${s.destino.direccion}`
      : 'Mapa del envío';
  const rumbo = s?.destino.coords ? `, rumbo a ${s.destino.direccion}` : '';
  return `Mapa: el conductor está en ${posicion.lat.toFixed(4)}, ${posicion.lon.toFixed(4)}${rumbo}`;
}
