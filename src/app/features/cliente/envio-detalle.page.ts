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
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Envio,
  Seguimiento,
  esActivo,
  esIdValido,
  formatoDuracion,
  haceCuanto,
  puedeCalificar,
  puedeCancelarCliente,
} from '../../core/domain';
import { ApiError } from '../../core/http/api-error';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { LoggerPort, ShipmentsPort, TrackingPort } from '../../core/ports';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { FechaLocalPipe } from '../../shared/pipes/fecha-local.pipe';
import { EstadoBadgeComponent } from '../../shared/ui/estado-badge.component';
import { EstadoCargaComponent, FaseCarga } from '../../shared/ui/estado-carga.component';
import { IconoComponent } from '../../shared/ui/icono.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PlacaComponent } from '../../shared/ui/placa.component';
import { ToastService } from '../../shared/ui/toast.service';
import { Sondeo } from '../../shared/util/sondeo';
import { CalificarModalComponent } from './components/calificar-modal.component';
import { LineaTiempoComponent } from './components/linea-tiempo.component';
import { MapaEnvioComponent } from '../../shared/ui/mapa-envio.component';
import { PinEnvioComponent } from './components/pin-envio.component';

export const INTERVALO_TRAZABILIDAD_MS = 10_000;

const TITULARES: Record<Envio['estado'], string> = {
  Pendiente: 'Buscando un conductor para tu envío',
  Asignado: 'Un conductor tomó tu envío',
  'En Ruta': 'Tu envío va en camino',
  Entregado: 'Tu envío fue entregado',
  Cancelado: 'Este envío fue cancelado',
};

