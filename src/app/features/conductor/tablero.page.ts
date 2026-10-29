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
import { ActiveServiceStore } from './state/active-service.store';
import { DriverProfileStore } from './state/driver-profile.store';

export const INTERVALO_TABLERO_MS = 15_000;
export const MENSAJE_TOMADO = 'Este servicio ya fue tomado por otro conductor';

/** CU-007 Asignación de servicio. */
@Component({
  selector: 'ti-tablero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CopPipe, EstadoCargaComponent, ModalComponent, AvisoPerfilComponent],
  template: `
    <div class="contenedor">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Servicios disponibles</h1>
          @if (habilitado()) {
            <p class="mt-1 text-sm text-piedra">Se actualiza cada 15 segundos.</p>
          }
        </div>
        @if (habilitado()) {
          <button
            type="button"
            class="btn-secundario"
            [disabled]="cargando()"
            (click)="refrescar()"
          >
            {{ cargando() ? 'Actualizando…' : 'Refrescar' }}
          </button>
        }
      </div>

      @if (!habilitado()) {
        <div class="mt-6"><ti-aviso-perfil [perfil]="perfil.perfil()" /></div>
      } @else {
        @if (servicioActivo(); as id) {
          <div
            class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-monte p-4 text-white"
            role="status"
          >
            <p class="font-semibold">
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
              @for (e of envios(); track e.id) {
                <li class="rounded-xl border border-linea bg-papel p-4 sm:p-5">
                  <div class="flex flex-wrap items-start justify-between gap-4">
                    <div class="min-w-0 flex-1">
                      <p class="text-sm text-piedra">#{{ e.id }} · {{ e.tipoCarga }}</p>
                      <p class="mt-2 font-semibold">
                        <span class="text-sm font-normal text-piedra">Recoger: </span>{{ e.origen }}
                      </p>
                      <p class="font-semibold">
                        <span class="text-sm font-normal text-piedra">Entregar: </span
                        >{{ e.destino }}
                      </p>
                    </div>
                    <div class="flex flex-col items-end gap-2">
                      <p class="numeros text-2xl font-extrabold" style="font-stretch: 112%">
                        {{ e.tarifa | cop }}
                      </p>
                      <button
                        type="button"
                        class="btn-primario"
                        [disabled]="!!servicioActivo() || aceptando() !== null"
                        (click)="porAceptar.set(e)"
                      >
                        Aceptar servicio
                      </button>
                    </div>
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
          <strong>{{ e.destino }}</strong> por <strong>{{ e.tarifa | cop }}</strong
          >.
        </p>
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
  private readonly activo = inject(ActiveServiceStore);
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

  protected readonly habilitado = computed(
    () => this.perfil.idConductor() !== null && this.perfil.aprobado(),
  );
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
    const id = this.perfil.idConductor() as number;
    this.servicioActivo.set(await this.activo.actual(id));
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
    const idConductor = this.perfil.idConductor();
    if (idConductor === null || this.aceptando() !== null || this.servicioActivo()) return;
    this.aceptando.set(e.id);
    try {
      const envio = await this.servicios.aceptar(e.id, idConductor);
      await this.activo.guardar(idConductor, envio.id);
      this.log.info('Tablero', `Servicio #${envio.id} aceptado`);
      this.porAceptar.set(null);
      this.toast.exito(`Servicio #${envio.id} aceptado`);
      await this.router.navigate(['/conductor/servicio', envio.id]);
    } catch (err) {
      this.porAceptar.set(null);
      if (err instanceof ApiError && (err.status === 400 || err.status === 404)) {
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
