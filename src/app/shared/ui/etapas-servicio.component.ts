import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Etapa, PASOS_SERVICIO, TEXTO_ETAPA, indicePaso } from '../../core/domain';
import { IconoComponent, NombreIcono } from './icono.component';

const ICONO_PASO: Record<Etapa, NombreIcono> = {
  buscando_conductor: 'radar',
  yendo_a_recoger: 'navigation',
  en_recogida: 'key',
  en_camino: 'truck',
  regresando: 'repeat',
  en_destino: 'map-pin',
  entregado: 'package-check',
  cancelado: 'circle-x',
};

function estadoPaso(i: number, actual: number, terminado: boolean) {
  if (i < actual || terminado) return 'hecho' as const;
  return i === actual ? ('actual' as const) : ('pendiente' as const);
}

/**
 * Pasos del servicio, iguales para el cliente, el conductor y quien recibe. Cada uno ve en el
 * paso actual qué le toca hacer a él.
 */
@Component({
  selector: 'ti-etapas-servicio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    @if (etapa() === 'cancelado') {
      <p
        class="flex items-center gap-2 rounded-2xl bg-alerta-suave px-4 py-3 font-semibold text-alerta"
      >
        <ti-icono nombre="circle-x" /> Este servicio fue cancelado.
      </p>
    } @else {
      <ol class="relative space-y-0" [attr.aria-label]="'Avance: ' + textoActual().titulo">
        @for (p of pasos(); track p.etapa; let ultimo = $last) {
          <li
            class="relative flex gap-3 pb-4"
            [attr.aria-current]="p.estado === 'actual' ? 'step' : null"
          >
            @if (!ultimo) {
              <span
                class="absolute left-[15px] top-8 h-[calc(100%-1.75rem)] w-0.5"
                [class]="p.estado === 'hecho' ? 'bg-marca' : 'bg-linea'"
                aria-hidden="true"
              ></span>
            }
            <span
              class="relative grid size-8 shrink-0 place-items-center rounded-full border-2"
              [class]="clasesCirculo(p.estado)"
              aria-hidden="true"
            >
              <ti-icono [nombre]="p.estado === 'hecho' ? 'check' : p.icono" class="size-4" />
            </span>
            <div class="min-w-0 pt-1">
              <p
                class="text-sm font-semibold leading-tight"
                [class.text-piedra]="p.estado === 'pendiente'"
              >
                {{ p.titulo }}
                @if (p.estado === 'hecho') {
                  <span class="sr-only">(hecho)</span>
                }
              </p>
              @if (p.estado === 'actual') {
                <p class="mt-0.5 text-sm text-piedra">{{ p.texto }}</p>
              }
            </div>
          </li>
        }
      </ol>
    }
  `,
})
export class EtapasServicioComponent {
  readonly etapa = input.required<Etapa>();
  /** Quién mira: cambia el texto del paso actual. */
  readonly rol = input<'cliente' | 'conductor'>('cliente');
  readonly idaYVuelta = input(false);

  protected readonly textoActual = computed(() => TEXTO_ETAPA[this.etapa()]);
  protected readonly pasos = computed(() => {
    const actual = indicePaso(this.etapa());
    const rol = this.rol();
    return PASOS_SERVICIO.map((e, i) => {
      // De regreso en ida y vuelta: el paso "En camino" muestra ese texto
      const etapaMostrada = this.etapa() === 'regresando' && e === 'en_camino' ? 'regresando' : e;
      const t = TEXTO_ETAPA[etapaMostrada];
      return {
        etapa: e,
        titulo: t.titulo,
        texto: rol === 'cliente' ? t.cliente : t.conductor,
        icono: ICONO_PASO[etapaMostrada],
        estado: estadoPaso(i, actual, this.etapa() === 'entregado'),
      } as const;
    });
  });

  protected clasesCirculo(estado: 'hecho' | 'actual' | 'pendiente'): string {
    if (estado === 'hecho') return 'border-marca bg-marca text-white';
    if (estado === 'actual') return 'border-marca bg-papel text-marca ring-4 ring-marca/15';
    return 'border-linea bg-papel text-piedra';
  }
}
