import { ChangeDetectionStrategy, Component, inject, input, linkedSignal } from '@angular/core';
import { PlacaComponent } from '../../../shared/ui/placa.component';
import { ToastService } from '../../../shared/ui/toast.service';

/** PIN del envío con forma de placa, botón para copiar y (opcional) ocultarlo. */
@Component({
  selector: 'ti-pin-envio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlacaComponent],
  template: `
    <div class="flex flex-wrap items-center gap-3">
      @if (visible()) {
        <ti-placa
          [valor]="pin()"
          etiqueta="PIN de entrega"
          pie="PIN DE ENTREGA"
          [tamano]="tamano()"
        />
      } @else {
        <ti-placa valor="••••" etiqueta="PIN oculto" pie="PIN DE ENTREGA" [tamano]="tamano()" />
      }
      <div class="flex gap-2">
        @if (ocultable()) {
          <button
            type="button"
            class="btn-secundario"
            [attr.aria-pressed]="visible()"
            (click)="visible.set(!visible())"
          >
            {{ visible() ? 'Ocultar PIN' : 'Mostrar PIN' }}
          </button>
        }
        <button type="button" class="btn-secundario" (click)="copiar()">Copiar PIN</button>
      </div>
    </div>
  `,
})
export class PinEnvioComponent {
  readonly pin = input.required<string>();
  readonly ocultable = input(false);
  readonly tamano = input<'grande' | 'normal' | 'pequeno'>('normal');
  protected readonly visible = linkedSignal(() => !this.ocultable());
  private readonly toast = inject(ToastService);

  async copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.pin());
      this.toast.exito('PIN copiado');
    } catch {
      this.toast.error('No se pudo copiar. Anota el PIN a mano.');
    }
  }
}
