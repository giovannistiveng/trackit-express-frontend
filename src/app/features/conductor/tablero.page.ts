import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Envio } from '../../core/domain';
import { ApiError } from '../../core/http/api-error';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { DriverBoardPort, DriverServicePort, LoggerPort } from '../../core/ports';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { EstadoCargaComponent, FaseCarga } from '../../shared/ui/estado-carga.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { ToastService } from '../../shared/ui/toast.service';
import { Sondeo } from '../../shared/util/sondeo';
import { AvisoPerfilComponent } from './components/aviso-perfil.component';
import { IconoComponent } from '../../shared/ui/icono.component';
import { DriverProfileStore } from './state/driver-profile.store';

export const INTERVALO_TABLERO_MS = 15_000;
export const MENSAJE_TOMADO = 'Este servicio ya fue tomado por otro conductor';

/** CU-007 Asignación de servicio. */
@Component({
  selector: 'ti-tablero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CopPipe,
    EstadoCargaComponent,
    ModalComponent,
    AvisoPerfilComponent,
    IconoComponent,
  ],
  template: `
    <div class="contenedor-ancho max-w-4xl">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Servicios disponibles</h1>
          @if (habilitado()) {
            <p class="mt-1 flex items-center gap-2 text-sm text-piedra">
              <span class="relative flex size-2.5"
                ><span
                  class="absolute inline-flex size-full animate-ping rounded-full bg-exito opacity-60"
                ></span
                ><span class="relative inline-flex size-2.5 rounded-full bg-exito"></span
              ></span>
              Se actualiza cada 15 segundos.
            </p>
          }
        </div>
        @if (habilitado()) {
          <button
            type="button"
            class="btn-secundario"
            [disabled]="cargando()"
            (click)="refrescar()"
          >
            <ti-icono nombre="refresh" class="size-4" [class]="cargando() ? 'animate-spin' : ''" />
            {{ cargando() ? 'Actualizando…' : 'Refrescar' }}
          </button>
        }
      </div>

      @if (!habilitado()) {
        <div class="mt-6"><ti-aviso-perfil [perfil]="perfil.perfil()" /></div>
      } @else {
        @if (servicioActivo(); as id) {
          <div
            class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-marca p-5 text-white shadow-[var(--shadow-marca)]"
            role="status"
          >
            <p class="flex items-center gap-3 font-semibold">
              <span class="grid size-10 place-items-center rounded-full bg-white/15"
                ><ti-icono nombre="navigation"
              /></span>
              Tienes el servicio #{{ id }} en curso. Termínalo antes de aceptar otro.
            </p>
            <a [routerLink]="['/conductor/servicio', id]" class="btn-acento">Ir al servicio</a>
          </div>
        }
        <div class="mt-6">
          <ti-estado-carga
            [fase]="fase()"
            textoVacio="No hay servicios disponibles en este momento."
            [textoError]="error()"
            (reintentar)="refrescar()"
          >
            <ul class="space-y-3">
              @for (e of envios(); track e.id; let i = $index) {
                <li
                  class="tarjeta-interactiva overflow-hidden animate-[var(--animate-aparecer)]"
                  [style.animation-delay.ms]="i * 60"
                >
                  <div class="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
                    <div class="min-w-0 flex-1">
                      <p class="flex flex-wrap items-center gap-2 text-sm text-piedra">
                        #{{ e.id }} · {{ e.tipoCarga }}
                        @if (e.categoria) {
                          <span class="insignia bg-bosque-suave text-bosque"
                            ><ti-icono nombre="bike" class="size-3.5" /> {{ e.categoria }}</span
                          >
                        }
                      </p>
                      <ol
                        class="relative mt-3 space-y-2 border-l-2 border-dashed border-linea pl-4"
                      >
                        <li class="font-semibold">
                          <span
                            class="absolute -left-[6px] mt-1.5 size-2.5 rounded-full bg-tinta"
                          ></span>
                          <span class="text-sm font-normal text-piedra">Recoger: </span
                          >{{ e.origen }}
                        </li>
                        <li class="font-semibold">
                          <span
                            class="absolute -left-[6px] mt-1.5 size-2.5 rounded-full bg-marca"
                          ></span>
                          <span class="text-sm font-normal text-piedra">Entregar: </span
                          >{{ e.destino }}
                        </li>
                      </ol>
                      @if (e.notas) {
                        <p class="mt-3 flex gap-2 text-sm text-piedra">
                          <ti-icono nombre="message" class="mt-0.5 size-4 text-marca" />
                          {{ e.notas }}
                        </p>
                      }
                    </div>
                    <div class="flex flex-col items-end gap-1">
                      @if (e.gananciaConductor !== undefined) {
                        <p class="text-xs font-semibold text-piedra">Ganas</p>
                        <p
                          class="numeros text-2xl font-extrabold text-bosque"
                          style="font-stretch: 112%"
                        >
                          {{ e.gananciaConductor | cop }}
                        </p>
                        <p class="numeros text-xs text-piedra">Tarifa {{ e.tarifa | cop }}</p>
                      } @else {
                        <p class="numeros text-2xl font-extrabold" style="font-stretch: 112%">
                          {{ e.tarifa | cop }}
                        </p>
                      }
                      @if (e.distanciaKm) {
                        <p class="mt-1 flex items-center gap-1 text-sm text-piedra">
                          <ti-icono nombre="route" class="size-4" /> {{ e.distanciaKm }} km
                        </p>
                      }
                    </div>
                  </div>
                  <div class="flex justify-end border-t border-linea bg-crema px-4 py-3 sm:px-5">
                    <button
                      type="button"
                      class="btn-primario"
                      [disabled]="!!servicioActivo() || aceptando() !== null"
                      (click)="porAceptar.set(e)"
                    >
                      Aceptar servicio
                    </button>
                  </div>
                </li>
              }
            </ul>
          </ti-estado-carga>
        </div>
      }
    </div>

    @if (porAceptar(); as e) {
      <ti-modal titulo="¿Aceptar este servicio?" (cerrar)="porAceptar.set(null)">
        <p>
          Te comprometes a recoger en <strong>{{ e.origen }}</strong> y entregar en
          <strong>{{ e.destino }}</strong
          >. Ganas <strong>{{ e.gananciaConductor ?? e.tarifa | cop }}</strong
          >.
        </p>
        @if (e.notas) {
          <p class="mt-3 rounded-xl bg-crema p-3 text-sm">
            <strong>Indicaciones:</strong> {{ e.notas }}
          </p>
        }
        <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" class="btn-secundario" (click)="porAceptar.set(null)">
            Cancelar
          </button>
          <button
            type="button"
            class="btn-primario"
            [disabled]="aceptando() !== null"
            (click)="aceptar(e)"
          >
            {{ aceptando() ? 'Aceptando…' : 'Aceptar servicio' }}
          </button>
        </div>
      </ti-modal>
    }
  `,
})
export class TableroPage implements OnInit, OnDestroy {
  protected readonly perfil = inject(DriverProfileStore);
  private readonly tablero = inject(DriverBoardPort);
  private readonly servicios = inject(DriverServicePort);
  private readonly router = inject(Router);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerPort);

  protected readonly envios = signal<Envio[]>([]);
  protected readonly cargando = signal(false);
  private readonly cargado = signal(false);
  protected readonly error = signal('');
  protected readonly porAceptar = signal<Envio | null>(null);
  protected readonly aceptando = signal<number | null>(null);
  protected readonly servicioActivo = signal<number | null>(null);
  private sondeo: Sondeo<Envio[]> | null = null;

  protected readonly habilitado = computed(() => this.perfil.aprobado());
  protected readonly fase = computed<FaseCarga>(() =>
    !this.cargado()
      ? 'cargando'
      : this.error() && this.envios().length === 0
        ? 'error'
        : this.envios().length === 0
          ? 'vacio'
          : 'listo',
  );

  async ngOnInit(): Promise<void> {
    if (!this.habilitado()) return;
    const activo = await this.servicios.activo().catch(() => null);
    this.servicioActivo.set(activo?.id ?? null);
    this.sondeo = new Sondeo(() => this.consultar(), {
      intervaloMs: INTERVALO_TABLERO_MS,
      alResultado: (lista) => {
        this.envios.set(lista);
        this.error.set('');
        this.cargado.set(true);
      },
      alError: (e) => {
        this.error.set(this.mapper.traducir(e));
        this.cargado.set(true);
      },
    });
    this.sondeo.iniciar();
  }

  ngOnDestroy(): void {
    this.sondeo?.detener();
  }

  refrescar(): Promise<void> {
    return this.sondeo?.refrescar() ?? Promise.resolve();
  }

  async aceptar(e: Envio): Promise<void> {
    if (this.aceptando() !== null || this.servicioActivo()) return;
    this.aceptando.set(e.id);
    try {
      const envio = await this.servicios.aceptar(e.id);
      this.log.info('Tablero', `Servicio #${envio.id} aceptado`);
      this.porAceptar.set(null);
      this.toast.exito(`Servicio #${envio.id} aceptado`);
      await this.router.navigate(['/conductor/servicio', envio.id]);
    } catch (err) {
      this.porAceptar.set(null);
      const tomado =
        err instanceof ApiError &&
        (err.status === 404 || /tomado|no se puede asignar/i.test(err.message));
      if (tomado) {
        this.toast.error(MENSAJE_TOMADO);
        this.envios.update((l) => l.filter((x) => x.id !== e.id));
        void this.refrescar();
      } else {
        this.toast.error(this.mapper.traducir(err));
      }
    } finally {
      this.aceptando.set(null);
    }
  }

  private async consultar(): Promise<Envio[]> {
    this.cargando.set(true);
    try {
      return await this.tablero.disponibles();
    } finally {
      this.cargando.set(false);
    }
  }
}
