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
  Envio,
  esIdValido,
  puedeCompartirUbicacion,
  puedeEntregar,
  puedeIniciarRuta,
} from '../../core/domain';
import { ApiError } from '../../core/http/api-error';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { DriverServicePort, LoggerPort, TrackingPort } from '../../core/ports';
import { Coordenadas, Seguimiento } from '../../core/domain';
import { IconoComponent, NombreIcono } from '../../shared/ui/icono.component';
import { MapaEnvioComponent } from '../../shared/ui/mapa-envio.component';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { EstadoBadgeComponent } from '../../shared/ui/estado-badge.component';
import { EstadoCargaComponent, FaseCarga } from '../../shared/ui/estado-carga.component';
import { ToastService } from '../../shared/ui/toast.service';
import { EntregaModalComponent } from './components/entrega-modal.component';
import { CompartirUbicacionService } from './state/compartir-ubicacion.service';
import { DriverProfileStore } from './state/driver-profile.store';

/** Servicio en curso del conductor: iniciar ruta, compartir ubicación y finalizar entrega. Nunca muestra el PIN. */
@Component({
  selector: 'ti-servicio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CopPipe,
    EstadoBadgeComponent,
    EstadoCargaComponent,
    EntregaModalComponent,
    IconoComponent,
    MapaEnvioComponent,
  ],
  template: `
    <div class="contenedor-ancho max-w-5xl">
      <a routerLink="/conductor/tablero" class="btn-texto -ml-1"
        ><ti-icono nombre="arrow-left" class="size-4" /> Servicios</a
      >
      <ti-estado-carga
        [fase]="fase()"
        [textoError]="error()"
        textoCargando="Cargando el servicio…"
        (reintentar)="cargar()"
      >
        @if (envio(); as e) {
          <header
            class="mt-2 flex flex-wrap items-end justify-between gap-4 animate-[var(--animate-aparecer)]"
          >
            <div>
              <p class="text-sm font-semibold text-piedra">
                Servicio #{{ e.id }} · {{ e.tipoCarga }}
              </p>
              <h1 class="mt-1">
                {{ e.estado === 'Entregado' ? 'Entrega completada' : 'Servicio en curso' }}
              </h1>
              <div class="mt-3"><ti-estado-badge [estado]="e.estado" /></div>
            </div>
            @if (e.gananciaConductor !== undefined) {
              <div class="rounded-2xl bg-bosque-suave px-5 py-3 text-right">
                <p class="text-xs font-semibold text-bosque">
                  {{ e.estado === 'Entregado' ? 'Ganaste' : 'Ganas' }}
                </p>
                <p class="numeros text-2xl font-extrabold text-bosque">
                  {{ e.gananciaConductor | cop }}
                </p>
              </div>
            }
          </header>

          <!-- Pasos del servicio -->
          <ol class="mt-6 grid grid-cols-3 gap-2" aria-label="Pasos del servicio">
            @for (p of pasos(); track p.texto) {
              <li
                class="flex flex-col items-center gap-2 text-center text-xs font-semibold sm:text-sm"
                [attr.aria-current]="p.actual ? 'step' : null"
              >
                <span
                  class="grid size-10 place-items-center rounded-full border-2 transition-colors"
                  [class]="
                    p.hecho
                      ? 'border-marca bg-marca text-white'
                      : p.actual
                        ? 'border-marca bg-marca-suave text-marca'
                        : 'border-linea bg-papel text-piedra'
                  "
                >
                  <ti-icono [nombre]="p.hecho ? 'check' : p.icono" class="size-5" />
                </span>
                <span [class.text-piedra]="!p.hecho && !p.actual">{{ p.texto }}</span>
              </li>
            }
          </ol>

          <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
            <div class="min-w-0 space-y-4">
              @if (e.estado !== 'Entregado' && e.estado !== 'Cancelado') {
                <ti-mapa-envio
                  [seguimiento]="seguimiento()"
                  [posicionPropia]="ubicacion.ultimaPosicion()"
                />
              }
              <ol class="space-y-3">
                <li class="tarjeta flex items-start gap-4 p-4">
                  <span
                    class="grid size-10 shrink-0 place-items-center rounded-full bg-tinta text-white"
                    ><ti-icono nombre="package"
                  /></span>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm text-piedra">1. Recoge en</p>
                    <p class="text-lg font-semibold">{{ e.origen }}</p>
                  </div>
                  @if (e.estado === 'Asignado') {
                    <a
                      class="btn-secundario shrink-0 !px-3"
                      [href]="comoLlegar(e.origen, e.origenCoords)"
                      target="_blank"
                      rel="noopener"
                      aria-label="Cómo llegar al punto de recogida"
                    >
                      <ti-icono nombre="navigation" class="text-marca" />
                    </a>
                  }
                </li>
                <li class="tarjeta flex items-start gap-4 p-4">
                  <span
                    class="grid size-10 shrink-0 place-items-center rounded-full bg-marca text-white"
                    ><ti-icono nombre="map-pin"
                  /></span>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm text-piedra">2. Entrega en</p>
                    <p class="text-lg font-semibold">{{ e.destino }}</p>
                  </div>
                  @if (e.estado === 'En Ruta') {
                    <a
                      class="btn-secundario shrink-0 !px-3"
                      [href]="comoLlegar(e.destino, e.destinoCoords)"
                      target="_blank"
                      rel="noopener"
                      aria-label="Cómo llegar al punto de entrega"
                    >
                      <ti-icono nombre="navigation" class="text-marca" />
                    </a>
                  }
                </li>
              </ol>
              @if (e.notas) {
                <p class="flex gap-3 rounded-2xl border border-placa/60 bg-aviso-suave p-4">
                  <ti-icono nombre="message" class="mt-0.5 text-placa-oscuro" />
                  <span
                    ><span class="font-semibold">Indicaciones del cliente:</span>
                    {{ e.notas }}</span
                  >
                </p>
              }
              <p class="numeros text-right text-sm text-piedra">
                Tarifa del servicio:
                <strong class="text-lg text-tinta">{{ e.tarifa | cop }}</strong>
                @if (e.distanciaKm) {
                  · {{ e.distanciaKm }} km
                }
              </p>
            </div>

            <aside class="space-y-4">
              @if (e.estado !== 'Entregado') {
                <section class="space-y-4" aria-label="Acciones del servicio">
                  @if (puedeIniciar()) {
                    <button
                      type="button"
                      class="btn-primario btn-grande w-full"
                      [disabled]="iniciando()"
                      (click)="iniciarRuta()"
                    >
                      <ti-icono
                        [nombre]="iniciando() ? 'loader' : 'navigation'"
                        [class]="iniciando() ? 'animate-spin' : ''"
                      />
                      {{ iniciando() ? 'Iniciando…' : 'Iniciar ruta' }}
                    </button>
                    <p class="text-sm text-piedra">
                      Al iniciar la ruta compartiremos tu ubicación con el cliente.
                    </p>
                  }
                  <div class="tarjeta flex items-center justify-between gap-4 p-4">
                    <div class="flex items-start gap-3">
                      <span
                        class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full"
                        [class]="
                          ubicacion.estado() === 'activo'
                            ? 'bg-exito-suave text-exito'
                            : 'bg-niebla text-piedra'
                        "
                        ><ti-icono nombre="radar" class="size-5"
                      /></span>
                      <div>
                        <p id="ubicacion-titulo" class="font-semibold">Compartir mi ubicación</p>
                        <p class="text-sm text-piedra">{{ textoUbicacion() }}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-labelledby="ubicacion-titulo"
                      [attr.aria-checked]="ubicacion.estado() === 'activo'"
                      [disabled]="!puedeCompartir()"
                      class="relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-40"
                      [class]="ubicacion.estado() === 'activo' ? 'bg-exito' : 'bg-linea'"
                      (click)="alternarUbicacion()"
                    >
                      <span
                        class="absolute top-1 size-6 rounded-full bg-papel shadow transition-[left]"
                        [style.left]="ubicacion.estado() === 'activo' ? '1.75rem' : '0.25rem'"
                      ></span>
                    </button>
                  </div>
                  @if (puedeFinalizar()) {
                    <button
                      type="button"
                      class="btn-acento btn-grande w-full text-lg"
                      (click)="modal.set(true)"
                    >
                      <ti-icono nombre="package-check" /> Finalizar entrega
                    </button>
                    <p class="text-sm text-piedra">
                      Pídele el PIN al cliente y toma una foto del paquete entregado.
                    </p>
                  } @else if (e.estado !== 'Cancelado') {
                    <p class="text-sm text-piedra">
                      Inicia la ruta para poder finalizar la entrega.
                    </p>
                  }
                </section>
              } @else {
                <div
                  class="rounded-2xl bg-exito-suave p-6 text-center animate-[var(--animate-aparecer)]"
                >
                  <span
                    class="mx-auto grid size-16 place-items-center rounded-full bg-exito text-white"
                    ><ti-icono nombre="circle-check" class="size-9"
                  /></span>
                  <p class="mt-4 font-semibold text-exito">El cliente recibió su paquete.</p>
                  <a routerLink="/conductor/tablero" class="btn-primario mt-4"
                    >Buscar otro servicio</a
                  >
                </div>
              }
            </aside>
          </div>
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
  private readonly tracking = inject(TrackingPort);
  private readonly perfil = inject(DriverProfileStore);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerPort);
  protected readonly ubicacion = inject(CompartirUbicacionService);

  protected readonly envio = signal<Envio | null>(null);
  protected readonly seguimiento = signal<Seguimiento | null>(null);
  private temporizadorMapa: ReturnType<typeof setInterval> | null = null;
  protected readonly error = signal('');
  protected readonly modal = signal(false);
  protected readonly iniciando = signal(false);

  protected readonly fase = computed<FaseCarga>(() =>
    this.envio() ? 'listo' : this.error() ? 'error' : 'cargando',
  );
  protected readonly puedeIniciar = computed(
    () => !!this.envio() && puedeIniciarRuta(this.envio() as Envio),
  );
  protected readonly puedeFinalizar = computed(
    () => !!this.envio() && puedeEntregar(this.envio() as Envio),
  );
  protected readonly puedeCompartir = computed(
    () => !!this.envio() && puedeCompartirUbicacion(this.envio() as Envio),
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

  protected readonly pasos = computed(() => {
    const estado = this.envio()?.estado;
    const orden = ['Asignado', 'En Ruta', 'Entregado'];
    const i = estado ? orden.indexOf(estado) : -1;
    const lista: { texto: string; icono: NombreIcono }[] = [
      { texto: 'Recoger', icono: 'package' },
      { texto: 'En camino', icono: 'navigation' },
      { texto: 'Entregado', icono: 'package-check' },
    ];
    return lista.map((p, n) => ({
      ...p,
      hecho: n < i || estado === 'Entregado',
      actual: n === i && estado !== 'Entregado',
    }));
  });

  ngOnInit(): void {
    void this.cargar();
    // El mapa se actualiza cada 15 s mientras el servicio está activo
    this.temporizadorMapa = setInterval(() => void this.actualizarMapa(), 15_000);
  }

  ngOnDestroy(): void {
    this.ubicacion.detener();
    if (this.temporizadorMapa) clearInterval(this.temporizadorMapa);
  }

  /** Enlace de navegación (abre la app de mapas del celular) hacia una dirección o coordenadas. */
  protected comoLlegar(direccion: string, coords?: Coordenadas | null): string {
    const destino = coords ? `${coords.lat},${coords.lon}` : `${direccion}, Cundinamarca, Colombia`;
    return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(destino)}`;
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
      // Si ya va en ruta (por ejemplo, al recargar la página), retoma la ubicación compartida
      if (e.estado === 'En Ruta' && this.ubicacion.estado() === 'apagado')
        this.ubicacion.iniciar(e.id);
      void this.actualizarMapa();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) this.error.set('No encontramos ese servicio.');
      else if (e instanceof ApiError && e.status === 403)
        this.error.set('Este servicio no está asignado a ti.');
      else this.error.set(this.mapper.traducir(e));
    }
  }

  async iniciarRuta(): Promise<void> {
    const e = this.envio();
    if (!e || this.iniciando()) return;
    this.iniciando.set(true);
    try {
      this.envio.set(await this.servicios.iniciarRuta(e.id));
      this.log.info('Servicio', `Ruta iniciada #${e.id}`);
      if (!this.ubicacion.compartiendo(e.id)) this.ubicacion.iniciar(e.id);
      void this.actualizarMapa();
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

  private async actualizarMapa(): Promise<void> {
    const e = this.envio();
    if (!e || (e.estado !== 'Asignado' && e.estado !== 'En Ruta')) return;
    try {
      this.seguimiento.set(await this.tracking.seguimiento(e.id));
    } catch (err) {
      this.log.debug('Servicio', 'No se pudo actualizar el mapa', err);
    }
  }

  async alEntregar(): Promise<void> {
    this.modal.set(false);
    this.ubicacion.detener();
    await this.cargar();
  }
}
