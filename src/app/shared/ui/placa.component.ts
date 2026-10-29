import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Muestra un valor corto (PIN o placa) con la forma de una placa colombiana:
 * fondo amarillo, borde negro y caracteres anchos.
 */
@Component({
  selector: 'ti-placa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="numeros inline-flex flex-col items-center rounded-md border-[3px] border-tinta bg-placa font-extrabold leading-none text-tinta shadow-[inset_0_0_0_2px_rgba(23,33,28,0.15)]"
      [class]="clases()"
      [attr.aria-label]="etiqueta() + ': ' + valorLegible()"
      role="img"
    >
      <span aria-hidden="true" [style.letter-spacing]="'0.14em'" [style.font-stretch]="'118%'">{{
        valor()
      }}</span>
      @if (pie()) {
        <span aria-hidden="true" class="mt-1 text-[0.6rem] font-bold tracking-wide">{{
          pie()
        }}</span>
      }
    </span>
  `,
})
export class PlacaComponent {
  readonly valor = input.required<string>();
  readonly etiqueta = input('Valor');
  readonly pie = input<string>('');
  readonly tamano = input<'grande' | 'normal' | 'pequeno'>('normal');
  protected readonly valorLegible = computed(() => this.valor().split('').join(' '));
  protected readonly clases = computed(
    () =>
      ({
        grande: 'px-6 pt-3 pb-2 text-5xl',
        normal: 'px-4 pt-2 pb-1.5 text-2xl',
        pequeno: 'px-2 pt-1 pb-1 text-sm border-2',
      })[this.tamano()],
  );
}
