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
import { DemoModeService } from '../../core/config/demo-mode.service';
import {
  Envio,
  esIdValido,
  puedeCompartirUbicacion,
  puedeEntregar,
  puedeIniciarRuta,
} from '../../core/domain';
import { ApiError } from '../../core/http/api-error';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { DriverServicePort, LoggerPort, RouteStartPort } from '../../core/ports';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { EstadoBadgeComponent } from '../../shared/ui/estado-badge.component';
import { EstadoCargaComponent, FaseCarga } from '../../shared/ui/estado-carga.component';
import { ToastService } from '../../shared/ui/toast.service';
import { EntregaModalComponent } from './components/entrega-modal.component';
import { ActiveServiceStore } from './state/active-service.store';
import { CompartirUbicacionService } from './state/compartir-ubicacion.service';
import { DriverProfileStore } from './state/driver-profile.store';

/** Servicio en curso del conductor: iniciar ruta, compartir ubicación y finalizar entrega. Nunca muestra el PIN. */
@Component({
  selector: 'ti-servicio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CopPipe, EstadoBadgeComponent, EstadoCargaComponent, EntregaModalComponent],
  template: `
    <div class="contenedor">
      <a routerLink="/conductor/tablero" class="btn-texto -ml-1">← Servicios</a>
      <ti-estado-carga
        [fase]="fase()"
        [textoError]="error()"
        textoCargando="Cargando el servicio…"
        (reintentar)="cargar()"
      >
        @if (envio(); as e) {
          <header class="mt-2">
            <p class="text-sm text-piedra">Servicio #{{ e.id }} · {{ e.tipoCarga }}</p>
            <h1 class="mt-1">
              {{ e.estado === 'Entregado' ? 'Entrega completada' : 'Servicio en curso' }}
            </h1>
            <div class="mt-3"><ti-estado-badge [estado]="e.estado" /></div>
          </header>

          <ol class="mt-8 space-y-4">
            <li class="rounded-xl border border-linea bg-papel p-4">
              <p class="text-sm text-piedra">1. Recoge en</p>
              <p class="text-lg font-semibold">{{ e.origen }}</p>
            </li>
            <li class="rounded-xl border border-linea bg-papel p-4">
              <p class="text-sm text-piedra">2. Entrega en</p>
              <p class="text-lg font-semibold">{{ e.destino }}</p>
            </li>
          </ol>
          <p class="numeros mt-4 text-right text-sm">
            Tarifa del servicio: <strong class="text-lg">{{ e.tarifa | cop }}</strong>
          </p>

          @if (e.estado !== 'Entregado') {
            <section class="mt-8 space-y-4" aria-label="Acciones del servicio">
              @if (puedeIniciar()) {
                <button
                  type="button"
                  class="btn-secundario w-full"
                  [disabled]="iniciando()"
                  (click)="iniciarRuta()"
                >
                  {{ iniciando() ? 'Iniciando…' : 'Iniciar ruta' }}
                </button>
              }
              <div
                class="flex items-center justify-between gap-4 rounded-xl border border-linea bg-papel p-4"
              >
                <div>
                  <p id="ubicacion-titulo" class="font-semibold">Compartir mi ubicación</p>
                  <p class="text-sm text-piedra">{{ textoUbicacion() }}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-labelledby="ubicacion-titulo"
                  [attr.aria-checked]="ubicacion.estado() === 'activo'"
                  [disabled]="!puedeCompartir()"
                  class="relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-40"
                  [class]="ubicacion.estado() === 'activo' ? 'bg-monte' : 'bg-linea'"
                  (click)="alternarUbicacion()"
                >
                  <span
                    class="absolute top-1 size-6 rounded-full bg-papel shadow transition-[left]"
                    [style.left]="ubicacion.estado() === 'activo' ? '1.75rem' : '0.25rem'"
                  ></span>
                </button>
              </div>
              @if (puedeFinalizar()) {
                <button type="button" class="btn-acento w-full text-lg" (click)="modal.set(true)">
                  Finalizar entrega
                </button>
              } @else if (flags.iniciarRutaEndpoint) {
                <p class="text-sm text-piedra">Inicia la ruta para poder finalizar la entrega.</p>
              }
            </section>
          } @else {
            <div class="mt-8 rounded-xl bg-exito-suave p-5">
              <p class="font-semibold text-exito">El cliente recibió su paquete.</p>
              <a routerLink="/conductor/tablero" class="btn-primario mt-4">Buscar otro servicio</a>
            </div>
          }
        }
      </ti-estado-carga>
    </div>

    @if (modal() && envio(); as e) {
      <ti-entrega-modal
        [idEnvio]="e.id"
        (cerrar)="modal.set(false)"
        (entregado)="alEntregar()"
        (yaEntregado)="alEntregar()"
      />
    }
  `,
})
export class ServicioPage implements OnInit, OnDestroy {
  readonly id = input.required<string>();

