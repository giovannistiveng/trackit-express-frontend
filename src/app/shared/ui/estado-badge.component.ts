import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EstadoEnvio } from '../../core/domain';

const ESTILOS: Record<EstadoEnvio, string> = {
  Pendiente: 'bg-aviso-suave text-placa-oscuro border-placa/60',
  Asignado: 'bg-monte-suave text-monte border-monte/30',
  'En Ruta': 'bg-monte text-white border-monte',
  Entregado: 'bg-exito-suave text-exito border-exito/30',
};

@Component({
  selector: 'ti-estado-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-semibold"
    [class]="clase()"
  >
    <span class="size-2 rounded-full bg-current" aria-hidden="true"></span>{{ estado() }}</span
  >`,
})
export class EstadoBadgeComponent {
  readonly estado = input.required<EstadoEnvio>();
  protected readonly clase = computed(() => ESTILOS[this.estado()]);
}
