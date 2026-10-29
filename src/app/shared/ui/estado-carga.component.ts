import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type FaseCarga = 'cargando' | 'vacio' | 'error' | 'listo';

/** Envoltorio de los cuatro estados de una pantalla con datos. */
@Component({
  selector: 'ti-estado-carga',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (fase()) {
      @case ('cargando') {
        <div class="space-y-3" role="status" aria-live="polite">
          <span class="sr-only">{{ textoCargando() }}</span>
          @for (i of [1, 2, 3]; track i) {
            <div class="h-20 animate-pulse rounded-xl bg-linea/60" aria-hidden="true"></div>
          }
        </div>
      }
      @case ('vacio') {
        <div class="rounded-xl border border-dashed border-linea px-5 py-8 text-center">
          <p class="font-semibold">{{ textoVacio() }}</p>
          <ng-content select="[vacio]" />
        </div>
      }
      @case ('error') {
        <div class="rounded-xl border border-alerta/30 bg-alerta-suave px-5 py-6" role="alert">
          <p class="font-semibold text-alerta">{{ textoError() }}</p>
          <button type="button" class="btn-secundario mt-3" (click)="reintentar.emit()">
            Reintentar
          </button>
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
