import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EstadoEnvio } from '../../core/domain';

const ESTILOS: Record<EstadoEnvio, string> = {
  Pendiente: 'bg-aviso-suave text-placa-oscuro border-placa/60',
  Asignado: 'bg-marca-suave text-marca border-marca/30',
  'En Ruta': 'bg-marca text-white border-marca',
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