/** CU-008 Seguimiento (lado cliente), cancelación y CU-010 Calificación. */
@Component({
  selector: 'ti-envio-detalle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FormsModule,
    CopPipe,
    FechaLocalPipe,
    EstadoBadgeComponent,
    EstadoCargaComponent,
    LineaTiempoComponent,
    PinEnvioComponent,
    CalificarModalComponent,
    MapaEnvioComponent,
    IconoComponent,
    ModalComponent,
    PlacaComponent,
  ],
  template: `
    <div class="contenedor-ancho max-w-5xl">
      <a routerLink="/cliente/envios" class="btn-texto -ml-1"
        ><ti-icono nombre="arrow-left" class="size-4" /> Mis envíos</a
      >
      <ti-estado-carga
        [fase]="fase()"
        [textoError]="error()"
        textoCargando="Cargando el envío…"
        (reintentar)="reintentar()"
      >
        @if (envio(); as e) {
          <header class="mt-2 animate-[var(--animate-aparecer)]">
            <p class="text-sm font-semibold text-piedra">Envío #{{ e.id }} · {{ e.tipoCarga }}</p>
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

          <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
            <div class="min-w-0 space-y-6">
              @if (mostrarMapa()) {
                <section aria-labelledby="titulo-mapa" class="tarjeta overflow-hidden p-0">
                  <h2 id="titulo-mapa" class="sr-only">Seguimiento en el mapa</h2>
                  <div
                    class="grid grid-cols-3 divide-x divide-linea border-b border-linea bg-crema text-center"
                  >
                    <div class="px-2 py-3">
                      <p class="text-xs font-semibold text-piedra">
                        {{
                          e.estado === 'Asignado'
                            ? 'Llega a recoger y entregar'
                            : 'Llegada estimada'
                        }}
                      </p>
                      <p class="numeros mt-0.5 text-xl font-extrabold">{{ eta() ?? '—' }}</p>
                    </div>
                    <div class="px-2 py-3">
                      <p class="text-xs font-semibold text-piedra">Distancia</p>
                      <p class="numeros mt-0.5 text-xl font-extrabold">{{ distancia() ?? '—' }}</p>
                    </div>
                    <div class="px-2 py-3">
                      <p class="text-xs font-semibold text-piedra">Señal</p>
                      @if (seguimiento()?.enVivo) {
                        <p class="mt-1 inline-flex items-center gap-1.5 font-bold text-exito">
                          <span
                            class="size-2.5 rounded-full bg-exito"
                            style="animation: var(--animate-pulso)"
                          ></span>
                          En vivo
                        </p>
                      } @else {
                        <p class="mt-1 text-sm font-semibold text-piedra">{{ ultimaSenal() }}</p>
                      }
                    </div>
                  </div>
                  <ti-mapa-envio
                    [seguimiento]="seguimiento()"
                    class="[&>div]:rounded-none [&>div]:border-0"
                  />
                </section>
              }

              @if (esActivo(e.estado) && e.pin) {
                <section
                  class="tarjeta flex flex-col gap-4 border-2 border-tinta p-5 sm:flex-row sm:items-center sm:justify-between"
                  aria-labelledby="titulo-pin"
                >
                  <div>
                    <h2 id="titulo-pin" class="flex items-center gap-2 text-base">
                      <ti-icono nombre="lock" class="text-marca" /> PIN de entrega
                    </h2>
                    <p class="mt-1 text-sm text-piedra">
                      Dáselo al conductor solo cuando tengas el paquete en tus manos.
                    </p>
                  </div>
                  <ti-pin-envio [pin]="e.pin" [ocultable]="true" />
                </section>
              }

              @if (e.estado === 'Cancelado') {
                <section class="flex gap-4 rounded-2xl border border-linea bg-papel p-5">
                  <ti-icono nombre="ban" class="size-6 text-piedra" />
                  <div>
                    <p class="font-semibold">Envío cancelado</p>
                    <p class="text-sm text-piedra">
                      {{ e.motivoCancelacion || 'Sin motivo registrado.' }}
                    </p>
                    <a routerLink="/cliente/nuevo-envio" class="btn-texto mt-2 text-sm"
                      >Pedir un envío nuevo <ti-icono nombre="arrow-right" class="size-4"
                    /></a>
                  </div>
                </section>
              }

              <section class="tarjeta p-5 sm:p-6" aria-labelledby="titulo-recorrido">
                <h2 id="titulo-recorrido" class="mb-5">Recorrido</h2>
                <ti-linea-tiempo [historial]="e.historial" [estadoActual]="e.estado" />
              </section>
            </div>

            <aside aria-labelledby="titulo-detalle" class="space-y-4">
              <section class="tarjeta p-5">
                <h2 id="titulo-detalle" class="text-base">Detalle del envío</h2>
                <ol
                  class="relative mt-4 space-y-4 border-l-2 border-dashed border-linea pl-5 text-sm"
                >
                  <li>
                    <span class="absolute -left-[7px] mt-1 size-3 rounded-full bg-tinta"></span>
                    <p class="text-piedra">Recoger en</p>
                    <p class="font-semibold">{{ e.origen }}</p>
                  </li>
                  <li>
                    <span class="absolute -left-[7px] mt-1 size-3 rounded-full bg-marca"></span>
                    <p class="text-piedra">Entregar en</p>
                    <p class="font-semibold">{{ e.destino }}</p>
                  </li>
                </ol>
                <dl class="mt-5 grid grid-cols-2 gap-3 border-t border-linea pt-4 text-sm">
                  <div>
                    <dt class="text-piedra">Tarifa</dt>
                    <dd class="numeros text-lg font-extrabold">{{ e.tarifa | cop }}</dd>
                  </div>
                  @if (e.distanciaKm) {
                    <div>
                      <dt class="text-piedra">Distancia</dt>
                      <dd class="numeros text-lg font-extrabold">{{ e.distanciaKm }} km</dd>
                    </div>
                  }
                  @if (e.categoria) {
                    <div class="col-span-2">
                      <dt class="text-piedra">Vehículo</dt>
                      <dd class="font-semibold">{{ e.categoria }}</dd>
                    </div>
                  }
                </dl>
                @if (e.notas) {
                  <p class="mt-4 flex gap-2 rounded-xl bg-crema p-3 text-sm">
                    <ti-icono nombre="message" class="mt-0.5 size-4 text-marca" />
                    <span><span class="font-semibold">Indicaciones:</span> {{ e.notas }}</span>
                  </p>
                }
              </section>

              @if (e.conductor; as c) {
                <section class="tarjeta p-5">
                  <h2 class="text-base">Tu conductor</h2>
                  <div class="mt-4 flex items-center gap-3">
                    <span
                      class="grid size-12 place-items-center rounded-full bg-marca-suave font-bold text-marca"
                      >{{ c.nombre.charAt(0) }}</span
                    >
                    <div class="min-w-0">
                      <p class="truncate font-semibold">{{ c.nombre }}</p>
                      <p class="text-sm text-piedra">
                        {{ c.vehiculo ?? 'Vehículo' }}
                        @if (c.calificacionPromedio) {
                          ·
                          <span class="font-semibold text-tinta"
                            >★ {{ c.calificacionPromedio }}</span
                          >
                        }
                      </p>
                    </div>
                  </div>
                  @if (c.placa) {
                    <div class="mt-4">
                      <ti-placa
                        [valor]="c.placa"
                        etiqueta="Placa del vehículo"
                        pie="COLOMBIA"
                        tamano="pequeno"
                      />
                    </div>
                  }
                </section>
              }

              @if (puedeCalificarAhora()) {
                <button type="button" class="btn-acento w-full" (click)="modalAbierto.set(true)">
                  <ti-icono nombre="star" /> Calificar el servicio
                </button>
              } @else if (calificado()) {
                <p
                  class="flex items-center gap-2 rounded-xl bg-exito-suave px-4 py-3 text-sm font-medium text-exito"
                >
                  <ti-icono nombre="circle-check" class="size-4" /> Ya calificaste este envío.
                </p>
              }
              @if (puedeCancelar()) {
                <button
                  type="button"
                  class="btn w-full border border-alerta/40 text-alerta hover:bg-alerta-suave"
                  (click)="cancelacion.set(true)"
                >
                  <ti-icono nombre="ban" /> Cancelar envío
                </button>
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

    @if (cancelacion() && envio(); as e) {
      <ti-modal titulo="¿Cancelar este envío?" (cerrar)="cancelacion.set(false)">
        <p class="text-piedra">
          Ningún conductor lo ha tomado todavía, así que puedes cancelarlo sin costo.
        </p>
        <label for="motivo" class="etiqueta mt-5"
          >Motivo <span class="font-normal text-piedra">(opcional)</span></label
        >
        <textarea
          id="motivo"
          rows="2"
          maxlength="255"
          class="campo"
          [ngModel]="motivo()"
          (ngModelChange)="motivo.set($event)"
          placeholder="Ya no lo necesito…"
        ></textarea>
        @if (errorCancelar()) {
          <p class="error-campo" role="alert">{{ errorCancelar() }}</p>
        }
        <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" class="btn-secundario" (click)="cancelacion.set(false)">
            Volver
          </button>
          <button type="button" class="btn-peligro" [disabled]="cancelando()" (click)="cancelar(e)">
            {{ cancelando() ? 'Cancelando…' : 'Sí, cancelar envío' }}
          </button>
        </div>
      </ti-modal>
    }
  `,
})
export class EnvioDetallePage implements OnInit, OnDestroy {
  /** Parámetro de ruta :id */
  readonly id = input.required<string>();

