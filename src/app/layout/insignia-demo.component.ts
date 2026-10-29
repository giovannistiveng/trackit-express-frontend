import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DemoModeService } from '../core/config/demo-mode.service';
import { LoggerService } from '../core/logging/logger.service';

/** Solo en desarrollo: indica qué funciones usan adaptador simulado y permite descargar el log. */
@Component({
  selector: 'ti-insignia-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (demo.mostrarInsignia && demo.simulados().length > 0) {
      <div class="contenedor-ancho pb-4 pt-2">
        @if (abierta()) {
          <div
            id="panel-demo"
            class="mb-2 max-w-sm rounded-xl border border-linea bg-papel p-4 text-sm shadow-xl"
          >
            <p class="font-bold">Modo demo</p>
            <p class="mt-1 text-piedra">
              Estas funciones aún no tienen endpoint y usan datos simulados o locales:
            </p>
            <ul class="mt-2 list-disc space-y-0.5 pl-5">
              @for (s of demo.simulados(); track s.flag) {
                <li>{{ s.descripcion }}</li>
              }
            </ul>
            <button type="button" class="btn-secundario mt-3 w-full" (click)="logger.descargar()">
              Descargar log (.txt)
            </button>
          </div>
        }
        <button
          type="button"
          class="min-h-8 rounded-full border border-placa-oscuro/40 bg-aviso-suave px-3 py-1 text-xs font-bold text-placa-oscuro"
          [attr.aria-expanded]="abierta()"
          aria-controls="panel-demo"
          (click)="abierta.set(!abierta())"
        >
          Modo demo
        </button>
      </div>
    }
  `,
})
export class InsigniaDemoComponent {
  protected readonly demo = inject(DemoModeService);
  protected readonly logger = inject(LoggerService);
  protected readonly abierta = signal(false);
}
