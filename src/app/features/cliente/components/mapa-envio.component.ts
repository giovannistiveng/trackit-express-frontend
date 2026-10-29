import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  viewChild,
} from '@angular/core';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { Ubicacion } from '../../../core/domain';

/** Mapa Leaflet con teselas de OpenStreetMap y el marcador del conductor. Se carga de forma perezosa. */
@Component({
  selector: 'ti-mapa-envio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    #mapa
    class="h-64 w-full overflow-hidden rounded-xl border border-linea"
    role="img"
    aria-label="Mapa con la ubicación del conductor"
  ></div>`,
})
export class MapaEnvioComponent implements AfterViewInit, OnDestroy {
  readonly ubicacion = input<Ubicacion | null>(null);
  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('mapa');
  private mapa: LeafletMap | null = null;
  private marcador: Marker | null = null;
  private L: typeof import('leaflet') | null = null;

  constructor() {
    effect(() => this.pintar(this.ubicacion()));
  }

  async ngAfterViewInit(): Promise<void> {
    this.L = await import('leaflet');
    const centro = this.ubicacion() ?? { lat: 4.3369, lon: -74.3638 }; // Fusagasugá
    this.mapa = this.L.map(this.contenedor().nativeElement).setView([centro.lat, centro.lon], 14);
    this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.mapa);
    this.pintar(this.ubicacion());
  }

  ngOnDestroy(): void {
    this.mapa?.remove();
  }

  private pintar(u: Ubicacion | null): void {
    if (!this.L || !this.mapa || !u) return;
    const icono = this.L.divIcon({
      className: '',
      html: '<span style="display:block;width:22px;height:22px;border-radius:9999px;background:#f5c518;border:3px solid #17211c"></span>',
      iconSize: [22, 22],
    });
    if (this.marcador) this.marcador.setLatLng([u.lat, u.lon]);
    else
      this.marcador = this.L.marker([u.lat, u.lon], { icon: icono, title: 'Conductor' }).addTo(
        this.mapa,
      );
    this.mapa.panTo([u.lat, u.lon]);
  }
}
