import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { PushService } from '../core/realtime/push.service';
import { Router } from '@angular/router';
import { SessionService } from '../core/auth/session.service';
import { Notificacion, TipoNotificacion, haceCuanto } from '../core/domain';
import { IconoComponent, NombreIcono } from '../shared/ui/icono.component';
import { NotificacionesStore, rutaDeNotificacion } from './notificaciones.store';

const ICONO: Record<TipoNotificacion, { icono: NombreIcono; color: string }> = {
  envio_aceptado: { icono: 'user-round', color: 'bg-marca-suave text-marca' },
  ruta_iniciada: { icono: 'navigation', color: 'bg-marca-suave text-marca' },
  envio_entregado: { icono: 'package-check', color: 'bg-exito-suave text-exito' },
  envio_cancelado: { icono: 'ban', color: 'bg-alerta-suave text-alerta' },
  conductor_aprobado: { icono: 'badge-check', color: 'bg-exito-suave text-exito' },
  conductor_rechazado: { icono: 'triangle-alert', color: 'bg-aviso-suave text-placa-oscuro' },
  calificacion_recibida: { icono: 'star', color: 'bg-aviso-suave text-placa-oscuro' },
  nuevo_servicio: { icono: 'package', color: 'bg-bosque-suave text-bosque' },
  pago_aprobado: { icono: 'wallet', color: 'bg-exito-suave text-exito' },
  pago_rechazado: { icono: 'triangle-alert', color: 'bg-alerta-suave text-alerta' },
  liquidacion: { icono: 'hand-coins', color: 'bg-bosque-suave text-bosque' },
  mensaje_chat: { icono: 'message', color: 'bg-marca-suave text-marca' },
  paquete_recogido: { icono: 'camera', color: 'bg-marca-suave text-marca' },
};

