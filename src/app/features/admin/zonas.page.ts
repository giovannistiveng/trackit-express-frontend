import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Coordenadas,
  DatosZona,
  TarifaVehiculo,
  VIAJES_EJEMPLO,
  Zona,
  precioEstimado,
  tarifaValida,
} from '../../core/domain';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { AdminOperationsPort, LoggerPort } from '../../core/ports';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { EstadoCargaComponent, FaseCarga } from '../../shared/ui/estado-carga.component';
import { IconoComponent } from '../../shared/ui/icono.component';
import { SelectorMapaComponent } from '../../shared/ui/selector-mapa.component';
import { ToastService } from '../../shared/ui/toast.service';

/** Tope del recargo de una zona (el backend acepta hasta 200.000 COP). */
export const TARIFA_MAXIMA = 200_000;
export const RADIO_MINIMO_KM = 0.5;
export const RADIO_MAXIMO_KM = 30;

interface Borrador {
  id: number | null;
  nombre: string;
  tarifaBase: number;
  centro: Coordenadas | null;
  radioKm: number;
  descripcion: string;
  activa: boolean;
}

const CAMPOS_TARIFA: {
  clave: keyof Omit<TarifaVehiculo, 'categoria'>;
  texto: string;
  ayuda: string;
}[] = [
  { clave: 'banderazo', texto: 'Banderazo', ayuda: 'Al iniciar el servicio' },
  { clave: 'porKm', texto: 'Por kilómetro', ayuda: 'Distancia por carretera' },
  { clave: 'porMinuto', texto: 'Por minuto', ayuda: 'Tiempo estimado del trayecto' },
  { clave: 'minimo', texto: 'Tarifa mínima', ayuda: 'Nunca se cobra menos' },
];

