import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  input,
  output,
  viewChild,
} from '@angular/core';

const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let contador = 0;

/** Diálogo modal accesible: foco atrapado, cierre con Escape y devolución del foco al cerrar. */
@Component({
  selector: 'ti-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'fixed inset-0 z-40 flex items-end justify-center bg-tinta/60 p-0 sm:items-center sm:p-4',
    '(document:keydown)': 'alTeclear($event)',
    '(click)': 'alFondo($event)',
  },
  template: `
    <div
      #panel
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="idTitulo"
      class="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-papel p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl sm:p-6"
    >
      <div class="mb-4 flex items-start justify-between gap-4">
        <h2 [id]="idTitulo">{{ titulo() }}</h2>
        @if (cerrable()) {
          <button
            type="button"
            class="-m-2 min-h-11 min-w-11 rounded-lg text-xl text-piedra hover:text-tinta"
            (click)="cerrar.emit()"
            aria-label="Cerrar"
          >
            ✕
          </button>
        }
      </div>
      <ng-content />
    </div>
  `,
})
export class ModalComponent implements AfterViewInit, OnDestroy {
  readonly titulo = input.required<string>();
  readonly cerrable = input(true);
  readonly cerrar = output<void>();
  protected readonly idTitulo = `modal-titulo-${++contador}`;
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly focoPrevio =
    typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

  ngAfterViewInit(): void {
    const primero = this.enfocables()[0];
    (primero ?? this.panel().nativeElement).focus();
  }

  ngOnDestroy(): void {
    this.focoPrevio?.focus?.();
  }

  protected alTeclear(ev: KeyboardEvent): void {
    if (ev.key === 'Escape' && this.cerrable()) {
      ev.preventDefault();
      this.cerrar.emit();
      return;
    }
    if (ev.key !== 'Tab') return;
    const lista = this.enfocables();
    if (lista.length === 0) return;
    const primero = lista[0];
    const ultimo = lista[lista.length - 1];
    if (ev.shiftKey && document.activeElement === primero) {
      ev.preventDefault();
      ultimo.focus();
    } else if (!ev.shiftKey && document.activeElement === ultimo) {
      ev.preventDefault();
      primero.focus();
    }
  }

  protected alFondo(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget && this.cerrable()) this.cerrar.emit();
  }

  private enfocables(): HTMLElement[] {
    return Array.from(this.panel().nativeElement.querySelectorAll<HTMLElement>(ENFOCABLES));
  }
}
