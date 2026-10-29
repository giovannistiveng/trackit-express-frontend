import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { LayerGroup, Map as LeafletMap, Marker, Polyline } from 'leaflet';
import { Coordenadas, Seguimiento } from '../../core/domain';
import { IconoComponent } from './icono.component';

/** Centro por defecto: parque principal de Fusagasugá. */
export const CENTRO_FUSAGASUGA: Coordenadas = { lat: 4.3369, lon: -74.3638 };

const SVG_MOTO =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2"/></svg>';

function htmlPin(color: string, interior: string): string {
  return `<span class="marcador-punto" style="background:${color}"><span style="display:block;width:10px;height:10px;border-radius:9999px;background:${interior};border:2px solid #1f1a17"></span></span>`;
}

/**
 * Mapa Leaflet con teselas de OpenStreetMap: origen, destino, recorrido del conductor y su
 * posición actual (con pulso si la señal está en vivo). Leaflet se carga de forma perezosa.
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
      class="h-72 w-full overflow-hidden rounded-2xl border border-linea bg-[#eef2ec] sm:h-96"
      role="img"
      [attr.aria-label]="descripcion()"
    ></div>
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

  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('mapa');
  protected readonly descripcion = signal('Mapa del envío');
  private L: typeof import('leaflet') | null = null;
  private mapa: LeafletMap | null = null;
  private capa: LayerGroup | null = null;
  private recorrido: Polyline | null = null;
  private conductor: Marker | null = null;
  private encuadrado = false;

  constructor() {
    effect(() => this.pintar(this.seguimiento(), this.posicionPropia()));
  }

  async ngAfterViewInit(): Promise<void> {
    this.L = await import('leaflet');
    const s = this.seguimiento();
    const centro = s?.ultima ?? s?.origen.coords ?? CENTRO_FUSAGASUGA;
    this.mapa = this.L.map(this.contenedor().nativeElement, {
      zoomControl: true,
      scrollWheelZoom: false,
    }).setView([centro.lat, centro.lon], 14);
    this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.mapa);
    this.capa = this.L.layerGroup().addTo(this.mapa);
    this.pintar(this.seguimiento(), this.posicionPropia());
  }

  ngOnDestroy(): void {
    this.mapa?.remove();
    this.mapa = null;
  }

  /** Encaja en pantalla origen, destino y conductor. */
  centrar(): void {
    if (!this.L || !this.mapa) return;
    const puntos = this.puntosVisibles(this.seguimiento(), this.posicionPropia());
    if (puntos.length === 1) this.mapa.setView([puntos[0].lat, puntos[0].lon], 15);
    else if (puntos.length > 1)
      this.mapa.fitBounds(this.L.latLngBounds(puntos.map((p) => [p.lat, p.lon])), {
        padding: [40, 40],
        maxZoom: 16,
      });
  }

  private puntosVisibles(s: Seguimiento | null, propia: Coordenadas | null): Coordenadas[] {
    const conductor = propia ?? s?.ultima ?? null;
    return [s?.origen.coords, s?.destino.coords, conductor].filter((p): p is Coordenadas => !!p);
  }

  private pintar(s: Seguimiento | null, propia: Coordenadas | null): void {
    if (!this.L || !this.mapa || !this.capa) return;
    const L = this.L;
    this.capa.clearLayers();
    this.recorrido = null;

    const marcadorFijo = (c: Coordenadas, color: string, interior: string, titulo: string) =>
      L.marker([c.lat, c.lon], {
        title: titulo,
        icon: L.divIcon({
          className: '',
          html: htmlPin(color, interior),
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        }),
      })
        .bindTooltip(titulo, { direction: 'top', offset: [0, -30] })
        .addTo(this.capa as LayerGroup);

    if (s?.origen.coords)
      marcadorFijo(s.origen.coords, '#1f1a17', '#fff', `Recoger: ${s.origen.direccion}`);
    if (s?.destino.coords)
      marcadorFijo(s.destino.coords, '#c2410c', '#f5c518', `Entregar: ${s.destino.direccion}`);

    if (s && s.recorrido.length > 1) {
      this.recorrido = L.polyline(
        s.recorrido.map((p) => [p.lat, p.lon] as [number, number]),
        { color: '#c2410c', weight: 5, opacity: 0.85, lineCap: 'round' },
      ).addTo(this.capa);
    }

    const posicion = propia ?? s?.ultima ?? null;
    if (posicion) {
      const meta = s?.estado === 'Asignado' ? s.origen.coords : s?.destino.coords;
      if (meta) {
        L.polyline(
          [
            [posicion.lat, posicion.lon],
            [meta.lat, meta.lon],
          ],
          { color: '#1f1a17', weight: 2, opacity: 0.55, dashArray: '6 8' },
        ).addTo(this.capa);
      }
      const vivo = !!propia || !!s?.enVivo;
      const icono = L.divIcon({
        className: '',
        html: `<span class="marcador-vivo ${vivo ? 'activo' : ''}">${SVG_MOTO}</span>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      if (this.conductor) this.conductor.setLatLng([posicion.lat, posicion.lon]).setIcon(icono);
      else
        this.conductor = L.marker([posicion.lat, posicion.lon], {
          icon: icono,
          title: 'Conductor',
          zIndexOffset: 1000,
        });
      this.conductor.addTo(this.capa);
    } else this.conductor = null;

    this.descripcion.set(
      posicion
        ? `Mapa: el conductor está en ${posicion.lat.toFixed(4)}, ${posicion.lon.toFixed(4)}${s?.destino.coords ? `, rumbo a ${s.destino.direccion}` : ''}`
        : `Mapa del envío${s ? ` de ${s.origen.direccion} a ${s.destino.direccion}` : ''}`,
    );

    if (!this.encuadrado && this.puntosVisibles(s, propia).length > 0) {
      this.encuadrado = true;
      this.centrar();
    } else if (posicion && !this.mapa.getBounds().contains([posicion.lat, posicion.lon])) {
      this.mapa.panTo([posicion.lat, posicion.lon]);
    }
  }
}
