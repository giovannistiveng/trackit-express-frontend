import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CambioEstado, EstadoEnvio, RECORRIDO_ENVIO } from '../../../core/domain';
import { FechaLocalPipe } from '../../../shared/pipes/fecha-local.pipe';
import { IconoComponent } from '../../../shared/ui/icono.component';

const DESCRIPCION: Record<EstadoEnvio, string> = {
  Pendiente: 'Solicitud recibida, buscando conductor',
  Asignado: 'Un conductor aceptó el servicio',
  'En Ruta': 'El conductor va en camino',
  Entregado: 'Paquete entregado con PIN',
  Cancelado: 'El envío se canceló',
};

/** Recorrido del envío como una ruta vertical: paradas cumplidas, la actual y las que faltan. */
@Component({
  selector: 'ti-linea-tiempo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FechaLocalPipe, IconoComponent],
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
                  ? 'bg-marca'
                  : 'bg-[repeating-linear-gradient(to_bottom,var(--color-linea)_0_6px,transparent_6px_11px)]'
              "
              aria-hidden="true"
            ></span>
          }
          <span
            class="relative z-10 mt-0.5 grid size-[25px] shrink-0 place-items-center rounded-full border-[3px]"
            [class]="
              p.estado === 'Cancelado'
                ? 'border-alerta bg-alerta text-white'
                : p.actual
                  ? 'border-tinta bg-placa'
                  : p.cumplida
                    ? 'border-marca bg-marca text-white'
                    : 'border-linea bg-papel'
            "
            aria-hidden="true"
          >
            @if (p.estado === 'Cancelado') {
              <ti-icono nombre="x" class="size-3.5" />
            } @else if (p.cumplida && !p.actual) {
              <ti-icono nombre="check" class="size-3.5" />
            } @else if (p.actual && p.estado !== 'Entregado') {
              <span class="size-2 animate-ping rounded-full bg-tinta"></span>
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
  protected readonly descripcion = DESCRIPCION;

  protected readonly paradas = computed(() => {
    const historial = this.historial();
    const actual = this.estadoActual();
    const fechaDe = (estado: EstadoEnvio) =>
      [...historial].reverse().find((h) => h.estado === estado)?.fecha ?? null;
    if (actual === 'Cancelado') {
      // Solo las paradas que alcanzó, y al final la cancelación
      const alcanzadas = RECORRIDO_ENVIO.filter((e) => e === 'Pendiente' || fechaDe(e));
      return [
        ...alcanzadas.map((estado) => ({
          estado: estado as EstadoEnvio,
          fecha: fechaDe(estado),
          cumplida: true,
          actual: false,
        })),
        {
          estado: 'Cancelado' as EstadoEnvio,
          fecha: fechaDe('Cancelado'),
          cumplida: true,
          actual: true,
        },
      ];
    }
    const indiceActual = RECORRIDO_ENVIO.indexOf(actual);
    return RECORRIDO_ENVIO.map((estado) => {
      const fecha = fechaDe(estado);
      const cumplida = !!fecha || RECORRIDO_ENVIO.indexOf(estado) <= indiceActual;
      return { estado: estado as EstadoEnvio, fecha, cumplida, actual: estado === actual };
    });
  });
}
