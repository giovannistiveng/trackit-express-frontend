import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Envio, esActivo, fechaCreacion } from '../../core/domain';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { ClientShipmentsPort } from '../../core/ports';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { FechaLocalPipe } from '../../shared/pipes/fecha-local.pipe';
import { EstadoBadgeComponent } from '../../shared/ui/estado-badge.component';
import { EstadoCargaComponent, FaseCarga } from '../../shared/ui/estado-carga.component';
import { PlacaComponent } from '../../shared/ui/placa.component';
import { PinEnvioComponent } from './components/pin-envio.component';
import { IconoComponent } from '../../shared/ui/icono.component';

type Pestana = 'activos' | 'historial';

/** E6-HU2 Historial del cliente: pestañas Activos e Historial. */
@Component({
  selector: 'ti-envios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CopPipe,
    FechaLocalPipe,
    EstadoBadgeComponent,
    EstadoCargaComponent,
    PinEnvioComponent,
    PlacaComponent,
    IconoComponent,
  ],
  template: `
    <div class="contenedor-ancho max-w-4xl">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Mis envíos</h1>
          <p class="mt-1 text-piedra">Sigue tus envíos en curso y revisa los anteriores.</p>
        </div>
        <a routerLink="/cliente/nuevo-envio" class="btn-primario"
          ><ti-icono nombre="package" /> Nuevo envío</a
        >
      </div>

      @if (!cargando() && !error() && envios().length > 0) {
        <dl class="mt-6 grid grid-cols-3 gap-3">
          <div class="tarjeta p-4">
            <dt class="flex items-center gap-1.5 text-xs font-semibold text-piedra">
              <ti-icono nombre="navigation" class="size-4 text-marca" /> En curso
            </dt>
            <dd class="numeros mt-1 text-2xl font-extrabold">{{ activos().length }}</dd>
          </div>
          <div class="tarjeta p-4">
            <dt class="flex items-center gap-1.5 text-xs font-semibold text-piedra">
              <ti-icono nombre="package-check" class="size-4 text-exito" /> Entregados
            </dt>
            <dd class="numeros mt-1 text-2xl font-extrabold">{{ totalEntregados() }}</dd>
          </div>
          <div class="tarjeta p-4">
            <dt class="flex items-center gap-1.5 text-xs font-semibold text-piedra">
              <ti-icono nombre="wallet" class="size-4 text-bosque" /> Invertido
            </dt>
            <dd class="numeros mt-1 truncate text-2xl font-extrabold">{{ invertido() | cop }}</dd>
          </div>
        </dl>
      }

      <div class="mt-6 flex border-b border-linea" role="tablist" aria-label="Filtrar envíos">
        @for (p of pestanas; track p.id) {
          <button
            type="button"
            role="tab"
            [id]="'tab-' + p.id"
            [attr.aria-selected]="pestana() === p.id"
            [attr.aria-controls]="'panel-envios'"
            [tabindex]="pestana() === p.id ? 0 : -1"
            class="-mb-px min-h-11 border-b-[3px] px-4 font-semibold"
            [class]="
              pestana() === p.id ? 'border-marca text-marca' : 'border-transparent text-piedra'
            "
            (click)="pestana.set(p.id)"
            (keydown.arrowRight)="pestana.set('historial')"
            (keydown.arrowLeft)="pestana.set('activos')"
          >
            {{ p.texto }}
            <span class="numeros text-sm"
              >({{ p.id === 'activos' ? activos().length : entregados().length }})</span
            >
          </button>
        }
      </div>

      <div
        id="panel-envios"
        role="tabpanel"
        [attr.aria-labelledby]="'tab-' + pestana()"
        class="mt-6"
      >
        <ti-estado-carga
          [fase]="fase()"
          [textoVacio]="
            pestana() === 'activos'
              ? 'No tienes envíos en curso.'
              : 'Aún no tienes envíos terminados.'
          "
          [textoError]="error()"
          (reintentar)="cargar()"
        >
          <a vacio routerLink="/cliente/nuevo-envio" class="btn-texto mt-2">Pedir un envío</a>
          <ul class="space-y-3">
            @for (e of visibles(); track e.id; let i = $index) {
              <li
                class="tarjeta-interactiva p-4 animate-[var(--animate-aparecer)] sm:p-5"
                [style.animation-delay.ms]="i * 50"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm text-piedra">
                      Envío #{{ e.id }}
                      @if (creacion(e); as f) {
                        <span>· {{ f | fechaLocal }}</span>
                      }
                    </p>
                    <p class="mt-1 flex flex-wrap items-center gap-x-2 font-semibold">
                      {{ e.origen }}
                      <ti-icono nombre="arrow-right" class="size-4 text-marca" etiqueta="hacia" />
                      {{ e.destino }}
                    </p>
                    <p class="text-sm text-piedra">{{ e.tipoCarga }}</p>
                  </div>
                  <div class="text-right">
                    <ti-estado-badge [estado]="e.estado" />
                    <p class="numeros mt-1 font-bold">{{ e.tarifa | cop }}</p>
                  </div>
                </div>
                @if (e.conductor; as c) {
                  <p class="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <span class="font-medium">{{ c.nombre }}</span>
                    @if (c.vehiculo) {
                      <span class="text-piedra">{{ c.vehiculo }}</span>
                    }
                    @if (c.placa) {
                      <ti-placa [valor]="c.placa" etiqueta="Placa" tamano="pequeno" />
                    }
                    @if (c.calificacionPromedio) {
                      <span class="text-piedra">★ {{ c.calificacionPromedio }}</span>
                    }
                  </p>
                }
                <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
                  @if (pestana() === 'activos' && e.pin) {
                    <ti-pin-envio [pin]="e.pin" [ocultable]="true" tamano="pequeno" />
                  }
                  @if (e.estado === 'Cancelado' && e.motivoCancelacion) {
                    <p class="text-sm text-piedra">Motivo: {{ e.motivoCancelacion }}</p>
                  }
                  <a [routerLink]="['/cliente/envios', e.id]" class="btn-texto ml-auto"
                    >Ver seguimiento <ti-icono nombre="chevron-right" class="size-4"
                  /></a>
                </div>
              </li>
            }
          </ul>
        </ti-estado-carga>
      </div>
    </div>
  `,
})
export class EnviosPage implements OnInit {
  private readonly puerto = inject(ClientShipmentsPort);
  private readonly mapper = inject(ErrorMessageMapper);

