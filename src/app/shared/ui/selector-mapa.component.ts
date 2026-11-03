import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { LayerGroup, Map as LeafletMap, Marker } from 'leaflet';
import { Coordenadas, Zona } from '../../core/domain';
import { CENTRO_FUSAGASUGA } from './mapa-envio.component';

const PIN_ELEGIDO =
  '<span class="marcador-punto" style="background:#c2410c"><span style="display:block;width:10px;height:10px;border-radius:9999px;background:#f5c518;border:2px solid #1f1a17"></span></span>';

/**
 * Mapa para elegir un punto: clic o arrastrar el marcador. Opcionalmente dibuja las zonas de
 * cobertura y un radio alrededor del punto (editor de zonas del administrador).
 */
@Component({
  selector: 'ti-selector-mapa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative isolate z-0 block' },
  template: `<div
    #mapa
    class="w-full overflow-hidden rounded-2xl border border-linea bg-[#eef2ec]"
    [class]="alto()"
    role="application"
    [attr.aria-label]="etiqueta()"
  ></div>`,
})
export class SelectorMapaComponent implements AfterViewInit, OnDestroy {
  readonly punto = input<Coordenadas | null>(null);
  /** Zonas que se dibujan como círculos (con su nombre). */
  readonly zonas = input<Zona[]>([]);
  /** Zona resaltada (la que se está editando). */
  readonly idZonaActiva = input<number | null>(null);
  /** Radio en km a dibujar alrededor del punto (editor de zonas). */
  readonly radioKm = input<number | null>(null);
  readonly alto = input('h-80 sm:h-[26rem]');
  readonly etiqueta = input('Mapa: haz clic para elegir el punto');
  readonly elegir = output<Coordenadas>();

  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('mapa');
  private L: typeof import('leaflet') | null = null;
  private mapa: LeafletMap | null = null;
  private capaZonas: LayerGroup | null = null;
  private capaPunto: LayerGroup | null = null;
  private marcador: Marker | null = null;
  private encuadrado = false;

  constructor() {
    effect(() => this.pintarZonas(this.zonas(), this.idZonaActiva()));
    effect(() => this.pintarPunto(this.punto(), this.radioKm()));
  }

  async ngAfterViewInit(): Promise<void> {
    this.L = await import('leaflet');
    const inicio = this.punto() ?? CENTRO_FUSAGASUGA;
    this.mapa = this.L.map(this.contenedor().nativeElement, { scrollWheelZoom: true }).setView(
      [inicio.lat, inicio.lon],
      this.punto() ? 16 : 13,
    );
    this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.mapa);
    this.capaZonas = this.L.layerGroup().addTo(this.mapa);
    this.capaPunto = this.L.layerGroup().addTo(this.mapa);
    this.mapa.on('click', (e) => this.elegir.emit(redondear(e.latlng.lat, e.latlng.lng)));
    this.pintarZonas(this.zonas(), this.idZonaActiva());
    this.pintarPunto(this.punto(), this.radioKm());
    // El contenedor puede haberse medido dentro de un modal que aún animaba
    setTimeout(() => this.mapa?.invalidateSize(), 150);
  }

  ngOnDestroy(): void {
    this.mapa?.stop();
    this.mapa?.remove();
    this.mapa = null;
  }

  /** Centra el mapa en un punto (p. ej. tras "Usar mi ubicación"). */
  irA(p: Coordenadas, zoom = 16): void {
    this.mapa?.setView([p.lat, p.lon], zoom);
  }

  private pintarZonas(zonas: Zona[], activa: number | null): void {
    if (!this.L || !this.capaZonas) return;
    const L = this.L;
    this.capaZonas.clearLayers();
    for (const z of zonas) {
      if (!z.centro || !z.radioKm || z.id === activa) continue;
      const apagada = z.activa === false;
      L.circle([z.centro.lat, z.centro.lon], {
        radius: z.radioKm * 1000,
        color: apagada ? '#8a817c' : '#1f6f4a',
        weight: 1.5,
        dashArray: apagada ? '4 6' : undefined,
        fillOpacity: apagada ? 0.03 : 0.07,
        interactive: false,
      })
        .bindTooltip(z.nombre, {
          permanent: zonas.length <= 12,
          direction: 'center',
          className: 'etiqueta-zona',
        })
        .addTo(this.capaZonas);
    }
  }

  private pintarPunto(p: Coordenadas | null, radioKm: number | null): void {
    if (!this.L || !this.mapa || !this.capaPunto) return;
    const L = this.L;
    this.capaPunto.clearLayers();
    this.marcador = null;
    if (!p) return;
    if (radioKm && radioKm > 0) {
      const circulo = L.circle([p.lat, p.lon], {
        radius: radioKm * 1000,
        color: '#c2410c',
        weight: 2.5,
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(this.capaPunto);
      if (!this.encuadrado)
        this.mapa.fitBounds(circulo.getBounds(), { padding: [24, 24], animate: false });
    } else if (!this.encuadrado) {
      // Sin animación: si el modal se cierra durante el zoom animado, Leaflet falla (_leaflet_pos)
      this.mapa.setView([p.lat, p.lon], Math.max(this.mapa.getZoom(), 15), { animate: false });
    }
    this.encuadrado = true;
    this.marcador = L.marker([p.lat, p.lon], {
      draggable: true,
      title: 'Punto elegido (puedes arrastrarlo)',
      icon: L.divIcon({
        className: '',
        html: PIN_ELEGIDO,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      }),
    }).addTo(this.capaPunto);
    this.marcador.on('dragend', () => {
      const ll = this.marcador?.getLatLng();
      if (ll) this.elegir.emit(redondear(ll.lat, ll.lng));
    });
  }
}

/** Seis decimales (≈ 10 cm) bastan y coinciden con DECIMAL(9,6) de la base de datos. */
export function redondear(lat: number, lon: number): Coordenadas {
  return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 };
}
