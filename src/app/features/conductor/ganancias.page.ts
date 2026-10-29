import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Envio, ResumenConductor } from '../../core/domain';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { DriverStatsPort } from '../../core/ports';
import { ContadorDirective } from '../../shared/directives/contador.directive';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { FechaLocalPipe } from '../../shared/pipes/fecha-local.pipe';
import { EstadoBadgeComponent } from '../../shared/ui/estado-badge.component';
import { EstadoCargaComponent, FaseCarga } from '../../shared/ui/estado-carga.component';
import { IconoComponent } from '../../shared/ui/icono.component';

const MESES = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });

/** Ganancias del conductor: resumen del mes, total, reputación y servicios terminados. */
@Component({
  selector: 'ti-ganancias',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CopPipe,
    FechaLocalPipe,
    IconoComponent,
    EstadoBadgeComponent,
    EstadoCargaComponent,
    ContadorDirective,
  ],
  template: `
    <div class="contenedor-ancho max-w-4xl">
      <h1>Mis ganancias</h1>
      <p class="mt-1 text-piedra">Recibes el 80 % de la tarifa de cada servicio que entregas.</p>

      <ti-estado-carga
        class="mt-6 block"
        [fase]="fase()"
        [textoError]="error()"
        (reintentar)="cargar()"
      >
        @if (resumen(); as r) {
          <section
            class="relative overflow-hidden rounded-3xl bg-noche p-6 text-white shadow-[var(--shadow-elevada)] animate-[var(--animate-aparecer)] sm:p-8"
          >
            <div
              class="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-marca/40 blur-3xl"
              aria-hidden="true"
            ></div>
            <p class="relative text-sm font-semibold text-white/70">Ganancias de {{ mes }}</p>
            <p
              class="numeros relative mt-1 text-4xl font-extrabold sm:text-5xl"
              style="font-stretch: 112%"
            >
              $ <span [tiContador]="r.ingresosMes"></span>
            </p>
            <p class="relative mt-2 text-sm text-white/70">
              En total llevas <strong class="text-white">{{ r.ingresosTotal | cop }}</strong>
            </p>
          </section>

          <dl class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div class="tarjeta p-4">
              <dt class="flex items-center gap-1.5 text-xs font-semibold text-piedra">
                <ti-icono nombre="package-check" class="size-4 text-exito" /> Entregas
              </dt>
              <dd class="numeros mt-1 text-2xl font-extrabold">
                <span [tiContador]="r.completados"></span>
              </dd>
            </div>
            <div class="tarjeta p-4">
              <dt class="flex items-center gap-1.5 text-xs font-semibold text-piedra">
                <ti-icono nombre="star" class="size-4 text-placa-oscuro" /> Calificación
              </dt>
              <dd class="numeros mt-1 text-2xl font-extrabold">
                {{ r.calificacionPromedio ?? '—' }}
              </dd>
              <dd class="text-xs text-piedra">
                {{ r.totalCalificaciones }}
                {{ r.totalCalificaciones === 1 ? 'opinión' : 'opiniones' }}
              </dd>
            </div>
            <div class="tarjeta col-span-2 p-4 sm:col-span-1">
              <dt class="flex items-center gap-1.5 text-xs font-semibold text-piedra">
                <ti-icono nombre="trending-up" class="size-4 text-marca" /> Promedio por entrega
              </dt>
              <dd class="numeros mt-1 text-2xl font-extrabold">{{ promedio() | cop }}</dd>
            </div>
          </dl>

          @if (r.servicioActivo) {
            <a
              [routerLink]="['/conductor/servicio', r.servicioActivo]"
              class="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-marca p-4 font-semibold text-white"
            >
              <span class="flex items-center gap-2"
                ><ti-icono nombre="navigation" /> Tienes el servicio #{{ r.servicioActivo }} en
                curso</span
              >
              <ti-icono nombre="chevron-right" />
            </a>
          }

          <h2 class="mt-10">Servicios terminados</h2>
          @if (historial().length === 0) {
            <div class="mt-4 rounded-2xl border border-dashed border-linea px-5 py-10 text-center">
              <p class="font-semibold">Aún no has terminado servicios.</p>
              <a routerLink="/conductor/tablero" class="btn-texto mt-2"
                >Ver servicios disponibles</a
              >
            </div>
          } @else {
            <ul class="mt-4 space-y-3">
              @for (e of historial(); track e.id; let i = $index) {
                <li
                  class="tarjeta p-4 animate-[var(--animate-aparecer)] sm:p-5"
                  [style.animation-delay.ms]="i * 40"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-sm text-piedra">
                        #{{ e.id }} · {{ e.tipoCarga }}
                        @if (e.fechaUltimoCambio) {
                          · {{ e.fechaUltimoCambio | fechaLocal }}
                        }
                      </p>
                      <p class="mt-1 flex flex-wrap items-center gap-x-2 font-semibold">
                        {{ e.origen }}
                        <ti-icono nombre="arrow-right" class="size-4 text-marca" etiqueta="hacia" />
                        {{ e.destino }}
                      </p>
                    </div>
                    <div class="text-right">
                      <ti-estado-badge [estado]="e.estado" />
                      @if (e.estado === 'Entregado') {
                        <p class="numeros mt-1 font-extrabold text-bosque">
                          + {{ e.gananciaConductor ?? e.tarifa | cop }}
                        </p>
                      }
                    </div>
                  </div>
                  @if (e.calificacion) {
                    <div class="mt-3 rounded-xl bg-crema p-3 text-sm">
                      <p
                        class="font-semibold text-placa-oscuro"
                        [attr.aria-label]="e.calificacion + ' de 5 estrellas'"
                      >
                        {{ estrellas(e.calificacion) }}
                      </p>
                      @if (e.comentario) {
                        <p class="mt-1 text-piedra">“{{ e.comentario }}”</p>
                      }
                    </div>
                  }
                </li>
              }
            </ul>
          }
        }
      </ti-estado-carga>
    </div>
  `,
})
export class GananciasPage implements OnInit {
  private readonly stats = inject(DriverStatsPort);
  private readonly mapper = inject(ErrorMessageMapper);

  protected readonly resumen = signal<ResumenConductor | null>(null);
  protected readonly historial = signal<Envio[]>([]);
  protected readonly error = signal('');
  protected readonly cargando = signal(true);
  protected readonly mes = MESES.format(new Date());
  protected readonly fase = computed<FaseCarga>(() =>
    this.cargando() ? 'cargando' : this.error() ? 'error' : 'listo',
  );
  protected readonly promedio = computed(() => {
    const r = this.resumen();
    return r && r.completados > 0 ? Math.round(r.ingresosTotal / r.completados) : 0;
  });

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      const [r, h] = await Promise.all([this.stats.resumen(), this.stats.historial()]);
      this.resumen.set(r);
      this.historial.set(h);
    } catch (e) {
      this.error.set(this.mapper.traducir(e));
    } finally {
      this.cargando.set(false);
    }
  }

  protected estrellas(n: number): string {
    const e = Math.round(n);
    return '★'.repeat(e) + '☆'.repeat(5 - e);
  }
}
