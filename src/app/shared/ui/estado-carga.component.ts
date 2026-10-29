import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconoComponent } from './icono.component';

export type FaseCarga = 'cargando' | 'vacio' | 'error' | 'listo';

/** Envoltorio de los cuatro estados de una pantalla con datos. */
@Component({
  selector: 'ti-estado-carga',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    @switch (fase()) {
      @case ('cargando') {
        <div class="space-y-3" role="status" aria-live="polite">
          <span class="sr-only">{{ textoCargando() }}</span>
          @for (i of [1, 2, 3]; track i) {
            <div class="esqueleto h-24 !rounded-2xl" aria-hidden="true"></div>
          }
        </div>
      }
      @case ('vacio') {
        <div
          class="rounded-2xl border border-dashed border-linea bg-papel/60 px-5 py-12 text-center"
        >
          <span
            class="mx-auto grid size-14 place-items-center rounded-full bg-marca-suave text-marca"
          >
            <ti-icono nombre="inbox" class="size-7" />
          </span>
          <p class="mt-4 font-semibold">{{ textoVacio() }}</p>
          <ng-content select="[vacio]" />
        </div>
      }
      @case ('error') {
        <div
          class="flex gap-4 rounded-2xl border border-alerta/30 bg-alerta-suave px-5 py-6"
          role="alert"
        >
          <ti-icono nombre="triangle-alert" class="size-6 text-alerta" />
          <div>
            <p class="font-semibold text-alerta">{{ textoError() }}</p>
            <button type="button" class="btn-secundario mt-3" (click)="reintentar.emit()">
              <ti-icono nombre="refresh" class="size-4" /> Reintentar
            </button>
          </div>
        </div>
      }
      @default {
        <ng-content />
      }
    }
  `,
})
export class EstadoCargaComponent {
  readonly fase = input.required<FaseCarga>();
  readonly textoCargando = input('Cargando…');
  readonly textoVacio = input('No hay nada por aquí todavía.');
  readonly textoError = input('No se pudo cargar la información.');
  readonly reintentar = output<void>();
}