  protected readonly pestanas: { id: Pestana; texto: string }[] = [
    { id: 'activos', texto: 'Activos' },
    { id: 'historial', texto: 'Historial' },
  ];
  protected readonly pestana = signal<Pestana>('activos');
  protected readonly envios = signal<Envio[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');

  protected readonly activos = computed(() => this.envios().filter((e) => esActivo(e.estado)));
  protected readonly entregados = computed(() => this.envios().filter((e) => !esActivo(e.estado)));
  protected readonly totalEntregados = computed(
    () => this.envios().filter((e) => e.estado === 'Entregado').length,
  );
  protected readonly invertido = computed(() =>
    this.envios()
      .filter((e) => e.estado === 'Entregado')
      .reduce((t, e) => t + e.tarifa, 0),
  );
  protected readonly visibles = computed(() =>
    this.pestana() === 'activos' ? this.activos() : this.entregados(),
  );
  protected readonly fase = computed<FaseCarga>(() =>
    this.cargando()
      ? 'cargando'
      : this.error()
        ? 'error'
        : this.visibles().length === 0
          ? 'vacio'
          : 'listo',
  );

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      this.envios.set(await this.puerto.listar());
    } catch (e) {
      this.error.set(this.mapper.traducir(e));
    } finally {
      this.cargando.set(false);
    }
  }

  protected creacion(e: Envio): Date | undefined {
    return fechaCreacion(e);
  }
}
