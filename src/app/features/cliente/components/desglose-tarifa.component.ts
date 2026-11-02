import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DesgloseTarifa } from '../../../core/domain';
import { CopPipe } from '../../../shared/pipes/cop.pipe';

/** Partidas del precio: banderazo, distancia, tiempo, recargos y total. */
@Component({
  selector: 'ti-desglose-tarifa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CopPipe],
  template: `
    <details class="group" [open]="abierto()">
      <summary
        class="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold"
        [class]="tono() === 'oscuro' ? 'text-white/90' : 'text-tinta'"
      >
        ¿Cómo se calculó?
        <span class="transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
      </summary>
      @let d = desglose();
      <dl
        class="numeros mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm"
        [class]="tono() === 'oscuro' ? 'text-white/85' : 'text-piedra'"
      >
        <dt>Banderazo ({{ d.categoria }})</dt>
        <dd class="text-right">{{ d.banderazo | cop }}</dd>
        <dt>Distancia{{ distanciaKm() !== null ? ' · ' + distanciaKm() + ' km' : '' }}</dt>
        <dd class="text-right">{{ d.distancia | cop }}</dd>
        <dt>Tiempo{{ minutos() !== null ? ' · ' + minutos() + ' min' : '' }}</dt>
        <dd class="text-right">{{ d.tiempo | cop }}</dd>
        @if (d.minimoAplicado) {
          <dt class="col-span-2 text-xs italic">
            Viaje corto: se cobra la tarifa mínima del vehículo.
          </dt>
        }
        @if (d.recargoZona > 0) {
          <dt>Recargo de zona{{ zona() ? ' · ' + zona() : '' }}</dt>
          <dd class="text-right">{{ d.recargoZona | cop }}</dd>
        }
        @if (d.recargoNocturno > 0) {
          <dt>Recargo nocturno (20 %)</dt>
          <dd class="text-right">{{ d.recargoNocturno | cop }}</dd>
        }
        <dt
          class="border-t pt-2 font-bold"
          [class]="tono() === 'oscuro' ? 'border-white/20 text-white' : 'border-linea text-tinta'"
        >
          Total
        </dt>
        <dd
          class="border-t pt-2 text-right font-bold"
          [class]="tono() === 'oscuro' ? 'border-white/20 text-white' : 'border-linea text-tinta'"
        >
          {{ d.total | cop }}
        </dd>
      </dl>
    </details>
  `,
})
export class DesgloseTarifaComponent {
  readonly desglose = input.required<DesgloseTarifa>();
  readonly distanciaKm = input<number | null>(null);
  readonly minutos = input<number | null>(null);
  readonly zona = input<string | null>(null);
  readonly tono = input<'claro' | 'oscuro'>('claro');
  readonly abierto = input(false);
}
