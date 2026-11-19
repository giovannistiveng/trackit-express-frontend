import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  SERVICIOS,
  SeguimientoPublico,
  TEXTO_ETAPA,
  esActivo,
  formatoDuracion,
} from '../../core/domain';
import { ApiError } from '../../core/http/api-error';
import { PublicSitePort } from '../../core/ports';
import { FechaLocalPipe } from '../../shared/pipes/fecha-local.pipe';
import { IconoComponent } from '../../shared/ui/icono.component';
import { LogoComponent } from '../../shared/ui/logo.component';
import { EtapasServicioComponent } from '../../shared/ui/etapas-servicio.component';
import { MapaEnvioComponent } from '../../shared/ui/mapa-envio.component';
import { LineaTiempoComponent } from '../cliente/components/linea-tiempo.component';

export const INTERVALO_SEGUIMIENTO_PUBLICO_MS = 15_000;

/** Enlace público para quien recibe: estado, mapa y recorrido, sin cuenta ni datos privados. */
@Component({
  selector: 'ti-seguimiento-publico',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FechaLocalPipe,
    EtapasServicioComponent,
    IconoComponent,
    LogoComponent,
    MapaEnvioComponent,
    LineaTiempoComponent,
  ],
  template: `
    <div class="min-h-dvh bg-crema">
      <header class="border-b border-linea bg-papel">
        <div class="contenedor flex h-16 items-center justify-between">
          <a routerLink="/" aria-label="TrackIt Express, inicio"><ti-logo /></a>
          <span class="text-sm font-semibold text-piedra">Seguimiento de envío</span>
        </div>
      </header>
      <main id="contenido" class="contenedor max-w-3xl py-8">
        @if (error()) {
          <div class="tarjeta p-6 text-center" role="alert">
            <ti-icono nombre="search" class="mx-auto size-10 text-piedra" />
            <h1 class="mt-3 text-xl">{{ error() }}</h1>
            <p class="mt-2 text-piedra">
              Pide a quien te envió el paquete que te comparta el enlace de nuevo.
            </p>
          </div>
        } @else if (datos(); as d) {
          <p class="flex flex-wrap gap-x-3 text-sm font-semibold text-piedra">
            <span>{{ servicios[d.tipoServicio].nombre }} #{{ d.codigo }}</span>
            @if (d.destinatario) {
              <span>Para {{ d.destinatario }}</span>
            }
          </p>
          <h1 class="mt-1">{{ textos[d.etapa].titulo }}</h1>
          <p class="mt-1 text-piedra">{{ textos[d.etapa].cliente }}</p>
          <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
            @if (d.fechaProgramada && d.estado === 'Pendiente') {
              <span class="insignia bg-aviso-suave"
                ><ti-icono nombre="calendar-clock" class="size-4" /> Programado:
                {{ d.fechaProgramada | fechaLocal }}</span
              >
            }
            @if (d.idaYVuelta) {
              <span class="insignia bg-marca-suave text-marca"
                ><ti-icono nombre="repeat" class="size-4" /> Ida y vuelta</span
              >
            }
          </div>

          @if (d.mapa && (d.estado === 'Asignado' || d.estado === 'En Ruta')) {
            <section class="tarjeta mt-6 overflow-hidden p-0" aria-label="Ubicación del conductor">
              <div class="grid grid-cols-2 divide-x divide-linea border-b border-linea text-center">
                <div class="px-2 py-3">
                  <p class="text-xs font-semibold text-piedra">Llegada estimada</p>
                  <p class="numeros text-xl font-extrabold">{{ eta() ?? '—' }}</p>
                </div>
                <div class="px-2 py-3">
                  <p class="text-xs font-semibold text-piedra">Distancia</p>
                  <p class="numeros text-xl font-extrabold">{{ distancia() ?? '—' }}</p>
                </div>
              </div>
              <ti-mapa-envio
                [seguimiento]="d.mapa"
                [conRuta]="true"
                class="[&>div]:rounded-none [&>div]:border-0"
              />
            </section>
          }

          <div class="mt-6 grid gap-6 sm:grid-cols-2">
            <section class="tarjeta p-5">
              <h2 class="text-base">Ruta</h2>
              <ol
                class="relative mt-4 space-y-4 border-l-2 border-dashed border-linea pl-5 text-sm"
              >
                <li>
                  <span class="absolute -left-[7px] mt-1 size-3 rounded-full bg-tinta"></span>
                  <p class="text-piedra">Sale de</p>
                  <p class="font-semibold">{{ d.origen }}</p>
                </li>
                @for (p of d.paradas; track p.orden) {
                  <li>
                    <span
                      class="absolute -left-[7px] mt-1 size-3 rounded-full"
                      [class]="p.completada ? 'bg-exito' : 'bg-linea'"
                    ></span>
                    <p class="text-piedra">
                      Parada {{ p.orden }}{{ p.completada ? ', hecha' : '' }}
                    </p>
                    <p class="font-semibold">{{ p.direccion }}</p>
                  </li>
                }
                <li>
                  <span class="absolute -left-[7px] mt-1 size-3 rounded-full bg-marca"></span>
                  <p class="text-piedra">Llega a</p>
                  <p class="font-semibold">{{ d.destino }}</p>
                </li>
              </ol>
              @if (d.conductor; as c) {
                <div
                  class="mt-5 flex items-center justify-between gap-3 border-t border-linea pt-4"
                >
                  <p class="text-sm">
                    <span class="block text-piedra">Conductor</span>
                    <strong>{{ c.nombre }}</strong>
                    @if (c.vehiculo) {
                      <span class="block text-piedra">{{ c.vehiculo }}</span>
                    }
                  </p>
                  @if (c.placa) {
                    <span class="placa-co shrink-0 text-sm">{{ c.placa }}</span>
                  }
                </div>
              }
            </section>
            <section class="tarjeta p-5">
              <h2 class="mb-4 text-base">Avance</h2>
              <ti-etapas-servicio [etapa]="d.etapa" [idaYVuelta]="d.idaYVuelta" />
              @if (d.historial.length > 0) {
                <details class="mt-4 border-t border-linea pt-3">
                  <summary class="cursor-pointer text-sm font-semibold text-marca">
                    Ver horas de cada cambio
                  </summary>
                  <div class="mt-3">
                    <ti-linea-tiempo [historial]="d.historial" [estadoActual]="d.estado" />
                  </div>
                </details>
              }
            </section>
          </div>
          @if (activo()) {
            <p class="mt-6 flex items-center gap-2 rounded-xl bg-papel p-4 text-sm text-piedra">
              <ti-icono nombre="lock" class="size-4" />
              Cuando el conductor llegue te pedirá el PIN de entrega. Si no lo tienes, pídeselo a
              quien hizo el pedido.
            </p>
          }
          <p class="mt-6 text-center text-xs text-piedra">Esta página se actualiza sola.</p>
        } @else {
          <p class="flex items-center gap-2 text-piedra" role="status">
            <ti-icono nombre="loader" class="animate-spin" /> Cargando el envío…
          </p>
        }
      </main>
    </div>
  `,
})
export class SeguimientoPublicoPage implements OnInit, OnDestroy {
  readonly token = input.required<string>();
  private readonly sitio = inject(PublicSitePort);
  protected readonly datos = signal<SeguimientoPublico | null>(null);
  protected readonly error = signal('');
  protected readonly textos = TEXTO_ETAPA;
  protected readonly servicios = SERVICIOS;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private destruido = false;

  protected readonly activo = computed(() => {
    const d = this.datos();
    return !!d && esActivo(d.estado);
  });
  protected readonly eta = computed(() => {
    const m = this.datos()?.mapa?.etaMinutos;
    return m ? formatoDuracion(m) : null;
  });
  protected readonly distancia = computed(() => {
    const d = this.datos()?.mapa?.distanciaRestanteKm;
    return d !== null && d !== undefined ? `${d.toLocaleString('es-CO')} km` : null;
  });

  ngOnInit(): void {
    void this.cargar();
  }

  ngOnDestroy(): void {
    this.destruido = true;
    if (this.temporizador) clearTimeout(this.temporizador);
  }

  private async cargar(): Promise<void> {
    try {
      this.datos.set(await this.sitio.seguimiento(this.token()));
      this.error.set('');
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 400)) {
        this.error.set('No encontramos ese envío');
        return;
      }
      if (!this.datos()) this.error.set('No pudimos cargar el envío. Revisa tu conexión.');
    }
    if (!this.destruido && this.activo()) {
      this.temporizador = setTimeout(() => void this.cargar(), INTERVALO_SEGUIMIENTO_PUBLICO_MS);
    }
  }
}