  private readonly servicios = inject(DriverServicePort);
  private readonly rutas = inject(RouteStartPort);
  private readonly activo = inject(ActiveServiceStore);
  private readonly perfil = inject(DriverProfileStore);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerPort);
  protected readonly ubicacion = inject(CompartirUbicacionService);
  protected readonly flags = inject(DemoModeService).flags;

  protected readonly envio = signal<Envio | null>(null);
  protected readonly error = signal('');
  protected readonly modal = signal(false);
  protected readonly iniciando = signal(false);

  protected readonly fase = computed<FaseCarga>(() =>
    this.envio() ? 'listo' : this.error() ? 'error' : 'cargando',
  );
  protected readonly puedeIniciar = computed(
    () => !!this.envio() && puedeIniciarRuta(this.envio() as Envio, this.flags.iniciarRutaEndpoint),
  );
  protected readonly puedeFinalizar = computed(
    () => !!this.envio() && puedeEntregar(this.envio() as Envio, this.flags.iniciarRutaEndpoint),
  );
  protected readonly puedeCompartir = computed(
    () =>
      !!this.envio() &&
      puedeCompartirUbicacion(this.envio() as Envio, this.flags.iniciarRutaEndpoint),
  );
  protected readonly textoUbicacion = computed(() => {
    switch (this.ubicacion.estado()) {
      case 'activo':
        return 'El cliente puede ver por dónde vas.';
      case 'denegado':
        return 'Bloqueaste el permiso de ubicación. Actívalo en el navegador para compartir.';
      case 'no-disponible':
        return 'Tu dispositivo no puede obtener la ubicación ahora.';
      default:
        return this.puedeCompartir() ? 'Apagado.' : 'Disponible cuando el servicio esté en ruta.';
    }
  });

  ngOnInit(): void {
    void this.cargar();
  }

  ngOnDestroy(): void {
    this.ubicacion.detener();
  }

  async cargar(): Promise<void> {
    const id = this.id();
    if (!esIdValido(id)) {
      this.error.set('Ese número de servicio no es válido.');
      return;
    }
    this.error.set('');
    try {
      const e = await this.servicios.obtener(Number(id));
      const idConductor = this.perfil.idConductor();
      if (e.idConductor !== idConductor) {
        this.error.set('Este servicio no está asignado a ti.');
        return;
      }
      this.envio.set(e);
    } catch (e) {
      this.error.set(
        e instanceof ApiError && e.status === 404
          ? 'No encontramos ese servicio.'
          : this.mapper.traducir(e),
      );
    }
  }

  async iniciarRuta(): Promise<void> {
    const e = this.envio();
    if (!e || this.iniciando()) return;
    this.iniciando.set(true);
    try {
      this.envio.set(await this.rutas.iniciar(e.id));
      this.log.info('Servicio', `Ruta iniciada #${e.id}`);
    } catch (err) {
      this.toast.error(this.mapper.traducir(err));
    } finally {
      this.iniciando.set(false);
    }
  }

  protected alternarUbicacion(): void {
    const e = this.envio();
    if (!e) return;
    if (this.ubicacion.estado() === 'activo') this.ubicacion.detener();
    else this.ubicacion.iniciar(e.id);
  }

  async alEntregar(): Promise<void> {
    this.modal.set(false);
    this.ubicacion.detener();
    const id = this.perfil.idConductor();
    if (id !== null) await this.activo.limpiar(id);
    await this.cargar();
  }
}
