import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MetricasAdmin } from '../../core/domain';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { AdminMetricsPort } from '../../core/ports';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { EstadoCargaComponent, FaseCarga } from '../../shared/ui/estado-carga.component';
import { IconoComponent, NombreIcono } from '../../shared/ui/icono.component';
import { RouterLink } from '@angular/router';

const COLOR_ESTADO: Record<string, string> = {
  Pendiente: '#f5c518',
  Asignado: '#fb923c',
  'En Ruta': '#c2410c',
  Entregado: '#1e7a46',
  Cancelado: '#a8a29e',
};
const CIRCUNFERENCIA = 2 * Math.PI * 48;

/** E7-HU2 Panel administrativo: KPI, envíos por estado (dona) y por zona. */
@Component({
  selector: 'ti-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, EstadoCargaComponent, IconoComponent, RouterLink],
  template: `
    <div class="contenedor-ancho">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Métricas de operación</h1>
          <p class="mt-1 text-piedra">Resumen en tiempo real de envíos, ingresos y conductores.</p>
        </div>
        <button type="button" class="btn-secundario" (click)="cargar()">
          <ti-icono nombre="refresh" class="size-4" /> Actualizar
        </button>
      </div>
      <div class="mt-6">
        <ti-estado-carga [fase]="fase()" [textoError]="error()" (reintentar)="cargar()">
          @if (m(); as m) {
            <dl class="grid grid-cols-2 gap-3 lg:grid-cols-4">
              @for (k of kpis(); track k.etiqueta; let i = $index) {
                <div
                  class="tarjeta p-4 animate-[var(--animate-aparecer)] sm:p-5"
                  [style.animation-delay.ms]="i * 40"
                >
                  <dt class="flex items-center justify-between gap-2 text-sm text-piedra">
                    {{ k.etiqueta }}
                    <span class="grid size-9 place-items-center rounded-xl" [class]="k.color"
                      ><ti-icono [nombre]="k.icono" class="size-[1.15rem]"
                    /></span>
                  </dt>
                  <dd
                    class="numeros mt-2 truncate text-2xl font-extrabold"
                    style="font-stretch: 112%"
                  >
                    {{ k.valor }}
                  </dd>
                </div>
              }
            </dl>

            @if (m.conductoresPendientes > 0) {
              <a
                routerLink="/admin/conductores"
                class="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-placa/60 bg-aviso-suave p-4 font-semibold"
              >
                <span class="flex items-center gap-2"
                  ><ti-icono nombre="users" class="text-placa-oscuro" />
                  {{ m.conductoresPendientes }}
                  {{ m.conductoresPendientes === 1 ? 'conductor espera' : 'conductores esperan' }}
                  aprobación</span
                >
                <ti-icono nombre="chevron-right" />
              </a>
            }

            <div class="mt-6 grid gap-6 lg:grid-cols-2">
              <section aria-labelledby="titulo-estado" class="tarjeta p-5 sm:p-6">
                <h2 id="titulo-estado">Envíos por estado</h2>
                <div class="mt-5 flex flex-col items-center gap-6 sm:flex-row">
                  <svg
                    viewBox="0 0 120 120"
                    class="size-40 shrink-0 -rotate-90"
                    role="img"
                    [attr.aria-label]="'Tasa de entrega ' + tasaEntrega() + ' %'"
                  >
                    <circle cx="60" cy="60" r="48" fill="none" stroke="#f1ebe4" stroke-width="16" />
                    @for (s of segmentos(); track s.estado) {
                      <circle
                        cx="60"
                        cy="60"
                        r="48"
                        fill="none"
                        [attr.stroke]="s.color"
                        stroke-width="16"
                        [attr.stroke-dasharray]="s.largo + ' ' + circunferencia"
                        [attr.stroke-dashoffset]="-s.inicio"
                        class="transition-all duration-700"
                      />
                    }
                    <text
                      x="60"
                      y="58"
                      text-anchor="middle"
                      transform="rotate(90 60 60)"
                      class="fill-tinta text-[22px] font-extrabold"
                    >
                      {{ tasaEntrega() }}%
                    </text>
                    <text
                      x="60"
                      y="76"
                      text-anchor="middle"
                      transform="rotate(90 60 60)"
                      class="fill-piedra text-[9px] font-semibold"
                    >
                      entregados
                    </text>
                  </svg>
                  <ul class="w-full space-y-2">
                    @for (e of m.porEstado; track e.estado) {
                      <li class="flex items-center justify-between gap-3 text-sm">
                        <span class="flex items-center gap-2 font-medium"
                          ><span
                            class="size-3 rounded-full"
                            [style.background]="colorEstado(e.estado)"
                          ></span
                          >{{ e.estado }}</span
                        >
                        <span class="numeros text-piedra"
                          ><strong class="text-tinta">{{ e.envios }}</strong> ·
                          {{
                            m.enviosTotales
                              ? ((e.envios / m.enviosTotales) * 100 | number: '1.0-0')
                              : 0
                          }}
                          %</span
                        >
                      </li>
                    }
                  </ul>
                </div>
              </section>
              <section aria-labelledby="titulo-zona" class="tarjeta p-5 sm:p-6">
                <h2 id="titulo-zona">Envíos por zona</h2>
                <ul class="mt-5 space-y-4">
                  @for (z of m.porZona; track z.zona) {
                    <li>
                      <div class="flex justify-between text-sm">
                        <span class="font-medium">{{ z.zona }}</span
                        ><span class="numeros font-semibold">{{ z.envios }}</span>
                      </div>
                      <div
                        class="mt-1.5 h-2.5 overflow-hidden rounded-full bg-niebla"
                        aria-hidden="true"
                      >
                        <div
                          class="h-full rounded-full bg-gradient-to-r from-marca to-[#ea580c] transition-[width] duration-700"
                          [style.width.%]="(z.envios / maxZona()) * 100"
                        ></div>
                      </div>
                    </li>
                  }
                </ul>
              </section>
            </div>
          }
        </ti-estado-carga>
      </div>
    </div>
  `,
})
export class DashboardPage implements OnInit {
  private readonly puerto = inject(AdminMetricsPort);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly cop = new CopPipe();

