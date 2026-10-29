import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Zona } from '../../core/domain';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { AdminOperationsPort, LoggerPort, ZonesPort } from '../../core/ports';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { EstadoCargaComponent, FaseCarga } from '../../shared/ui/estado-carga.component';
import { IconoComponent } from '../../shared/ui/icono.component';
import { ToastService } from '../../shared/ui/toast.service';

export const TARIFA_MAXIMA = 1_000_000;

/** Administración: tarifa base de cada zona (afecta solo a las cotizaciones nuevas). */
@Component({
  selector: 'ti-zonas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, CopPipe, EstadoCargaComponent, IconoComponent],
  template: `
    <div class="contenedor">
      <h1>Zonas y tarifas</h1>
      <p class="mt-1 text-piedra">
        La tarifa de un envío es la base de su zona más $ 1.000 por kilómetro. Los cambios aplican a
        las cotizaciones nuevas.
      </p>
      <ti-estado-carga
        class="mt-6 block"
        [fase]="fase()"
        [textoError]="error()"
        (reintentar)="cargar()"
      >
        <ul class="space-y-3">
          @for (z of zonas(); track z.id) {
            <li class="tarjeta flex flex-wrap items-center gap-4 p-4 sm:p-5">
              <span class="grid size-11 place-items-center rounded-xl bg-marca-suave text-marca"
                ><ti-icono nombre="map-pin"
              /></span>
              <div class="min-w-36 flex-1">
                <p class="font-semibold">{{ z.nombre }}</p>
                <p class="text-sm text-piedra">Actual: {{ z.tarifaBase | cop }}</p>
              </div>
              <form class="flex items-end gap-2" (ngSubmit)="guardar(z)">
                <div>
                  <label [for]="'tarifa-' + z.id" class="etiqueta text-xs">Nueva tarifa base</label>
                  <div class="relative">
                    <span
                      class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-piedra"
                      >$</span
                    >
                    <input
                      [id]="'tarifa-' + z.id"
                      [name]="'tarifa-' + z.id"
                      type="number"
                      min="0"
                      [max]="maxima"
                      step="500"
                      inputmode="numeric"
                      class="campo numeros w-36 pl-7"
                      [ngModel]="borradores()[z.id]"
                      (ngModelChange)="editar(z.id, $event)"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  class="btn-primario"
                  [disabled]="!cambio(z) || guardando() === z.id"
                  [attr.aria-label]="'Guardar la tarifa de ' + z.nombre"
                >
                  <ti-icono
                    [nombre]="guardando() === z.id ? 'loader' : 'save'"
                    [class]="guardando() === z.id ? 'animate-spin' : ''"
                  />
                  <span class="hidden sm:inline">Guardar</span>
                </button>
              </form>
            </li>
          }
        </ul>
      </ti-estado-carga>
    </div>
  `,
})
export class ZonasPage implements OnInit {
  private readonly zonasPort = inject(ZonesPort);
  private readonly ops = inject(AdminOperationsPort);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerPort);

  protected readonly maxima = TARIFA_MAXIMA;
  protected readonly zonas = signal<Zona[]>([]);
  protected readonly borradores = signal<Record<number, number>>({});
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly guardando = signal<number | null>(null);
  protected readonly fase = computed<FaseCarga>(() =>
    this.cargando() ? 'cargando' : this.error() ? 'error' : 'listo',
  );

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      const z = await this.zonasPort.listar();
      this.zonas.set(z);
      this.borradores.set(Object.fromEntries(z.map((x) => [x.id, x.tarifaBase])));
    } catch (e) {
      this.error.set(this.mapper.traducir(e));
    } finally {
      this.cargando.set(false);
    }
  }

  protected editar(id: number, valor: number | string): void {
    this.borradores.update((b) => ({ ...b, [id]: Number(valor) }));
  }

  protected cambio(z: Zona): boolean {
    const v = this.borradores()[z.id];
    return Number.isFinite(v) && v >= 0 && v <= TARIFA_MAXIMA && v !== z.tarifaBase;
  }

  async guardar(z: Zona): Promise<void> {
    if (!this.cambio(z) || this.guardando() !== null) return;
    this.guardando.set(z.id);
    try {
      const nueva = await this.ops.actualizarTarifa(z.id, this.borradores()[z.id]);
      this.zonas.update((l) => l.map((x) => (x.id === nueva.id ? nueva : x)));
      this.borradores.update((b) => ({ ...b, [nueva.id]: nueva.tarifaBase }));
      this.log.info('Admin', `Tarifa de ${nueva.nombre} actualizada`);
      this.toast.exito(`Tarifa de ${nueva.nombre} actualizada`);
    } catch (e) {
      this.toast.error(this.mapper.traducir(e));
    } finally {
      this.guardando.set(null);
    }
  }
}
