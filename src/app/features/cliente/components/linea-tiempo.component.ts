import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CambioEstado, ESTADOS_ENVIO, EstadoEnvio } from '../../../core/domain';
import { FechaLocalPipe } from '../../../shared/pipes/fecha-local.pipe';

const DESCRIPCION: Record<EstadoEnvio, string> = {
  Pendiente: 'Solicitud recibida, buscando conductor',
  Asignado: 'Un conductor aceptó el servicio',
  'En Ruta': 'El conductor va en camino',
  Entregado: 'Paquete entregado con PIN',
};

/** Recorrido del envío como una ruta vertical: paradas cumplidas, la actual y las que faltan. */
@Component({
  selector: 'ti-linea-tiempo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FechaLocalPipe],
  template: `
    <ol class="relative" aria-label="Recorrido del envío">
      @for (p of paradas(); track p.estado; let ultimo = $last) {
        <li
          class="relative flex gap-4 pb-7 last:pb-0"
          [attr.aria-current]="p.actual ? 'step' : null"
        >
          @if (!ultimo) {
            <span
              class="absolute left-[11px] top-6 h-[calc(100%-1rem)] w-[3px]"
              [class]="
                p.cumplida && !p.actual
                  ? 'bg-monte'
                  : 'bg-[repeating-linear-gradient(to_bottom,var(--color-linea)_0_6px,transparent_6px_11px)]'
              "
              aria-hidden="true"
            ></span>
          }
          <span
            class="relative z-10 mt-0.5 grid size-[25px] shrink-0 place-items-center rounded-full border-[3px]"
            [class]="
              p.actual
                ? 'border-tinta bg-placa'
                : p.cumplida
                  ? 'border-monte bg-monte'
                  : 'border-linea bg-papel'
            "
            aria-hidden="true"
          >
            @if (p.cumplida && !p.actual) {
              <span class="text-xs font-bold text-white">✓</span>
            }
          </span>
          <div class="min-w-0">
            <p class="font-bold" [class.text-piedra]="!p.cumplida">
              {{ p.estado }}
              @if (p.actual) {
                <span class="sr-only"> (estado actual)</span>
              }
            </p>
            <p class="text-sm text-piedra">{{ descripcion[p.estado] }}</p>
            @if (p.fecha) {
              <p class="numeros mt-0.5 text-sm font-medium">
                <time [attr.datetime]="p.fecha.toISOString()">{{ p.fecha | fechaLocal }}</time>
              </p>
            }
          </div>
        </li>
      }
    </ol>
  `,
})
export class LineaTiempoComponent {
  /** Historial cronológico (más antiguo primero). */
  readonly historial = input.required<CambioEstado[]>();
  readonly estadoActual = input.required<EstadoEnvio>();
  /** Si es false, "En Ruta" no aparece como parada esperada (el backend aún no la produce). */
  readonly conEnRuta = input(true);
  protected readonly descripcion = DESCRIPCION;

  protected readonly paradas = computed(() => {
    const historial = this.historial();
    const actual = this.estadoActual();
    const indiceActual = ESTADOS_ENVIO.indexOf(actual);
    return ESTADOS_ENVIO.filter(
      (e) => this.conEnRuta() || e !== 'En Ruta' || historial.some((h) => h.estado === 'En Ruta'),
    ).map((estado) => {
      const cambio = [...historial].reverse().find((h) => h.estado === estado);
      const cumplida = !!cambio || ESTADOS_ENVIO.indexOf(estado) <= indiceActual;
      return { estado, fecha: cambio?.fecha ?? null, cumplida, actual: estado === actual };
    });
  });
}
