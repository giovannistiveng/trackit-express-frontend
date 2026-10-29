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
import { Envio, Ubicacion, esIdValido, puedeCalificar } from '../../core/domain';
import { ApiError } from '../../core/http/api-error';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { LocationTransportPort, ShipmentsPort } from '../../core/ports';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { FechaLocalPipe } from '../../shared/pipes/fecha-local.pipe';
import { EstadoBadgeComponent } from '../../shared/ui/estado-badge.component';
import { EstadoCargaComponent, FaseCarga } from '../../shared/ui/estado-carga.component';
import { Sondeo } from '../../shared/util/sondeo';
import { CalificarModalComponent } from './components/calificar-modal.component';
import { LineaTiempoComponent } from './components/linea-tiempo.component';
import { MapaEnvioComponent } from './components/mapa-envio.component';
import { PinEnvioComponent } from './components/pin-envio.component';

export const INTERVALO_TRAZABILIDAD_MS = 10_000;

/** CU-008 Trazabilidad (lado cliente) y CU-010 Calificación. */
@Component({
  selector: 'ti-envio-detalle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CopPipe,
    FechaLocalPipe,
    EstadoBadgeComponent,
    EstadoCargaComponent,
    LineaTiempoComponent,
    PinEnvioComponent,
    CalificarModalComponent,
    MapaEnvioComponent,
  ],
  template: `
    <div class="contenedor">
      <a routerLink="/cliente/envios" class="btn-texto -ml-1">← Mis envíos</a>
      <ti-estado-carga
        [fase]="fase()"
        [textoError]="error()"
        textoCargando="Cargando el envío…"
        (reintentar)="reintentar()"
      >
        @if (envio(); as e) {
          <header class="mt-2">
            <p class="text-sm text-piedra">Envío #{{ e.id }}</p>
            <h1 class="mt-1">{{ titular() }}</h1>
            <div class="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <ti-estado-badge [estado]="e.estado" />
              @if (e.fechaUltimoCambio) {
                <span class="text-piedra"
                  >Último cambio:
                  <time [attr.datetime]="e.fechaUltimoCambio.toISOString()">{{
                    e.fechaUltimoCambio | fechaLocal
                  }}</time></span
                >
              }
            </div>
          </header>

          @if (e.estado !== 'Entregado' && e.pin) {
            <section
              class="mt-6 rounded-2xl border-2 border-tinta bg-papel p-5"
              aria-labelledby="titulo-pin"
            >
              <h2 id="titulo-pin" class="text-base">PIN de entrega</h2>
              <p class="mt-1 text-sm text-piedra">
                Entrega este PIN al conductor solo al recibir tu paquete.
              </p>
              <div class="mt-3"><ti-pin-envio [pin]="e.pin" [ocultable]="true" /></div>
            </section>
          }

          <div class="mt-8 grid gap-8 md:grid-cols-[1fr_16rem]">
            <section aria-labelledby="titulo-recorrido">
              <h2 id="titulo-recorrido" class="mb-4">Recorrido</h2>
              <ti-linea-tiempo [historial]="e.historial" [estadoActual]="e.estado" />
              @if (e.estado === 'Asignado' || e.estado === 'En Ruta') {
                <div class="mt-6">
                  <ti-mapa-envio [ubicacion]="ubicacion()" />
                  @if (!ubicacion()) {
                    <p class="ayuda">El conductor todavía no comparte su ubicación.</p>
                  }
                </div>
              }
            </section>
            <aside aria-labelledby="titulo-detalle" class="space-y-4">
              <h2 id="titulo-detalle" class="sr-only">Detalle</h2>
              <dl class="space-y-3 text-sm">
                <div>
                  <dt class="text-piedra">Recoger en</dt>
                  <dd class="font-medium">{{ e.origen }}</dd>
                </div>
                <div>
                  <dt class="text-piedra">Entregar en</dt>
                  <dd class="font-medium">{{ e.destino }}</dd>
                </div>
                <div>
                  <dt class="text-piedra">Carga</dt>
                  <dd class="font-medium">{{ e.tipoCarga }}</dd>
                </div>
                <div>
                  <dt class="text-piedra">Tarifa</dt>
                  <dd class="numeros text-lg font-bold">{{ e.tarifa | cop }}</dd>
                </div>
                @if (e.conductor; as c) {
                  <div>
                    <dt class="text-piedra">Conductor</dt>
                    <dd class="font-medium">
                      {{ c.nombre }}
                      @if (c.placa) {
                        · {{ c.placa }}
                      }
                    </dd>
                  </div>
                }
              </dl>
              @if (puedeCalificarAhora()) {
                <button type="button" class="btn-acento w-full" (click)="modalAbierto.set(true)">
                  Calificar el servicio
                </button>
              } @else if (calificado()) {
                <p class="rounded-lg bg-exito-suave px-3 py-2 text-sm font-medium text-exito">
                  Ya calificaste este envío.
                </p>
              }
            </aside>
          </div>
        }
      </ti-estado-carga>
    </div>

    @if (modalAbierto() && envio(); as e) {
      <ti-calificar-modal
        [idEnvio]="e.id"
        (cerrar)="modalAbierto.set(false)"
        (calificado)="alCalificar()"
      />
    }
  `,
})
export class EnvioDetallePage implements OnInit, OnDestroy {
  /** Parámetro de ruta :id */
  readonly id = input.required<string>();

