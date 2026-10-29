import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

/** Teclado numérico de 4 dígitos, enmascarado. Acepta también el teclado físico. */
@Component({
  selector: 'ti-teclado-pin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex justify-center gap-3"
      tabindex="0"
      role="group"
      [attr.aria-label]="etiqueta() + '. ' + valor().length + ' de 4 dígitos escritos'"
      (keydown)="alTeclear($event)"
    >
      @for (i of posiciones; track i) {
        <span
          class="numeros grid size-14 place-items-center rounded-lg border-2 text-3xl font-extrabold"
          [class.border-marca]="i === valor().length"
          [class.border-linea]="i !== valor().length"
          aria-hidden="true"
          >{{ i < valor().length ? '•' : '' }}</span
        >
      }
    </div>
    <div class="mx-auto mt-4 grid max-w-72 grid-cols-3 gap-2">
      @for (d of digitos; track d) {
        <button
          type="button"
          class="btn-secundario h-14 text-2xl"
          [disabled]="deshabilitado() || lleno()"
          (click)="agregar(d)"
        >
          {{ d }}
        </button>
      }
      <button
        type="button"
        class="btn-texto h-14 justify-center"
        [disabled]="deshabilitado() || valor().length === 0"
        (click)="limpiar()"
      >
        Limpiar
      </button>
      <button
        type="button"
        class="btn-secundario h-14 text-2xl"
        [disabled]="deshabilitado() || lleno()"
        (click)="agregar('0')"
      >
        0
      </button>
      <button
        type="button"
        class="btn-secundario h-14"
        [disabled]="deshabilitado() || valor().length === 0"
        (click)="borrar()"
        aria-label="Borrar último dígito"
      >
        ⌫
      </button>
    </div>
  `,
})
export class TecladoPinComponent {
  readonly valor = model('');
  readonly etiqueta = input('PIN de entrega');
  readonly deshabilitado = input(false);
  protected readonly posiciones = [0, 1, 2, 3];
  protected readonly digitos = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  protected readonly lleno = computed(() => this.valor().length >= 4);

  agregar(d: string): void {
    if (!/^\d$/.test(d) || this.lleno() || this.deshabilitado()) return;
    this.valor.update((v) => v + d);
  }
  borrar(): void {
    this.valor.update((v) => v.slice(0, -1));
  }
  limpiar(): void {
    this.valor.set('');
  }

  protected alTeclear(ev: KeyboardEvent): void {
    if (/^\d$/.test(ev.key)) {
      ev.preventDefault();
      this.agregar(ev.key);
    } else if (ev.key === 'Backspace') {
      ev.preventDefault();
      this.borrar();
    }
  }
}
