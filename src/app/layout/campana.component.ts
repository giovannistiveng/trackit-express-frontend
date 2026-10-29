import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
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
          @if (store.noLeidas() > 0) {
            <button
              type="button"
              class="text-sm font-semibold text-marca hover:underline"
              (click)="store.marcarTodas()"
            >
              Marcar todas como leídas
            </button>
          }
        </div>
        <ul class="max-h-[70vh] overflow-y-auto sm:max-h-96">
          @for (n of store.items(); track n.id) {
            <li>
              <button
                type="button"
                class="flex w-full gap-3 border-b border-linea/60 px-4 py-3 text-left transition-colors hover:bg-crema"
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