  private readonly shipments = inject(ShipmentsPort);
  private readonly ubicaciones = inject(LocationTransportPort);
  private readonly mapper = inject(ErrorMessageMapper);

  protected readonly envio = signal<Envio | null>(null);
  protected readonly ubicacion = signal<Ubicacion | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly calificado = signal(false);
  protected readonly modalAbierto = signal(false);
  private autoAbierto = false;
  private sondeo: Sondeo<Envio> | null = null;

  protected readonly fase = computed<FaseCarga>(() =>
    this.envio() ? 'listo' : this.error() ? 'error' : 'cargando',
  );
  protected readonly puedeCalificarAhora = computed(() => {
    const e = this.envio();
    return !!e && puedeCalificar(e, this.calificado());
  });
  protected readonly titular = computed(() => {
    const e = this.envio();
    if (!e) return '';
    return {
      Pendiente: 'Buscando un conductor para tu envío',
      Asignado: 'Un conductor tomó tu envío',
      'En Ruta': 'Tu envío va en camino',
      Entregado: 'Tu envío fue entregado',
    }[e.estado];
  });

  async ngOnInit(): Promise<void> {
    const id = this.id();
    if (!esIdValido(id)) {
      this.cargando.set(false);
      this.error.set('Ese número de envío no es válido.');
      return;
    }
    this.sondeo = new Sondeo(() => this.consultar(Number(id)), {
      intervaloMs: INTERVALO_TRAZABILIDAD_MS,
      detenerSi: (e) => e.estado === 'Entregado',
      alResultado: (e) => this.alResultado(e),
      alError: (e) => this.alError(e),
    });
    this.sondeo.iniciar();
  }

  ngOnDestroy(): void {
    this.sondeo?.detener();
  }

  reintentar(): void {
    this.error.set('');
    void this.sondeo?.refrescar();
    if (this.sondeo && !this.sondeo.estaActivo) this.sondeo.iniciar();
  }

  protected alCalificar(): void {
    this.calificado.set(true);
    this.modalAbierto.set(false);
  }

  private async consultar(id: number): Promise<Envio> {
    const envio = await this.shipments.obtener(id);
    if (envio.estado === 'Asignado' || envio.estado === 'En Ruta') {
      this.ubicacion.set(await this.ubicaciones.ultima(id).catch(() => this.ubicacion()));
    }
    return envio;
  }

  private alResultado(e: Envio): void {
    this.error.set('');
    if (e.calificado) this.calificado.set(true);
    this.envio.set(e);
    this.cargando.set(false);
    if (puedeCalificar(e, this.calificado()) && !this.autoAbierto) {
      this.autoAbierto = true;
      this.modalAbierto.set(true);
    }
  }

  private alError(e: unknown): void {
    this.cargando.set(false);
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
      this.sondeo?.detener();
      this.envio.set(null);
      this.error.set(
        e.status === 404 ? 'No encontramos ese envío.' : 'Este envío no pertenece a tu cuenta.',
      );
    } else if (!this.envio()) {
      this.error.set(this.mapper.traducir(e));
    }
  }
}