  protected readonly m = signal<MetricasAdmin | null>(null);
  protected readonly error = signal('');
  protected readonly fase = computed<FaseCarga>(() =>
    this.m() ? 'listo' : this.error() ? 'error' : 'cargando',
  );
  protected readonly maxZona = computed(() =>
    Math.max(1, ...(this.m()?.porZona.map((z) => z.envios) ?? [1])),
  );
  protected readonly maxEstado = computed(() =>
    Math.max(1, ...(this.m()?.porEstado.map((z) => z.envios) ?? [1])),
  );
  protected readonly circunferencia = CIRCUNFERENCIA;
  protected readonly tasaEntrega = computed(() => {
    const m = this.m();
    return m && m.enviosTotales ? Math.round((m.entregados / m.enviosTotales) * 100) : 0;
  });
  /** Arcos de la dona: largo y desplazamiento de cada estado sobre la circunferencia. */
  protected readonly segmentos = computed(() => {
    const m = this.m();
    if (!m || m.enviosTotales === 0) return [];
    let inicio = 0;
    return m.porEstado
      .filter((e) => e.envios > 0)
      .map((e) => {
        const largo = (e.envios / m.enviosTotales) * CIRCUNFERENCIA;
        const s = { estado: e.estado, color: COLOR_ESTADO[e.estado] ?? '#a8a29e', largo, inicio };
        inicio += largo;
        return s;
      });
  });
  protected readonly kpis = computed(() => {
    const m = this.m();
    if (!m) return [];
    const k = (etiqueta: string, valor: string, icono: NombreIcono, color: string) => ({
      etiqueta,
      valor,
      icono,
      color,
    });
    return [
      k('Envíos totales', String(m.enviosTotales), 'package', 'bg-marca-suave text-marca'),
      k('En curso', String(m.enviosActivos), 'navigation', 'bg-marca-suave text-marca'),
      k('Ingresos', this.cop.transform(m.ingresosCop), 'wallet', 'bg-bosque-suave text-bosque'),
      k(
        'Calificación promedio',
        `${m.calificacionPromedio.toFixed(1)} ★`,
        'star',
        'bg-aviso-suave text-placa-oscuro',
      ),
      k('Entregados', String(m.entregados), 'package-check', 'bg-exito-suave text-exito'),
      k('Cancelados', String(m.cancelados ?? 0), 'ban', 'bg-niebla text-piedra'),
      k(
        'Conductores aprobados',
        String(m.conductoresAprobados),
        'badge-check',
        'bg-bosque-suave text-bosque',
      ),
      k(
        'Conductores por aprobar',
        String(m.conductoresPendientes),
        'users',
        'bg-aviso-suave text-placa-oscuro',
      ),
    ];
  });

  protected colorEstado(estado: string): string {
    return COLOR_ESTADO[estado] ?? '#a8a29e';
  }

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.error.set('');
    try {
      this.m.set(await this.puerto.metricas());
    } catch (e) {
      this.error.set(this.mapper.traducir(e));
    }
  }
}