/** Administración: cómo se cobra cada vehículo y dónde hay cobertura (zonas en el mapa). */
@Component({
  selector: 'ti-zonas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, CopPipe, EstadoCargaComponent, IconoComponent, SelectorMapaComponent],
  template: `
    <div class="contenedor-ancho max-w-6xl">
      <h1>Zonas y tarifas</h1>
      <p class="mt-1 max-w-3xl text-piedra">
        El precio de cada envío se calcula solo:
        <strong>banderazo + kilómetros + minutos</strong> del vehículo (nunca menos del mínimo), más
        el <strong>recargo de la zona</strong> y un 20 % de recargo nocturno entre las 8:00 p. m. y
        las 6:00 a. m. Los cambios aplican a las cotizaciones nuevas.
      </p>

      <ti-estado-carga
        class="mt-6 block"
        [fase]="fase()"
        [textoError]="error()"
        (reintentar)="cargar()"
      >
        <!-- ================================================= Tarifas por vehículo -->
        <section aria-labelledby="titulo-tarifas">
          <h2 id="titulo-tarifas" class="flex items-center gap-2">
            <ti-icono nombre="calculator" class="text-marca" /> Tarifas por vehículo
          </h2>
          <div class="mt-4 grid gap-4 md:grid-cols-3">
            @for (t of tarifas(); track t.categoria; let i = $index) {
              <form class="tarjeta flex flex-col p-5" (ngSubmit)="guardarTarifa(i)">
                <p class="flex items-center gap-2 font-bold">
                  <span class="grid size-9 place-items-center rounded-xl bg-marca-suave text-marca">
                    <ti-icono
                      [nombre]="t.categoria === 'Camioneta' ? 'truck' : 'bike'"
                      class="size-5"
                    />
                  </span>
                  {{ t.categoria }}
                </p>
                <div class="mt-4 grid grid-cols-2 gap-3">
                  @for (c of campos; track c.clave) {
                    <div>
                      <label [for]="idCampo(t, c.clave)" class="etiqueta text-xs">{{
                        c.texto
                      }}</label>
                      <div class="relative">
                        <span
                          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-piedra"
                          >$</span
                        >
                        <input
                          [id]="idCampo(t, c.clave)"
                          [name]="c.clave"
                          type="number"
                          min="0"
                          step="50"
                          inputmode="numeric"
                          class="campo numeros pl-7"
                          [ngModel]="borradorTarifas()[i][c.clave]"
                          (ngModelChange)="cambiarTarifa(i, c.clave, $event)"
                          [attr.aria-describedby]="idCampo(t, c.clave) + '-ayuda'"
                        />
                      </div>
                      <p
                        [id]="idCampo(t, c.clave) + '-ayuda'"
                        class="mt-0.5 text-[11px] text-piedra"
                      >
                        {{ c.ayuda }}
                      </p>
                    </div>
                  }
                </div>
                <dl class="mt-4 space-y-1 rounded-xl bg-crema p-3 text-sm">
                  @for (v of ejemplos; track v.nombre) {
                    <div class="flex justify-between gap-2">
                      <dt class="text-piedra">
                        {{ v.nombre }} <span class="text-xs">({{ v.km }} km)</span>
                      </dt>
                      <dd class="numeros font-semibold">
                        {{ ejemplo(borradorTarifas()[i], v.km, v.minutos) | cop }}
                      </dd>
                    </div>
                  }
                </dl>
                <button
                  type="submit"
                  class="btn-primario mt-4"
                  [disabled]="
                    !tarifaCambiada(i) || !tarifaOk(i) || guardandoTarifa() === t.categoria
                  "
                  [attr.aria-label]="'Guardar la tarifa de ' + t.categoria"
                >
                  <ti-icono
                    [nombre]="guardandoTarifa() === t.categoria ? 'loader' : 'save'"
                    [class]="guardandoTarifa() === t.categoria ? 'animate-spin' : ''"
                  />
                  Guardar
                </button>
                @if (!tarifaOk(i)) {
                  <p class="error-campo">Revisa los valores: deben ser positivos y razonables.</p>
                }
              </form>
            }
          </div>
          <p class="ayuda mt-2">Ejemplos sin recargos de zona ni nocturno.</p>
        </section>

        <!-- ================================================= Zonas -->
        <section class="mt-10" aria-labelledby="titulo-zonas">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="titulo-zonas" class="flex items-center gap-2">
                <ti-icono nombre="layers" class="text-marca" /> Zonas de cobertura
              </h2>
              <p class="mt-1 text-sm text-piedra">
                Cada zona es un círculo en el mapa. Un punto pertenece a la zona más pequeña que lo
                contiene; fuera de todas, no hay servicio. Se cobra el mayor recargo entre el origen
                y el destino.
              </p>
            </div>
            <button
              type="button"
              class="btn-primario"
              (click)="nuevaZona()"
              [disabled]="!!borrador()"
            >
              <ti-icono nombre="plus" /> Nueva zona
            </button>
          </div>

          <div class="mt-4 grid items-start gap-5 lg:grid-cols-[1fr_24rem]">
            <div class="lg:sticky lg:top-24">
              <ti-selector-mapa
                [zonas]="zonas()"
                [idZonaActiva]="borrador()?.id ?? null"
                [punto]="borrador()?.centro ?? null"
                [radioKm]="borrador()?.radioKm ?? null"
                alto="h-80 sm:h-[30rem]"
                [etiqueta]="
                  borrador()
                    ? 'Mapa: haz clic para mover el centro de la zona'
                    : 'Mapa de las zonas de cobertura'
                "
                (elegir)="moverCentro($event)"
              />
              @if (borrador()) {
                <p class="mt-2 flex items-center gap-2 text-sm font-semibold text-marca">
                  <ti-icono nombre="crosshair" class="size-4" /> Toca el mapa o arrastra el marcador
                  para ubicar el centro de la zona.
                </p>
              }
            </div>

            <div>
              @if (borrador(); as b) {
                <form
                  class="tarjeta space-y-4 border-2 border-marca p-5"
                  (ngSubmit)="guardarZona()"
                  novalidate
                >
                  <h3 class="font-bold">{{ b.id ? 'Editar ' + b.nombre : 'Nueva zona' }}</h3>
                  <div>
                    <label for="zona-nombre" class="etiqueta">Nombre</label>
                    <input
                      id="zona-nombre"
                      name="nombre"
                      class="campo"
                      maxlength="100"
                      [ngModel]="b.nombre"
                      (ngModelChange)="editar({ nombre: $event })"
                    />
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label for="zona-recargo" class="etiqueta">Recargo</label>
                      <div class="relative">
                        <span
                          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-piedra"
                          >$</span
                        >
                        <input
                          id="zona-recargo"
                          name="recargo"
                          type="number"
                          min="0"
                          step="500"
                          class="campo numeros pl-7"
                          [ngModel]="b.tarifaBase"
                          (ngModelChange)="editar({ tarifaBase: +$event })"
                        />
                      </div>
                    </div>
                    <div>
                      <label for="zona-radio" class="etiqueta">Radio: {{ b.radioKm }} km</label>
                      <input
                        id="zona-radio"
                        name="radio"
                        type="range"
                        class="mt-3 w-full accent-[var(--color-marca)]"
                        [min]="radioMin"
                        [max]="radioMax"
                        step="0.5"
                        [ngModel]="b.radioKm"
                        (ngModelChange)="editar({ radioKm: +$event })"
                      />
                    </div>
                  </div>
                  <div>
                    <label for="zona-descripcion" class="etiqueta"
                      >Descripción <span class="font-normal text-piedra">(opcional)</span></label
                    >
                    <input
                      id="zona-descripcion"
                      name="descripcion"
                      class="campo"
                      maxlength="200"
                      [ngModel]="b.descripcion"
                      (ngModelChange)="editar({ descripcion: $event })"
                    />
                  </div>
                  <label class="flex items-center gap-3 text-sm font-semibold">
                    <input
                      type="checkbox"
                      name="activa"
                      class="size-5 accent-[var(--color-marca)]"
                      [ngModel]="b.activa"
                      (ngModelChange)="editar({ activa: $event })"
                    />
                    Zona activa (se ofrece el servicio)
                  </label>
                  <p class="text-sm" [class]="b.centro ? 'text-piedra' : 'text-alerta'">
                    @if (b.centro) {
                      Centro: {{ b.centro.lat.toFixed(5) }}, {{ b.centro.lon.toFixed(5) }}
                    } @else {
                      Falta el centro: tócalo en el mapa.
                    }
                  </p>
                  @if (errorZona()) {
                    <p
                      class="rounded-xl bg-alerta-suave px-3 py-2 text-sm font-semibold text-alerta"
                      role="alert"
                    >
                      {{ errorZona() }}
                    </p>
                  }
                  <div class="flex flex-wrap justify-end gap-2">
                    <button type="button" class="btn-secundario" (click)="cancelarZona()">
                      Cancelar
                    </button>
                    <button type="submit" class="btn-primario" [disabled]="guardandoZona()">
                      <ti-icono
                        [nombre]="guardandoZona() ? 'loader' : 'save'"
                        [class]="guardandoZona() ? 'animate-spin' : ''"
                      />
                      {{ b.id ? 'Guardar cambios' : 'Crear zona' }}
                    </button>
                  </div>
                </form>
              }

              <ul class="mt-4 space-y-2" [class.mt-0]="!borrador()">
                @for (z of zonas(); track z.id) {
                  <li
                    class="tarjeta flex items-center gap-3 p-3"
                    [class.opacity-60]="z.activa === false"
                  >
                    <span
                      class="grid size-10 shrink-0 place-items-center rounded-xl"
                      [class]="
                        z.activa === false ? 'bg-linea text-piedra' : 'bg-bosque-suave text-bosque'
                      "
                    >
                      <ti-icono nombre="circle-dot" class="size-5" />
                    </span>
                    <div class="min-w-0 flex-1">
                      <p class="truncate font-semibold">{{ z.nombre }}</p>
                      <p class="text-xs text-piedra">
                        {{ z.tarifaBase > 0 ? 'Recargo ' + (z.tarifaBase | cop) : 'Sin recargo' }}
                        @if (z.radioKm) {
                          · {{ z.radioKm }} km
                        }
                        @if (!z.centro) {
                          · <span class="text-alerta">sin ubicar en el mapa</span>
                        }
                        @if (z.activa === false) {
                          · desactivada
                        }
                      </p>
                    </div>
                    <button
                      type="button"
                      class="btn-texto"
                      (click)="editarZona(z)"
                      [disabled]="!!borrador()"
                      [attr.aria-label]="'Editar la zona ' + z.nombre"
                    >
                      <ti-icono nombre="pencil" class="size-4" /> Editar
                    </button>
                  </li>
                } @empty {
                  <li class="text-sm text-piedra">Aún no hay zonas. Crea la primera.</li>
                }
              </ul>
            </div>
          </div>
        </section>
      </ti-estado-carga>
    </div>
  `,
})
export class ZonasPage implements OnInit {
  private readonly ops = inject(AdminOperationsPort);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerPort);

  protected readonly campos = CAMPOS_TARIFA;
  protected readonly ejemplos = VIAJES_EJEMPLO;
  protected readonly radioMin = RADIO_MINIMO_KM;
  protected readonly radioMax = RADIO_MAXIMO_KM;

  protected readonly zonas = signal<Zona[]>([]);
  protected readonly tarifas = signal<TarifaVehiculo[]>([]);
  protected readonly borradorTarifas = signal<TarifaVehiculo[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly guardandoTarifa = signal<string | null>(null);
  protected readonly borrador = signal<Borrador | null>(null);
  protected readonly guardandoZona = signal(false);
  protected readonly errorZona = signal('');

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
      const [zonas, tarifas] = await Promise.all([this.ops.zonas(), this.ops.tarifasVehiculo()]);
      this.zonas.set(zonas);
      this.tarifas.set(tarifas);
      this.borradorTarifas.set(tarifas.map((t) => ({ ...t })));
    } catch (e) {
      this.error.set(this.mapper.traducir(e));
    } finally {
      this.cargando.set(false);
    }
  }

  // ------------------------------------------------------------ Tarifas por vehículo

  protected idCampo(t: TarifaVehiculo, clave: string): string {
    return `tarifa-${t.categoria.replace(/\s+/g, '-').toLowerCase()}-${clave}`;
  }

  protected ejemplo(t: TarifaVehiculo, km: number, minutos: number): number {
    return tarifaValida(t) ? precioEstimado(t, km, minutos) : 0;
  }

  protected cambiarTarifa(
    i: number,
    clave: keyof Omit<TarifaVehiculo, 'categoria'>,
    valor: unknown,
  ): void {
    const n = valor === '' || valor === null ? Number.NaN : Number(valor);
    this.borradorTarifas.update((lista) =>
      lista.map((t, j) => (j === i ? { ...t, [clave]: n } : t)),
    );
  }

  protected tarifaCambiada(i: number): boolean {
    const a = this.tarifas()[i];
    const b = this.borradorTarifas()[i];
    return CAMPOS_TARIFA.some((c) => a[c.clave] !== b[c.clave]);
  }

  protected tarifaOk(i: number): boolean {
    return tarifaValida(this.borradorTarifas()[i]);
  }

  async guardarTarifa(i: number): Promise<void> {
    const t = this.borradorTarifas()[i];
    if (!this.tarifaCambiada(i) || !tarifaValida(t) || this.guardandoTarifa()) return;
    const redondeada: TarifaVehiculo = {
      categoria: t.categoria,
      banderazo: Math.round(t.banderazo),
      porKm: Math.round(t.porKm),
      porMinuto: Math.round(t.porMinuto),
      minimo: Math.round(t.minimo),
    };
    this.guardandoTarifa.set(t.categoria);
    try {
      const guardada = await this.ops.actualizarTarifaVehiculo(redondeada);
      this.tarifas.update((l) => l.map((x, j) => (j === i ? guardada : x)));
      this.borradorTarifas.update((l) => l.map((x, j) => (j === i ? { ...guardada } : x)));
      this.toast.exito(`Tarifa de ${t.categoria} actualizada`);
      this.log.info('Admin', 'Tarifa de vehículo actualizada', { categoria: t.categoria });
    } catch (e) {
      this.toast.error(this.mapper.traducir(e));
    } finally {
      this.guardandoTarifa.set(null);
    }
  }

  // ------------------------------------------------------------ Zonas

  protected nuevaZona(): void {
    this.errorZona.set('');
    this.borrador.set({
      id: null,
      nombre: '',
      tarifaBase: 0,
      centro: null,
      radioKm: 3,
      descripcion: '',
      activa: true,
    });
    this.mostrarEditor();
  }

  protected editarZona(z: Zona): void {
    this.errorZona.set('');
    this.borrador.set({
      id: z.id,
      nombre: z.nombre,
      tarifaBase: z.tarifaBase,
      centro: z.centro ?? null,
      radioKm: z.radioKm ?? 3,
      descripcion: z.descripcion ?? '',
      activa: z.activa !== false,
    });
    this.mostrarEditor();
  }

  /** Lleva la vista al mapa y al formulario de la zona. */
  private mostrarEditor(): void {
    setTimeout(() => {
      const el = document.getElementById('titulo-zonas');
      if (typeof el?.scrollIntoView === 'function')
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('zona-nombre')?.focus({ preventScroll: true });
    }, 50);
  }

  protected editar(cambios: Partial<Borrador>): void {
    this.borrador.update((b) => (b ? { ...b, ...cambios } : b));
  }

  protected moverCentro(p: Coordenadas): void {
    if (this.borrador()) this.editar({ centro: p });
  }

  protected cancelarZona(): void {
    this.borrador.set(null);
    this.errorZona.set('');
  }

  async guardarZona(): Promise<void> {
    const b = this.borrador();
    if (!b || this.guardandoZona()) return;
    const nombre = b.nombre.trim();
    if (nombre.length < 2) return this.errorZona.set('Escribe el nombre de la zona.');
    if (!Number.isFinite(b.tarifaBase) || b.tarifaBase < 0 || b.tarifaBase > TARIFA_MAXIMA)
      return this.errorZona.set('El recargo debe estar entre $ 0 y $ 200.000.');
    if (!b.centro) return this.errorZona.set('Toca el mapa para ubicar el centro de la zona.');
    const datos: DatosZona = {
      nombre,
      tarifaBase: Math.round(b.tarifaBase),
      centro: b.centro,
      radioKm: b.radioKm,
      descripcion: b.descripcion.trim() || null,
      activa: b.activa,
    };
    this.guardandoZona.set(true);
    this.errorZona.set('');
    try {
      const z = b.id ? await this.ops.actualizarZona(b.id, datos) : await this.ops.crearZona(datos);
      this.zonas.update((l) =>
        b.id ? l.map((x) => (x.id === z.id ? z : x)) : [...l, z].sort((a, c) => a.id - c.id),
      );
      this.borrador.set(null);
      this.toast.exito(b.id ? `Zona ${z.nombre} actualizada` : `Zona ${z.nombre} creada`);
      this.log.info('Admin', b.id ? 'Zona actualizada' : 'Zona creada', { idZona: z.id });
    } catch (e) {
      this.errorZona.set(this.mapper.traducir(e));
    } finally {
      this.guardandoZona.set(false);
    }
  }
}