  private readonly shipments = inject(ShipmentsPort);
  private readonly tracking = inject(TrackingPort);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerPort);

  protected readonly envio = signal<Envio | null>(null);
  protected readonly seguimiento = signal<Seguimiento | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly calificado = signal(false);
  protected readonly modalAbierto = signal(false);
  protected readonly cancelacion = signal(false);
  protected readonly cancelando = signal(false);
  protected readonly motivo = signal('');
  protected readonly errorCancelar = signal('');
  private autoAbierto = false;
  private sondeo: Sondeo<Envio> | null = null;
  protected readonly esActivo = esActivo;

  protected readonly fase = computed<FaseCarga>(() =>
    this.envio() ? 'listo' : this.error() ? 'error' : 'cargando',
  );
  protected readonly puedeCalificarAhora = computed(() => {
    const e = this.envio();
    return !!e && puedeCalificar(e, this.calificado());
  });
  protected readonly puedeCancelar = computed(() => {
    const e = this.envio();
    return !!e && puedeCancelarCliente(e);
  });
  protected readonly mostrarMapa = computed(() => {
    const e = this.envio()?.estado;
    return e === 'Asignado' || e === 'En Ruta';
  });
  protected readonly titular = computed(() => {
    const e = this.envio();
    return e ? TITULARES[e.estado] : '';
  });
  protected readonly eta = computed(() => {
    const m = this.seguimiento()?.etaMinutos;
    return m ? formatoDuracion(m) : null;
  });
  protected readonly distancia = computed(() => {
    const d = this.seguimiento()?.distanciaRestanteKm;
    return d !== null && d !== undefined ? `${d.toLocaleString('es-CO')} km` : null;
  });
  protected readonly ultimaSenal = computed(() => {
    const u = this.seguimiento()?.ultima;
    return u ? haceCuanto(new Date(u.capturadoEn)) : 'Sin señal aún';
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
      detenerSi: (e) => !esActivo(e.estado),
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

  protected async cancelar(e: Envio): Promise<void> {
    if (this.cancelando()) return;
    this.cancelando.set(true);
    this.errorCancelar.set('');
    try {
      await this.shipments.cancelar(e.id, this.motivo());
      this.log.info('Envios', `Envío cancelado #${e.id}`);
      this.toast.mostrar('Cancelaste el envío.');
      this.cancelacion.set(false);
      this.sondeo?.detener();
      this.alResultado(await this.shipments.obtener(e.id));
    } catch (err) {
      this.errorCancelar.set(this.mapper.traducir(err));
    } finally {
      this.cancelando.set(false);
    }
  }

  private async consultar(id: number): Promise<Envio> {
    const envio = await this.shipments.obtener(id);
    if (envio.estado === 'Asignado' || envio.estado === 'En Ruta') {
      try {
        this.seguimiento.set(await this.tracking.seguimiento(id));
      } catch (e) {
        this.log.debug('Seguimiento', 'No se pudo actualizar el mapa', e);
      }
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
