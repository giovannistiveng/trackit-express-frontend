import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';

export type TipoToast = 'exito' | 'error' | 'info';
export interface Toast {
  id: number;
  tipo: TipoToast;
  texto: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private siguiente = 1;

  mostrar(texto: string, tipo: TipoToast = 'info', duracionMs = 5000): void {
    const id = this.siguiente++;
    this.toasts.update((t) => [...t, { id, tipo, texto }]);
    setTimeout(() => this.cerrar(id), duracionMs);
  }
  exito(texto: string): void {
    this.mostrar(texto, 'exito');
  }
  error(texto: string): void {
    this.mostrar(texto, 'error', 7000);
  }
  cerrar(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}

/** Región aria-live con los avisos. Se coloca una sola vez en el shell. */
@Component({
  selector: 'ti-toasts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="pointer-events-none fixed inset-x-0 bottom-[4.5rem] z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6"
      aria-live="polite"
      role="status"
    >
      @for (t of servicio.toasts(); track t.id) {
        <div
          class="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg px-4 py-3 text-sm font-medium shadow-lg"
          [class]="
            t.tipo === 'exito'
              ? 'bg-monte text-white'
              : t.tipo === 'error'
                ? 'bg-alerta text-white'
                : 'bg-tinta text-white'
          "
        >
          <span class="flex-1">{{ t.texto }}</span>
          <button
            type="button"
            class="-m-1 min-h-8 min-w-8 rounded opacity-80 hover:opacity-100"
            (click)="servicio.cerrar(t.id)"
            aria-label="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastsComponent {
  protected readonly servicio = inject(ToastService);
}
