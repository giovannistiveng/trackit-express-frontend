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

/** E7-HU2 Dashboard administrativo (simulado hasta que exista el endpoint). */
@Component({
  selector: 'ti-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, EstadoCargaComponent],
  template: `
    <div class="contenedor-ancho">
      <h1>Métricas de operación</h1>
      <div class="mt-6">
        <ti-estado-carga [fase]="fase()" [textoError]="error()" (reintentar)="cargar()">
          @if (m(); as m) {
            <dl
              class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-linea bg-linea lg:grid-cols-4"
            >
              @for (k of kpis(); track k.etiqueta) {
                <div class="bg-papel p-4">
                  <dt class="text-sm text-piedra">{{ k.etiqueta }}</dt>
                  <dd class="numeros mt-1 text-2xl font-extrabold" style="font-stretch: 112%">
                    {{ k.valor }}
                  </dd>
                </div>
              }
            </dl>

            <div class="mt-8 grid gap-8 lg:grid-cols-2">
              <section aria-labelledby="titulo-zona">
                <h2 id="titulo-zona">Envíos por zona</h2>
                <ul class="mt-4 space-y-3">
                  @for (z of m.porZona; track z.zona) {
                    <li>
                      <div class="flex justify-between text-sm">
                        <span class="font-medium">{{ z.zona }}</span
                        ><span class="numeros">{{ z.envios }}</span>
                      </div>
                      <div class="mt-1 h-3 rounded-full bg-niebla" aria-hidden="true">
                        <div
                          class="h-full rounded-full bg-marca"
                          [style.width.%]="(z.envios / maxZona()) * 100"
                        ></div>
                      </div>
                    </li>
                  }
                </ul>
              </section>
              <section aria-labelledby="titulo-estado">
                <h2 id="titulo-estado">Envíos por estado</h2>
                <ul class="mt-4 space-y-3">
                  @for (e of m.porEstado; track e.estado) {
                    <li>
                      <div class="flex justify-between text-sm">
                        <span class="font-medium">{{ e.estado }}</span
                        ><span class="numeros"
                          >{{ e.envios }} ·
                          {{ (e.envios / m.enviosTotales) * 100 | number: '1.0-0' }} %</span
                        >
                      </div>
                      <div class="mt-1 h-3 rounded-full bg-niebla" aria-hidden="true">
                        <div
                          class="h-full rounded-full"
                          [class]="
                            e.estado === 'Entregado'
                              ? 'bg-exito'
                              : e.estado === 'Pendiente'
                                ? 'bg-placa'
                                : 'bg-marca-oscuro'
                          "
                          [style.width.%]="(e.envios / maxEstado()) * 100"
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
  protected readonly kpis = computed(() => {
    const m = this.m();
    if (!m) return [];
    return [
      { etiqueta: 'Envíos totales', valor: String(m.enviosTotales) },
      { etiqueta: 'En curso', valor: String(m.enviosActivos) },
      { etiqueta: 'Ingresos', valor: this.cop.transform(m.ingresosCop) },
      { etiqueta: 'Calificación promedio', valor: `${m.calificacionPromedio.toFixed(1)} ★` },
      { etiqueta: 'Entregados', valor: String(m.entregados) },
      { etiqueta: 'Conductores aprobados', valor: String(m.conductoresAprobados) },
      { etiqueta: 'Conductores por aprobar', valor: String(m.conductoresPendientes) },
      { etiqueta: 'Zonas activas', valor: String(m.porZona.length) },
    ];
  });

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