/** Botón de campana con el contador y el panel desplegable de notificaciones. */
@Component({
  selector: 'ti-campana',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  host: {
    class: 'relative',
    '(document:click)': 'alClicFuera($event)',
    '(document:keydown.escape)': 'abierto.set(false)',
  },
  template: `
    <button
      type="button"
      class="relative grid size-11 place-items-center rounded-full text-piedra transition-colors hover:bg-marca-suave hover:text-marca"
      [attr.aria-expanded]="abierto()"
      aria-controls="panel-notificaciones"
      (click)="alternar()"
    >
      <ti-icono
        nombre="bell"
        class="size-6"
        [class]="store.sonando() ? 'animate-[var(--animate-campana)]' : ''"
      />
      @if (store.noLeidas() > 0) {
        <span
          class="absolute right-1 top-1 grid min-w-5 place-items-center rounded-full border-2 border-papel bg-marca px-1 text-[0.65rem] font-extrabold leading-4 text-white"
        >
          {{ store.noLeidas() > 9 ? '9+' : store.noLeidas() }}
        </span>
      }
      <span class="sr-only"
        >Notificaciones{{ store.noLeidas() ? ', ' + store.noLeidas() + ' sin leer' : '' }}</span
      >
    </button>

    @if (abierto()) {
      <div
        id="panel-notificaciones"
        class="tarjeta fixed inset-x-3 top-[4.25rem] z-40 overflow-hidden shadow-[var(--shadow-elevada)] animate-[var(--animate-aparecer)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-13 sm:w-96"
      >
        <div class="flex items-center justify-between border-b border-linea px-4 py-3">
          <p class="font-bold">Notificaciones</p>
          <span class="flex gap-3">
            @if (store.noLeidas() > 0) {
              <button
                type="button"
                class="text-sm font-semibold text-marca hover:underline"
                (click)="store.marcarTodas()"
              >
                Marcar leídas
              </button>
            }
            @if (hayLeidas()) {
              <button
                type="button"
                class="text-sm font-semibold text-piedra hover:text-alerta hover:underline"
                (click)="$event.stopPropagation(); store.borrarLeidas()"
              >
                Borrar leídas
              </button>
            }
          </span>
        </div>
        <ul class="max-h-[70vh] overflow-y-auto sm:max-h-96">
          @for (n of store.items(); track n.id) {
            <li class="group relative">
              <button
                type="button"
                class="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-full text-piedra opacity-60 hover:bg-alerta-suave hover:text-alerta hover:opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                [attr.aria-label]="'Eliminar notificación: ' + n.titulo"
                (click)="$event.stopPropagation(); store.borrar(n)"
              >
                <ti-icono nombre="x" class="size-4" />
              </button>
              <button
                type="button"
                class="flex w-full gap-3 border-b border-linea/60 py-3 pl-4 pr-10 text-left transition-colors hover:bg-crema"
                [class.bg-marca-suave]="!n.leida"
                (click)="abrir(n)"
              >
                <span
                  class="grid size-10 shrink-0 place-items-center rounded-full"
                  [class]="icono(n).color"
                >
                  <ti-icono [nombre]="icono(n).icono" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-start justify-between gap-2">
                    <span class="font-semibold">{{ n.titulo }}</span>
                    @if (!n.leida) {
                      <span
                        class="mt-1.5 size-2 shrink-0 rounded-full bg-marca"
                        aria-label="Sin leer"
                      ></span>
                    }
                  </span>
                  <span class="mt-0.5 block text-sm text-piedra">{{ n.mensaje }}</span>
                  <span class="mt-1 block text-xs text-piedra/80">{{ cuando(n) }}</span>
                </span>
              </button>
            </li>
          } @empty {
            <li class="px-4 py-10 text-center text-piedra">
              @if (store.cargando()) {
                <ti-icono nombre="loader" class="mx-auto size-6 animate-spin" />
              } @else {
                <ti-icono nombre="inbox" class="mx-auto size-8 text-piedra/60" />
                <p class="mt-2">No tienes notificaciones todavía.</p>
              }
            </li>
          }
        </ul>
        @switch (push.estado()) {
          @case ('inactivo') {
            <button
              type="button"
              class="flex w-full items-center gap-2 border-t border-linea bg-crema px-4 py-3 text-left text-sm font-semibold text-marca hover:bg-marca-suave"
              (click)="$event.stopPropagation(); push.activar()"
            >
              <ti-icono nombre="bell-ring" class="size-4" /> Recibir avisos en este dispositivo
            </button>
          }
          @case ('activando') {
            <p class="flex items-center gap-2 border-t border-linea px-4 py-3 text-sm text-piedra">
              <ti-icono nombre="loader" class="size-4 animate-spin" /> Activando avisos…
            </p>
          }
          @case ('bloqueado') {
            <p class="flex items-center gap-2 border-t border-linea px-4 py-3 text-xs text-piedra">
              <ti-icono nombre="bell-off" class="size-4" /> Los avisos están bloqueados en este
              navegador. Permítelos desde el ícono junto a la dirección web.
            </p>
          }
        }
      </div>
    }
  `,
})
export class CampanaComponent {
  protected readonly store = inject(NotificacionesStore);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly abierto = signal(false);
  protected readonly push = inject(PushService);
  protected readonly hayLeidas = computed(() => this.store.items().some((n) => n.leida));

  protected alternar(): void {
    const abrir = !this.abierto();
    this.abierto.set(abrir);
    if (abrir) void this.store.cargar();
  }

  protected icono(n: Notificacion) {
    return ICONO[n.tipo];
  }

  protected cuando(n: Notificacion): string {
    return haceCuanto(n.fecha);
  }

  protected async abrir(n: Notificacion): Promise<void> {
    this.abierto.set(false);
    await this.store.marcarLeida(n);
    const ruta = rutaDeNotificacion(n, this.session.rol());
    if (ruta) await this.router.navigateByUrl(ruta);
  }

  protected alClicFuera(ev: MouseEvent): void {
    if (this.abierto() && !this.el.nativeElement.contains(ev.target as Node))
      this.abierto.set(false);
  }
}
