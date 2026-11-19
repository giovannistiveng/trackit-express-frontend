import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  Envio,
  SERVICIOS,
  TEXTO_ETAPA,
  esIdValido,
  puedeCompartirUbicacion,
  resumenDetalle,
} from '../../core/domain';
import { ApiError } from '../../core/http/api-error';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { DriverServicePort, EventosPort, LoggerPort, TrackingPort } from '../../core/ports';
import { Coordenadas, Seguimiento, esDelEnvio, telefonoWhatsapp } from '../../core/domain';
import { IconoComponent, NombreIcono } from '../../shared/ui/icono.component';
import { MapaEnvioComponent } from '../../shared/ui/mapa-envio.component';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { EstadoBadgeComponent } from '../../shared/ui/estado-badge.component';
import { EstadoCargaComponent, FaseCarga, faseDe } from '../../shared/ui/estado-carga.component';
import { ToastService } from '../../shared/ui/toast.service';
import { EntregaModalComponent } from './components/entrega-modal.component';
import { RecogidaModalComponent } from './components/recogida-modal.component';
import { ChatEnvioComponent } from '../../shared/ui/chat-envio.component';
import { CompartirUbicacionService } from './state/compartir-ubicacion.service';
import { DriverProfileStore } from './state/driver-profile.store';
import { desplazarA } from '../../shared/util/desplazar';
import { EtapasServicioComponent } from '../../shared/ui/etapas-servicio.component';

export interface AccionServicio {
  tipo: 'llegue_recoger' | 'recoger' | 'llegue_destino' | 'finalizar';
  texto: string;
  icono: NombreIcono;
  ayuda: string;
  clase: string;
  /** Si hay algo pendiente antes (paradas), el botón se bloquea con este texto. */
  bloqueo?: string;
}

function ayudaRecogida(pideCodigo: boolean, conCompra: boolean): string {
  if (pideCodigo) return 'Pide el código de recogida, cuenta los bultos y toma la foto.';
  if (conCompra) return 'Registra el valor de la factura y tómale foto.';
  return 'Cuenta los bultos y toma la foto de la carga.';
}

function bloqueoParadas(n: number): string | undefined {
  if (n <= 0) return undefined;
  if (n === 1) return 'Primero marca la parada como hecha.';
  return `Primero marca las ${n} paradas como hechas.`;
}

/** Acción principal del conductor según la etapa del servicio. */
export function accionDe(
  e: Envio,
  faltaParaEntregar: string,
  paradasPendientes: number,
): AccionServicio | null {
  const conCompra = SERVICIOS[e.tipoServicio].conCompra;
  switch (e.etapa) {
    case 'yendo_a_recoger':
      return {
        tipo: 'llegue_recoger',
        texto: conCompra ? 'Llegué al lugar' : 'Llegué a recoger',
        icono: 'flag',
        ayuda: 'Avisamos al cliente para que tenga lista la carga.',
        clase: 'btn-primario',
      };
    case 'en_recogida':
      return {
        tipo: 'recoger',
        texto: conCompra ? 'Ya compré, salir a entregar' : 'Recoger la carga',
        icono: 'camera',
        ayuda: ayudaRecogida(e.pideCodigoRecogida, conCompra),
        clase: 'btn-primario',
      };
    case 'en_camino':
      return {
        tipo: 'llegue_destino',
        texto: e.idaYVuelta ? 'Llegué al destino, regreso' : 'Llegué a entregar',
        icono: 'flag',
        ayuda: 'Avisamos a quien recibe para que tenga listo el PIN.',
        clase: 'btn-primario',
        bloqueo: bloqueoParadas(paradasPendientes),
      };
    case 'regresando':
      return {
        tipo: 'llegue_destino',
        texto: 'Llegué al punto de entrega',
        icono: 'flag',
        ayuda: 'Avisamos al cliente que regresaste.',
        clase: 'btn-primario',
      };
    case 'en_destino':
      return {
        tipo: 'finalizar',
        texto: 'Finalizar entrega',
        icono: 'package-check',
        ayuda: 'Pide el PIN a quien recibe y toma la foto de la entrega.',
        clase: 'btn-acento',
        bloqueo: faltaParaEntregar || undefined,
      };
    default:
      return null;
  }
}

