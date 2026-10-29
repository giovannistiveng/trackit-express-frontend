import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  model,
  viewChildren,
} from '@angular/core';

/** Calificación de 1 a 5 como radiogroup accesible (flechas para moverse). */
@Component({
  selector: 'ti-estrellas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="radiogroup" [attr.aria-label]="etiqueta()" class="flex gap-1">
      @for (n of valores; track n) {
        <button
          #estrella
          type="button"
          role="radio"
          [attr.aria-checked]="valor() === n"
          [attr.aria-label]="n + (n === 1 ? ' estrella' : ' estrellas')"
          [tabindex]="(valor() || 1) === n ? 0 : -1"
          [disabled]="deshabilitado()"
          class="grid size-12 place-items-center rounded-lg text-4xl leading-none transition-transform hover:scale-110"
          [class.text-placa]="n <= valor()"
          [class.text-linea]="n > valor()"
          (click)="elegir(n)"
          (keydown)="alTeclear($event)"
        >
          <span aria-hidden="true">★</span>
        </button>
      }
    </div>
  `,
})
export class EstrellasComponent {
  readonly valor = model(0);
  readonly etiqueta = input('Calificación');
  readonly deshabilitado = input(false);
  protected readonly valores = [1, 2, 3, 4, 5];
  private readonly botones = viewChildren<ElementRef<HTMLButtonElement>>('estrella');

  elegir(n: number): void {
    this.valor.set(Math.min(5, Math.max(1, n)));
  }

  protected alTeclear(ev: KeyboardEvent): void {
    const actual = this.valor() || 0;
    let siguiente: number | null = null;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') siguiente = Math.min(5, actual + 1);
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') siguiente = Math.max(1, actual - 1);
    else if (ev.key === 'Home') siguiente = 1;
    else if (ev.key === 'End') siguiente = 5;
    if (siguiente === null) return;
    ev.preventDefault();
    this.elegir(siguiente);
    this.botones()[siguiente - 1]?.nativeElement.focus();
  }
}