/** Servicio en curso del conductor: una acción por etapa, mapa, ubicación y chat. Nunca muestra el PIN. */
@Component({
  selector: 'ti-servicio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    CopPipe,
    EtapasServicioComponent,
    EstadoBadgeComponent,
    EstadoCargaComponent,
    EntregaModalComponent,
    RecogidaModalComponent,
    ChatEnvioComponent,
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
              <p class="flex items-center gap-2 text-sm font-semibold text-piedra">
                <ti-icono [nombre]="servicioDe(e).icono" class="size-4 text-marca" />
                {{ servicioDe(e).nombre }} #{{ e.id }}
              </p>
              <h1 class="mt-1">{{ titulo(e) }}</h1>
              <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <ti-estado-badge [estado]="e.estado" />
                @if (cobroEnEfectivo(e); as cobro) {
                  <span class="insignia bg-aviso-suave"
                    ><ti-icono nombre="banknote" class="size-4" /> Cobra {{ cobro | cop }} en
                    efectivo</span
                  >
                }
                @if (e.metodoPago === 'nequi') {
                  <span class="insignia bg-exito-suave text-exito"
                    ><ti-icono nombre="smartphone" class="size-4" /> Servicio pagado con Nequi</span
                  >
                }
                @if (e.idaYVuelta) {
                  <span class="insignia bg-marca-suave text-marca"
                    ><ti-icono nombre="repeat" class="size-4" /> Ida y vuelta</span
                  >
                }
              </div>
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

          <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
            <div class="min-w-0 space-y-4">
              @if (e.estado !== 'Entregado' && e.estado !== 'Cancelado') {
                <ti-mapa-envio
                  alto="alto"
                  [seguimiento]="seguimiento()"
                  [posicionPropia]="ubicacion.ultimaPosicion()"
                  [paradas]="coordsParadas()"
                />
              }

              @if (accion(e); as a) {
                <section
                  class="hoja -mx-4 space-y-3 p-5 sm:mx-0 sm:rounded-3xl lg:hidden"
                  aria-label="Siguiente paso"
                >
                  <ng-container
                    *ngTemplateOutlet="siguientePaso; context: { $implicit: a, e: e }"
                  />
                </section>
              }

              <ol class="space-y-3">
                <li class="tarjeta flex items-start gap-4 p-4">
                  <span
                    class="grid size-10 shrink-0 place-items-center rounded-full bg-tinta font-extrabold text-white"
                  >
                    @if (e.urlFotoRecogida) {
                      <ti-icono nombre="check" />
                    } @else {
                      A
                    }
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm text-piedra">
                      {{ servicioDe(e).conCompra ? 'Compra o vuelta en' : 'Recoge en' }}
                    </p>
                    <p class="text-lg font-semibold">{{ e.origen }}</p>
                    @if (e.detalle?.contactoOrigenNombre || e.detalle?.contactoOrigenTelefono) {
                      <p class="mt-1 text-sm">
                        Entrega:
                        <strong>{{ e.detalle?.contactoOrigenNombre ?? 'Sin nombre' }}</strong>
                      </p>
                      @if (e.detalle?.contactoOrigenTelefono; as tel) {
                        <div class="mt-2 flex flex-wrap gap-2">
                          <a class="btn-secundario !py-1.5 text-sm" [href]="'tel:' + tel"
                            ><ti-icono nombre="phone" class="size-4" /> Llamar</a
                          >
                          <a
                            class="btn-secundario !py-1.5 text-sm"
                            [href]="whatsapp(tel)"
                            target="_blank"
                            rel="noopener"
                            ><ti-icono nombre="message-circle" class="size-4" /> WhatsApp</a
                          >
                        </div>
                      }
                    }
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
                @for (p of e.paradas ?? []; track p.id) {
                  <li
                    class="tarjeta flex items-start gap-4 p-4"
                    [class.opacity-70]="!!p.completadaEn"
                  >
                    <span
                      class="grid size-10 shrink-0 place-items-center rounded-full border-2 font-bold"
                      [class]="
                        p.completadaEn
                          ? 'border-exito bg-exito text-white'
                          : 'border-tinta bg-papel'
                      "
                    >
                      @if (p.completadaEn) {
                        <ti-icono nombre="check" />
                      } @else {
                        {{ p.orden }}
                      }
                    </span>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm text-piedra">Parada {{ p.orden }}</p>
                      <p class="text-lg font-semibold">{{ p.direccion }}</p>
                      @if (e.estado === 'En Ruta' && !p.completadaEn) {
                        <button
                          type="button"
                          class="btn-secundario mt-2 !py-1.5 text-sm"
                          [disabled]="ocupado()"
                          (click)="completarParada(e, p.id)"
                        >
                          <ti-icono nombre="check" class="size-4" /> Marcar parada hecha
                        </button>
                      }
                    </div>
                    @if (e.estado === 'En Ruta' && !p.completadaEn) {
                      <a
                        class="btn-secundario shrink-0 !px-3"
                        [href]="comoLlegar(p.direccion, p.coords)"
                        target="_blank"
                        rel="noopener"
                        [attr.aria-label]="'Cómo llegar a la parada ' + p.orden"
                      >
                        <ti-icono nombre="navigation" class="text-marca" />
                      </a>
                    }
                  </li>
                }
                <li class="tarjeta flex items-start gap-4 p-4">
                  <span
                    class="grid size-10 shrink-0 place-items-center rounded-full bg-placa font-extrabold text-tinta ring-2 ring-tinta"
                  >
                    @if (e.destinoVisitadoEn || e.estado === 'Entregado') {
                      <ti-icono nombre="check" />
                    } @else {
                      B
                    }
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm text-piedra">{{ e.idaYVuelta ? 'Lleva a' : 'Entrega en' }}</p>
                    <p class="text-lg font-semibold">{{ e.destino }}</p>
                    @if (e.destinatarioNombre || e.destinatarioTelefono) {
                      <p class="mt-1 text-sm">
                        Recibe: <strong>{{ e.destinatarioNombre ?? 'Sin nombre' }}</strong>
                      </p>
                      @if (e.destinatarioTelefono; as tel) {
                        <div class="mt-2 flex flex-wrap gap-2">
                          <a class="btn-secundario !py-1.5 text-sm" [href]="'tel:' + tel"
                            ><ti-icono nombre="phone" class="size-4" /> Llamar</a
                          >
                          <a
                            class="btn-secundario !py-1.5 text-sm"
                            [href]="whatsapp(tel)"
                            target="_blank"
                            rel="noopener"
                            ><ti-icono nombre="message-circle" class="size-4" /> WhatsApp</a
                          >
                        </div>
                      }
                    }
                  </div>
                  @if (
                    e.estado === 'En Ruta' && !e.destinoVisitadoEn && paradasPendientes(e) === 0
                  ) {
                    <a
                      class="btn-secundario shrink-0 !px-3"
                      [href]="comoLlegar(e.destino, e.destinoCoords)"
                      target="_blank"
                      rel="noopener"
                      aria-label="Cómo llegar al destino"
                    >
                      <ti-icono nombre="navigation" class="text-marca" />
                    </a>
                  }
                </li>
                @if (e.idaYVuelta) {
                  <li class="tarjeta flex items-start gap-4 p-4">
                    <span
                      class="grid size-10 shrink-0 place-items-center rounded-full bg-tinta text-white"
                      ><ti-icono nombre="repeat"
                    /></span>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm text-piedra">Regresa y entrega en</p>
                      <p class="text-lg font-semibold">{{ e.origen }}</p>
                    </div>
                    @if (e.estado === 'En Ruta' && e.destinoVisitadoEn) {
                      <a
                        class="btn-secundario shrink-0 !px-3"
                        [href]="comoLlegar(e.origen, e.origenCoords)"
                        target="_blank"
                        rel="noopener"
                        aria-label="Cómo llegar al origen"
                      >
                        <ti-icono nombre="navigation" class="text-marca" />
                      </a>
                    }
                  </li>
                }
              </ol>

              <section class="tarjeta p-5" aria-labelledby="titulo-pedido">
                <h2 id="titulo-pedido" class="text-base">Qué llevas</h2>
                @if (textoPedido(e); as t) {
                  <p class="mt-2 whitespace-pre-line">{{ t }}</p>
                }
                @if (lineasDetalle(e).length) {
                  <ul class="mt-3 flex flex-wrap gap-1.5">
                    @for (l of lineasDetalle(e); track l) {
                      <li class="insignia bg-niebla">{{ l }}</li>
                    }
                  </ul>
                }
                @if (e.bultosRecogidos) {
                  <p class="mt-3 text-sm text-piedra">
                    Contaste {{ e.bultosRecogidos }} bultos al recoger.
                  </p>
                }
                @if (e.valorCompra) {
                  <p class="mt-2 text-sm">
                    Compra registrada: <strong class="numeros">{{ e.valorCompra | cop }}</strong>
                  </p>
                }
                @if (e.notas) {
                  <p class="mt-4 flex gap-3 rounded-2xl border border-placa/60 bg-aviso-suave p-4">
                    <ti-icono nombre="message" class="mt-0.5 text-placa-oscuro" />
                    <span
                      ><span class="font-semibold">Indicaciones del cliente:</span>
                      {{ e.notas }}</span
                    >
                  </p>
                }
                <p class="numeros mt-4 text-right text-sm text-piedra">
                  Tarifa del servicio:
                  <strong class="text-lg text-tinta">{{ e.tarifa | cop }}</strong>
                  @if (e.distanciaKm) {
                    ({{ e.distanciaKm }} km)
                  }
                </p>
              </section>
            </div>

            <aside class="space-y-4">
              @if (e.estado !== 'Entregado') {
                <section class="space-y-4" aria-label="Acciones del servicio">
                  @if (accion(e); as a) {
                    <div class="hidden space-y-3 lg:block">
                      <ng-container
                        *ngTemplateOutlet="siguientePaso; context: { $implicit: a, e: e }"
                      />
                    </div>
                  }
                  <section class="tarjeta p-5" aria-label="Avance del servicio">
                    <ti-etapas-servicio
                      [etapa]="e.etapa"
                      rol="conductor"
                      [idaYVuelta]="!!e.idaYVuelta"
                    />
                  </section>
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
                        <p class="text-sm text-piedra">{{ textoUbicacion(e) }}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-labelledby="ubicacion-titulo"
                      [attr.aria-checked]="ubicacion.estado() === 'activo'"
                      [disabled]="!puedeCompartir(e)"
                      class="relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-40"
                      [class]="ubicacion.estado() === 'activo' ? 'bg-exito' : 'bg-linea'"
                      (click)="alternarUbicacion(e)"
                    >
                      <span
                        class="absolute top-1 size-6 rounded-full bg-papel shadow transition-[left]"
                        [style.left]="ubicacion.estado() === 'activo' ? '1.75rem' : '0.25rem'"
                      ></span>
                    </button>
                  </div>
                  @if (e.estado === 'Asignado' || e.estado === 'En Ruta') {
                    <div id="chat">
                      <ti-chat-envio [idEnvio]="e.id" rol="conductor" otro="el cliente" />
                    </div>
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
                  <p class="mt-4 font-semibold text-exito">El cliente recibió su pedido.</p>
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

    <ng-template #siguientePaso let-a let-e="e">
      <p class="text-sm font-semibold text-marca">Siguiente paso</p>
      <button
        type="button"
        class="btn-grande w-full"
        [class]="a.clase"
        [disabled]="ocupado() || !!a.bloqueo"
        (click)="ejecutar(a.tipo, e)"
      >
        <ti-icono [nombre]="ocupado() ? 'loader' : a.icono" [class.animate-spin]="ocupado()" />
        {{ a.texto }}
      </button>
      <p class="text-sm text-piedra">{{ a.bloqueo || a.ayuda }}</p>
    </ng-template>

    @if (recogida() && envio(); as e) {
      <ti-recogida-modal
        [envio]="e"
        (cerrar)="recogida.set(false)"
        (recogido)="alRecoger($event)"
      />
    }

    @if (modal() && envio(); as e) {
      <ti-entrega-modal
        [idEnvio]="e.id"
        [cobroEfectivo]="cobroEnEfectivo(e)"
        [incluyeCompra]="!!e.valorCompra"
        (cerrar)="modal.set(false)"
        (entregado)="alEntregar()"
        (yaEntregado)="alEntregar()"
      />
    }
  `,
})
export class ServicioPage implements OnInit, OnDestroy {
  readonly id = input.required<string>();
  /** ?chat=1 desde una notificación de mensaje. */
  readonly chat = input<string>();

  private readonly servicios = inject(DriverServicePort);
  private readonly tracking = inject(TrackingPort);
  private readonly perfil = inject(DriverProfileStore);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerPort);
  protected readonly ubicacion = inject(CompartirUbicacionService);

  protected readonly envio = signal<Envio | null>(null);
  protected readonly seguimiento = signal<Seguimiento | null>(null);
  private temporizadorMapa?: ReturnType<typeof setInterval>;
  protected readonly error = signal('');
  protected readonly modal = signal(false);
  protected readonly recogida = signal(false);
  private chatEnfocado = false;
  protected readonly ocupado = signal(false);
  private readonly eventos = inject(EventosPort);

  protected paradasPendientes(e: Envio): number {
    return (e.paradas ?? []).filter((p) => !p.completadaEn).length;
  }

  /** Qué falta antes de poder entregar (paradas, regreso), o '' si nada. */
  protected faltaParaEntregar(e: Envio): string {
    const n = this.paradasPendientes(e);
    if (n > 0)
      return n === 1
        ? 'Te falta 1 parada por marcar como hecha.'
        : `Te faltan ${n} paradas por marcar como hecha.`;
    if (e.idaYVuelta && !e.destinoVisitadoEn)
      return 'Marca la llegada al destino; la entrega se cierra al regresar al origen.';
    return '';
  }

  protected readonly fase = computed<FaseCarga>(() =>
    faseDe({ cargando: !this.envio() && !this.error(), error: !this.envio() && this.error() }),
  );
  protected readonly coordsParadas = computed(() =>
    (this.envio()?.paradas ?? []).map((p) => p.coords),
  );

  /** Una sola acción principal según la etapa: así el conductor nunca duda qué sigue. */
  protected accion(e: Envio): AccionServicio | null {
    return accionDe(e, this.faltaParaEntregar(e), this.paradasPendientes(e));
  }
  protected puedeCompartir(e: Envio): boolean {
    return puedeCompartirUbicacion(e);
  }

  protected textoUbicacion(e: Envio): string {
    switch (this.ubicacion.estado()) {
      case 'activo':
        return 'El cliente puede ver por dónde vas.';
      case 'denegado':
        return (
          this.ubicacion.motivo() ||
          'La ubicación está bloqueada. Permítela en el navegador para compartir.'
        );
      case 'no-disponible':
        return 'Tu dispositivo no puede obtener la ubicación ahora.';
      default:
        return this.puedeCompartir(e) ? 'Apagado.' : 'Disponible cuando el servicio esté en ruta.';
    }
  }

  constructor() {
    // Cancelaciones o cambios del cliente llegan al instante
    const sub = this.eventos.notificaciones().subscribe((n) => {
      if (esDelEnvio(n.idEnvio, this.envio()) && n.tipo !== 'mensaje_chat') void this.cargar();
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected servicioDe(e: Envio) {
    return SERVICIOS[e.tipoServicio];
  }

  protected titulo(e: Envio): string {
    return e.estado === 'Entregado' ? 'Entrega completada' : TEXTO_ETAPA[e.etapa].titulo;
  }

  protected lineasDetalle(e: Envio): string[] {
    return resumenDetalle(e.tipoServicio, e.detalle);
  }

  protected textoPedido(e: Envio): string {
    const d = e.detalle;
    return d?.lista ?? d?.objetos ?? d?.insumo ?? (e.tipoServicio === 'paquete' ? e.tipoCarga : '');
  }

  /** Lo que el conductor cobra en efectivo: el servicio (si no se pagó con Nequi) y la compra. */
  protected cobroEnEfectivo(e: Envio): number | null {
    if (e.estado === 'Cancelado' || e.estado === 'Entregado') return null;
    const total = (e.metodoPago === 'nequi' ? 0 : e.tarifa) + (e.valorCompra ?? 0);
    return total > 0 ? total : null;
  }

  async ejecutar(tipo: AccionServicio['tipo'], e: Envio): Promise<void> {
    if (tipo === 'recoger') this.recogida.set(true);
    else if (tipo === 'finalizar') this.modal.set(true);
    else if (tipo === 'llegue_recoger') await this.llegadaRecogida(e);
    else await this.llegadaDestino(e);
  }

  async llegadaRecogida(e: Envio): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    try {
      const r = await this.servicios.llegadaRecogida(e.id);
      this.envio.set({ ...e, ...r, paradas: r.paradas ?? e.paradas, pago: r.pago ?? e.pago });
      this.toast.exito('Avisamos al cliente que llegaste.');
    } catch (err) {
      this.toast.error(this.mapper.traducir(err));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected whatsapp(tel: string): string {
    return `https://wa.me/${telefonoWhatsapp(tel)}`;
  }

  ngOnInit(): void {
    void this.cargar();
    // El mapa se actualiza cada 15 s mientras el servicio está activo
    this.temporizadorMapa = setInterval(() => void this.actualizarMapa(), 15_000);
  }

  ngOnDestroy(): void {
    this.ubicacion.detener();
    clearInterval(this.temporizadorMapa);
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
      if (this.chat() && !this.chatEnfocado) {
        this.chatEnfocado = true;
        setTimeout(() => desplazarA('chat'), 300);
      }
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

  protected alRecoger(e: Envio): void {
    this.recogida.set(false);
    const antes = this.envio();
    // La respuesta de la recogida no trae las paradas: se conservan las que ya se tenían
    this.envio.set({ ...e, paradas: e.paradas ?? antes?.paradas, pago: e.pago ?? antes?.pago });
    this.toast.exito('Carga recogida. ¡Buen viaje!');
    if (!this.ubicacion.compartiendo(e.id)) this.ubicacion.iniciar(e.id);
    void this.actualizarMapa();
  }

  async completarParada(e: Envio, idParada: number): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    try {
      const paradas = await this.servicios.completarParada(e.id, idParada);
      this.envio.set({ ...e, paradas });
    } catch (err) {
      this.toast.error(this.mapper.traducir(err));
    } finally {
      this.ocupado.set(false);
    }
  }

  async llegadaDestino(e: Envio): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    try {
      const r = await this.servicios.llegadaDestino(e.id);
      this.envio.set({ ...e, ...r, paradas: r.paradas ?? e.paradas, pago: r.pago ?? e.pago });
      void this.actualizarMapa();
    } catch (err) {
      this.toast.error(this.mapper.traducir(err));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected alternarUbicacion(e: Envio): void {
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
