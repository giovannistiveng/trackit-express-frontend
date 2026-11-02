import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  CATEGORIAS_VEHICULO,
  CategoriaVehiculo,
  Coordenadas,
  Cotizacion,
  Envio,
  Seguimiento,
  TIPOS_CARGA,
  Zona,
  formatoDuracion,
  limpiarTexto,
} from '../../core/domain';
import { ApiError } from '../../core/http/api-error';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { LoggerPort, QuotePort, ShipmentsPort, ZonesPort } from '../../core/ports';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { CampoDireccionComponent } from '../../shared/ui/campo-direccion.component';
import { mostrarError } from '../../shared/ui/campo-error';
import { IconoComponent, NombreIcono } from '../../shared/ui/icono.component';
import { MapaEnvioComponent } from '../../shared/ui/mapa-envio.component';
import { ToastService } from '../../shared/ui/toast.service';
import { DesgloseTarifaComponent } from './components/desglose-tarifa.component';
import { PinEnvioComponent } from './components/pin-envio.component';

export const VIGENCIA_COTIZACION_MS = 15 * 60_000;
/** Pausa antes de recotizar sola tras un cambio (dirección elegida, vehículo, zona). */
export const ESPERA_AUTOCOTIZAR_MS = 500;
/** Vehículo con el que se cotiza cuando el cliente elige "Cualquiera". */
export const VEHICULO_POR_DEFECTO: CategoriaVehiculo = 'Moto Express';
const OTRO = 'Otro';

const textoValidator =
  (min: number, max: number): ValidatorFn =>
  (c: AbstractControl): ValidationErrors | null => {
    const v = limpiarTexto(String(c.value ?? ''));
    return v.length >= min && v.length <= max ? null : { longitud: { min, max } };
  };

const distintosValidator: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
  const o = limpiarTexto(String(g.get('origen')?.value ?? '')).toLowerCase();
  const d = limpiarTexto(String(g.get('destino')?.value ?? '')).toLowerCase();
  return o && d && o === d ? { iguales: true } : null;
};

const tipoCargaValidator: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
  const tipo = g.get('tipoCarga')?.value as string;
  if (!tipo) return { tipoCarga: true };
  if (tipo !== OTRO) return null;
  const otro = limpiarTexto(String(g.get('otroTipo')?.value ?? ''));
  return otro.length >= 1 && otro.length <= 80 ? null : { tipoCarga: true };
};

/** CU-005 Cotización y CU-006 Solicitud de envío. */
@Component({
  selector: 'ti-nuevo-envio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CopPipe,
    PinEnvioComponent,
    IconoComponent,
    CampoDireccionComponent,
    MapaEnvioComponent,
    DesgloseTarifaComponent,
  ],
  template: `
    <div class="contenedor-ancho max-w-5xl">
      @if (creado(); as envio) {
        <section
          aria-labelledby="titulo-creado"
          class="mx-auto max-w-2xl text-center animate-[var(--animate-aparecer)]"
        >
          <span
            class="mx-auto grid size-20 place-items-center rounded-full bg-exito-suave text-exito"
          >
            <ti-icono nombre="circle-check" class="size-11" />
          </span>
          <p class="mt-5 font-semibold text-exito">Solicitud enviada</p>
          <h1 id="titulo-creado" class="mt-1">Tu envío #{{ envio.id }} está esperando conductor</h1>
          <p class="mt-3 text-piedra">
            Avisamos a los conductores disponibles. Te notificaremos cuando uno lo acepte; mientras
            tanto, guarda tu PIN.
          </p>
          <div class="tarjeta mx-auto mt-8 max-w-md border-2 border-tinta p-6 text-left">
            <p class="flex items-center gap-2 font-semibold">
              <ti-icono nombre="lock" class="text-marca" /> PIN de entrega
            </p>
            <p class="mt-1 text-sm text-piedra">
              Entrega este PIN al conductor solo al recibir tu paquete.
            </p>
            <div class="mt-4"><ti-pin-envio [pin]="envio.pin ?? ''" tamano="grande" /></div>
          </div>
          @if (tarifaCambio()) {
            <p
              class="mx-auto mt-4 max-w-md rounded-xl bg-aviso-suave px-4 py-3 text-left text-sm"
              role="status"
            >
              La tarifa final es {{ envio.tarifa | cop }}, distinta de la cotizada ({{
                precioElegido() | cop
              }}), porque la ruta o el horario cambiaron al crear el envío.
            </p>
          }
          <dl
            class="tarjeta mx-auto mt-4 grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2 p-5 text-left text-sm"
          >
            <dt class="text-piedra">Recoger en</dt>
            <dd class="font-medium">{{ envio.origen }}</dd>
            <dt class="text-piedra">Entregar en</dt>
            <dd class="font-medium">{{ envio.destino }}</dd>
            <dt class="text-piedra">Carga</dt>
            <dd class="font-medium">{{ envio.tipoCarga }}</dd>
            <dt class="text-piedra">Vehículo</dt>
            <dd class="font-medium">{{ envio.categoria ?? 'Cualquiera' }}</dd>
            <dt class="text-piedra">Tarifa</dt>
            <dd class="numeros font-bold">{{ envio.tarifa | cop }}</dd>
          </dl>
          <div class="mt-8 flex flex-wrap justify-center gap-3">
            <a class="btn-primario" [routerLink]="['/cliente/envios', envio.id]"
              ><ti-icono nombre="map-pinned" /> Seguir este envío</a
            >
            <button type="button" class="btn-secundario" (click)="nuevo()">Pedir otro envío</button>
          </div>
        </section>
      } @else {
        <h1>Nuevo envío</h1>
        <p class="mt-2 text-piedra">
          Busca las direcciones o márcalas en el mapa: el precio se calcula solo, según la distancia
          real, el vehículo y la zona.
        </p>

        <div class="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_23rem]">
          <form
            [formGroup]="form"
            (ngSubmit)="cotizar()"
            novalidate
            class="tarjeta space-y-5 p-5 sm:p-7"
          >
            <div class="relative space-y-5 pl-9">
              <span
                class="absolute bottom-16 left-[13px] top-10 w-0.5 border-l-2 border-dashed border-linea"
                aria-hidden="true"
              ></span>
              <div class="relative">
                <span
                  class="absolute -left-9 top-8 grid size-7 place-items-center rounded-full bg-tinta text-white"
                  aria-hidden="true"
                  ><ti-icono nombre="package" class="size-4"
                /></span>
                <label for="origen" class="etiqueta">Recoger en</label>
                <ti-campo-direccion
                  idCampo="origen"
                  etiqueta="recogida"
                  formControlName="origen"
                  placeholder="Dirección, barrio o lugar de recogida"
                  [conUbicacion]="true"
                  [(coords)]="origenCoords"
                  [zonas]="zonas()"
                  [invalido]="err('origen')"
                  [idError]="err('origen') ? 'origen-error' : null"
                />
                @if (err('origen')) {
                  <p id="origen-error" class="error-campo">Escribe entre 3 y 200 caracteres.</p>
                }
              </div>
              <div class="relative">
                <span
                  class="absolute -left-9 top-8 grid size-7 place-items-center rounded-full bg-marca text-white"
                  aria-hidden="true"
                  ><ti-icono nombre="map-pin" class="size-4"
                /></span>
                <label for="destino" class="etiqueta">Entregar en</label>
                <ti-campo-direccion
                  idCampo="destino"
                  etiqueta="entrega"
                  formControlName="destino"
                  placeholder="Dirección, barrio o lugar de entrega"
                  [(coords)]="destinoCoords"
                  [zonas]="zonas()"
                  [invalido]="err('destino') || iguales()"
                  [idError]="err('destino') || iguales() ? 'destino-error' : null"
                />
                @if (iguales()) {
                  <p id="destino-error" class="error-campo">
                    El destino debe ser distinto del origen.
                  </p>
                } @else if (err('destino')) {
                  <p id="destino-error" class="error-campo">Escribe entre 3 y 200 caracteres.</p>
                }
              </div>
            </div>

            @if (rutaEnMapa(); as ruta) {
              <ti-mapa-envio [seguimiento]="ruta" />
            }

            <div class="grid gap-5 sm:grid-cols-2">
              @if (!destinoCoords()) {
                <div>
                  <label for="zona" class="etiqueta"
                    >Zona del destino
                    <span class="font-normal text-piedra">(si no aparece en el mapa)</span></label
                  >
                  <select
                    id="zona"
                    class="campo"
                    formControlName="idZona"
                    aria-describedby="zona-ayuda"
                  >
                    <option [ngValue]="null">
                      {{ zonasCargando() ? 'Cargando zonas…' : 'Detectar automáticamente' }}
                    </option>
                    @for (z of zonas(); track z.id) {
                      <option [ngValue]="z.id">
                        {{ z.nombre
                        }}{{ z.tarifaBase > 0 ? ' · recargo ' + (z.tarifaBase | cop) : '' }}
                      </option>
                    }
                  </select>
                  <p id="zona-ayuda" class="ayuda">
                    Solo se usa si no encontramos la dirección de destino.
                  </p>
                  @if (errorZonas()) {
                    <p class="error-campo">
                      No se pudieron cargar las zonas.
                      <button type="button" class="btn-texto" (click)="cargarZonas()">
                        Reintentar
                      </button>
                    </p>
                  }
                </div>
              }
              <div>
                <label for="tipoCarga" class="etiqueta">Tipo de carga</label>
                <select
                  id="tipoCarga"
                  class="campo"
                  formControlName="tipoCarga"
                  [attr.aria-invalid]="errTipo()"
                  [attr.aria-describedby]="errTipo() ? 'tipo-error' : null"
                >
                  <option value="" disabled>Elige el tipo de carga</option>
                  @for (t of tiposCarga; track t) {
                    <option [value]="t">{{ t }}</option>
                  }
                  <option value="Otro">Otro</option>
                </select>
                @if (esOtro()) {
                  <label for="otroTipo" class="sr-only">Describe la carga</label>
                  <input
                    id="otroTipo"
                    class="campo mt-2"
                    formControlName="otroTipo"
                    maxlength="80"
                    placeholder="Describe la carga"
                    [attr.aria-invalid]="errTipo()"
                  />
                }
                @if (errTipo()) {
                  <p id="tipo-error" class="error-campo">Indica el tipo de carga.</p>
                }
              </div>
            </div>
            <fieldset>
              <legend class="etiqueta">Vehículo</legend>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                @for (op of opcionesVehiculo; track op.valor) {
                  <label
                    class="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border-2 p-2 text-center text-sm font-semibold transition-colors"
                    [class]="
                      valores().categoria === op.valor
                        ? 'border-marca bg-marca-suave text-marca'
                        : 'border-linea hover:border-marca/40'
                    "
                  >
                    <input
                      type="radio"
                      class="sr-only"
                      formControlName="categoria"
                      [value]="op.valor"
                      [attr.id]="op.valor === '' ? 'categoria' : null"
                    />
                    <ti-icono [nombre]="op.icono" class="size-6" />
                    {{ op.texto }}
                    @if (precioDe(op.valor); as p) {
                      <span class="numeros text-xs font-bold text-tinta">{{ p | cop }}</span>
                    } @else {
                      <span class="text-xs font-normal text-piedra">{{ op.ayuda }}</span>
                    }
                  </label>
                }
              </div>
              <p class="ayuda">
                Un vehículo más grande también puede llevar tu pedido. "Cualquiera" se cobra como
                Moto Express.
              </p>
            </fieldset>
            <div>
              <label for="notas" class="etiqueta"
                >Indicaciones para el conductor
                <span class="font-normal text-piedra">(opcional)</span></label
              >
              <textarea
                id="notas"
                rows="2"
                class="campo"
                formControlName="notas"
                maxlength="300"
                placeholder="Ej.: dejar en portería, preguntar por Juan, casa de rejas verdes"
              ></textarea>
              <p class="ayuda text-right">{{ (valores().notas ?? '').length }}/300</p>
            </div>

            @if (error()) {
              <p
                class="flex items-center gap-2 rounded-xl bg-alerta-suave px-4 py-3 text-sm font-semibold text-alerta"
                role="alert"
              >
                <ti-icono nombre="triangle-alert" class="size-4" /> {{ error() }}
              </p>
            }

            <button type="submit" class="btn-secundario w-full sm:w-auto" [disabled]="cotizando()">
              <ti-icono
                [nombre]="cotizando() ? 'loader' : 'circle-dollar'"
                [class]="cotizando() ? 'animate-spin' : 'text-marca'"
              />
              {{ cotizando() ? 'Calculando…' : vigente() ? 'Volver a cotizar' : 'Cotizar' }}
            </button>
          </form>

          <aside class="lg:sticky lg:top-24">
            @if (cotizacion(); as c) {
              <section
                class="overflow-hidden rounded-2xl bg-marca text-white shadow-[var(--shadow-marca)] animate-[var(--animate-aparecer)]"
                aria-labelledby="titulo-cotizacion"
                aria-live="polite"
              >
                <div class="p-5 sm:p-6" [class.opacity-60]="!vigente() || cotizando()">
                  <p class="flex items-center justify-between text-sm text-white/80">
                    <span>{{ vehiculoCotizado() }}</span>
                    @if (c.zona) {
                      <span class="insignia bg-white/15 text-white"
                        ><ti-icono nombre="map-pin" class="size-3.5" /> {{ c.zona.nombre }}</span
                      >
                    }
                  </p>
                  <h2 id="titulo-cotizacion" class="mt-1 text-white">
                    {{ vigente() ? 'Tu precio' : 'Cotización vencida' }}
                  </h2>
                  <p class="numeros mt-1 text-4xl font-extrabold" style="font-stretch: 112%">
                    {{ precioElegido() | cop }}
                  </p>
                  <p class="mt-1 flex flex-wrap gap-x-4 text-sm text-white/85">
                    <span class="inline-flex items-center gap-1"
                      ><ti-icono nombre="route" class="size-4" /> {{ c.distanciaKm }} km</span
                    >
                    @if (c.duracionMin) {
                      <span class="inline-flex items-center gap-1"
                        ><ti-icono nombre="timer" class="size-4" />
                        {{ duracion(c.duracionMin) }}</span
                      >
                    }
                    @if (c.nocturno) {
                      <span class="inline-flex items-center gap-1"
                        ><ti-icono nombre="moon" class="size-4" /> Horario nocturno</span
                      >
                    }
                  </p>
                  @if (!vigente()) {
                    <p class="mt-2 text-sm text-white/80">
                      Cambiaste los datos o pasaron 15 minutos. Vuelve a cotizar para confirmar.
                    </p>
                  }
                  @if (c.desglose) {
                    <ti-desglose-tarifa
                      class="mt-4 block"
                      [desglose]="c.desglose"
                      [distanciaKm]="c.distanciaKm"
                      [minutos]="c.duracionMin ?? null"
                      [zona]="c.zona?.nombre ?? null"
                      tono="oscuro"
                    />
                  }
                  <p class="mt-3 text-xs text-white/75">
                    @if (c.distanciaExacta === false) {
                      No encontramos alguna dirección en el mapa: la distancia es aproximada.
                    } @else {
                      Distancia y tiempo por carretera (OpenStreetMap).
                    }
                  </p>
                </div>
                <div class="bg-marca-oscuro/60 p-5">
                  <button
                    type="button"
                    class="btn-acento w-full"
                    [disabled]="!vigente() || creando() || cotizando()"
                    (click)="confirmar()"
                  >
                    @if (creando()) {
                      <ti-icono nombre="loader" class="animate-spin" /> Enviando solicitud…
                    } @else {
                      <ti-icono nombre="check" /> Confirmar por {{ precioElegido() | cop }}
                    }
                  </button>
                </div>
              </section>
            } @else {
              <section
                class="rounded-2xl border border-dashed border-linea bg-papel/60 p-6 text-center"
              >
                <span
                  class="mx-auto grid size-14 place-items-center rounded-full bg-marca-suave text-marca"
                >
                  @if (cotizando()) {
                    <ti-icono nombre="loader" class="size-7 animate-spin" />
                  } @else {
                    <ti-icono nombre="calculator" class="size-7" />
                  }
                </span>
                <p class="mt-4 font-semibold">
                  {{ cotizando() ? 'Calculando tu precio…' : 'Tu precio aparecerá aquí' }}
                </p>
                <p class="mt-1 text-sm text-piedra">
                  Elige las direcciones de las sugerencias o en el mapa y lo calculamos al instante.
                  También puedes escribirlas y pulsar Cotizar.
                </p>
              </section>
            }
          </aside>
        </div>
      }
    </div>
  `,
})
export class NuevoEnvioPage implements OnInit, OnDestroy {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly zonesPort = inject(ZonesPort);
  private readonly quotePort = inject(QuotePort);
  private readonly shipments = inject(ShipmentsPort);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerPort);

  protected readonly tiposCarga = TIPOS_CARGA;
  protected readonly opcionesVehiculo: {
    valor: CategoriaVehiculo | '';
    texto: string;
    icono: NombreIcono;
    ayuda: string;
  }[] = [
    { valor: '', texto: 'Cualquiera', icono: 'sparkles', ayuda: 'El más rápido' },
    ...CATEGORIAS_VEHICULO.map((c) => ({
      valor: c,
      texto: c,
      icono: (c === 'Camioneta' ? 'truck' : 'bike') as NombreIcono,
      ayuda:
        c === 'Moto Express'
          ? 'Paquetes pequeños'
          : c === 'Motocarro'
            ? 'Cajas y bultos'
            : 'Carga grande',
    })),
  ];
  protected readonly duracion = formatoDuracion;

  protected readonly form = this.fb.group(
    {
      origen: ['', [Validators.required, textoValidator(3, 200)]],
      destino: ['', [Validators.required, textoValidator(3, 200)]],
      idZona: this.fb.control<number | null>(null),
      tipoCarga: [''],
      otroTipo: [''],
      categoria: this.fb.control<CategoriaVehiculo | ''>(''),
      notas: ['', Validators.maxLength(300)],
    },
    { validators: [distintosValidator, tipoCargaValidator] },
  );
  protected readonly valores = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  protected readonly origenCoords = signal<Coordenadas | null>(null);
  protected readonly destinoCoords = signal<Coordenadas | null>(null);

  protected readonly zonas = signal<Zona[]>([]);
  protected readonly zonasCargando = signal(false);
  protected readonly errorZonas = signal(false);
  protected readonly cotizacion = signal<Cotizacion | null>(null);
  private readonly firmaCotizada = signal('');
  private readonly textosCotizados = signal('');
  private readonly vencida = signal(false);
  protected readonly cotizando = signal(false);
  protected readonly creando = signal(false);
  protected readonly error = signal('');
  protected readonly creado = signal<Envio | null>(null);
  private temporizadorVigencia: ReturnType<typeof setTimeout> | null = null;
  private temporizadorAuto: ReturnType<typeof setTimeout> | null = null;
  private consulta = 0;

  protected readonly esOtro = computed(() => this.valores().tipoCarga === OTRO);
  protected readonly iguales = computed(() => {
    this.valores();
    return (
      !!this.form.errors?.['iguales'] &&
      (this.form.controls.destino.touched || this.form.controls.destino.dirty)
    );
  });
  private readonly firmaActual = computed(() =>
    this.firma(this.valores(), this.origenCoords(), this.destinoCoords()),
  );
  protected readonly vigente = computed(
    () =>
      this.cotizacion() !== null && !this.vencida() && this.firmaCotizada() === this.firmaActual(),
  );
  /** Precio del vehículo elegido (todas las opciones vienen en la misma cotización). */
  protected readonly precioElegido = computed(() => {
    const c = this.cotizacion();
    if (!c) return 0;
    const cat = this.valores().categoria || VEHICULO_POR_DEFECTO;
    return c.opciones?.find((o) => o.categoria === cat)?.tarifaTotal ?? c.tarifaTotal;
  });
  protected readonly vehiculoCotizado = computed(
    () => this.valores().categoria || 'Cualquier vehículo',
  );
  protected readonly tarifaCambio = computed(() => {
    const e = this.creado();
    return !!this.cotizacion() && !!e && this.precioElegido() !== e.tarifa;
  });
  /** Vista previa del trayecto cuando las dos direcciones están en el mapa. */
  protected readonly rutaEnMapa = computed<Seguimiento | null>(() => {
    const o = this.cotizacion()?.origenCoords ?? this.origenCoords();
    const d = this.cotizacion()?.destinoCoords ?? this.destinoCoords();
    if (!o || !d) return null;
    const v = this.valores();
    return {
      idEnvio: 0,
      estado: 'Pendiente',
      origen: { direccion: v.origen ?? '', coords: o },
      destino: { direccion: v.destino ?? '', coords: d },
      ultima: null,
      recorrido: [],
      enVivo: false,
      distanciaRestanteKm: null,
      etaMinutos: null,
    };
  });

  constructor() {
    // Recotiza sola cuando hay datos suficientes y algo relevante cambió
    effect(() => {
      const firma = this.firmaActual();
      const listo = this.listoParaAutocotizar();
      untracked(() => {
        if (listo && firma !== this.firmaCotizada()) this.programarCotizacion();
      });
    });
  }

  ngOnInit(): void {
    void this.cargarZonas();
  }

  ngOnDestroy(): void {
    if (this.temporizadorVigencia) clearTimeout(this.temporizadorVigencia);
    if (this.temporizadorAuto) clearTimeout(this.temporizadorAuto);
  }

  async cargarZonas(): Promise<void> {
    this.zonasCargando.set(true);
    this.errorZonas.set(false);
    try {
      this.zonas.set(await this.zonesPort.listar());
    } catch {
      this.errorZonas.set(true);
    } finally {
      this.zonasCargando.set(false);
    }
  }

  protected err(c: 'origen' | 'destino'): boolean {
    return mostrarError(this.form.controls[c]);
  }

  protected errTipo(): boolean {
    this.valores();
    const tocado = this.form.controls.tipoCarga.touched || this.form.controls.otroTipo.touched;
    return tocado && !!this.form.errors?.['tipoCarga'];
  }

  protected precioDe(valor: CategoriaVehiculo | ''): number | null {
    const c = this.cotizacion();
    if (!c?.opciones) return null;
    return (
      c.opciones.find((o) => o.categoria === (valor || VEHICULO_POR_DEFECTO))?.tarifaTotal ?? null
    );
  }

  /**
   * Con las dos direcciones ubicadas en el mapa no hace falta pulsar Cotizar. Si se escribieron a
   * mano, solo se recotiza sola cuando cambia el vehículo o la zona (no mientras se escribe).
   */
  private listoParaAutocotizar(): boolean {
    const v = this.valores();
    const rutaValida =
      this.form.controls.origen.valid &&
      this.form.controls.destino.valid &&
      !this.form.errors?.['iguales'];
    const ubicadas = !!this.origenCoords() && !!this.destinoCoords();
    const mismosTextos = this.textosCotizados() === this.textos(v.origen, v.destino);
    return rutaValida && (ubicadas || (this.cotizacion() !== null && mismosTextos));
  }

  private textos(o = '', d = ''): string {
    return `${limpiarTexto(o).toLowerCase()}|${limpiarTexto(d).toLowerCase()}`;
  }

  private programarCotizacion(): void {
    if (this.temporizadorAuto) clearTimeout(this.temporizadorAuto);
    this.temporizadorAuto = setTimeout(() => void this.cotizar(false), ESPERA_AUTOCOTIZAR_MS);
  }

  /** Con `marcar` (botón Cotizar) se muestran los errores de todos los campos. */
  async cotizar(marcar = true): Promise<void> {
    if (this.temporizadorAuto) clearTimeout(this.temporizadorAuto);
    if (marcar) {
      this.form.controls.origen.markAsTouched();
      this.form.controls.destino.markAsTouched();
    }
    this.form.updateValueAndValidity();
    const { origen, destino } = this.form.controls;
    if (origen.invalid || destino.invalid || this.form.errors?.['iguales']) return;
    const v = this.form.getRawValue();
    const firma = this.firmaActual();
    const n = ++this.consulta;
    this.cotizando.set(true);
    this.error.set('');
    try {
      const c = await this.quotePort.cotizar({
        origen: limpiarTexto(v.origen),
        destino: limpiarTexto(v.destino),
        idZona: this.destinoCoords() ? null : v.idZona,
        categoria: v.categoria || undefined,
        origenCoords: this.origenCoords(),
        destinoCoords: this.destinoCoords(),
      });
      if (n !== this.consulta) return;
      this.cotizacion.set(c);
      this.firmaCotizada.set(firma);
      this.textosCotizados.set(this.textos(v.origen, v.destino));
      this.vencida.set(false);
      if (this.temporizadorVigencia) clearTimeout(this.temporizadorVigencia);
      this.temporizadorVigencia = setTimeout(() => this.vencida.set(true), VIGENCIA_COTIZACION_MS);
    } catch (e) {
      if (n !== this.consulta) return;
      this.cotizacion.set(null);
      this.firmaCotizada.set(firma);
      this.error.set(
        e instanceof ApiError && e.status === 404
          ? 'La zona elegida no existe. Elige otra zona.'
          : this.mapper.traducir(e),
      );
    } finally {
      if (n === this.consulta) this.cotizando.set(false);
    }
  }

  async confirmar(): Promise<void> {
    if (!this.vigente() || this.creando()) return;
    this.form.markAllAsTouched();
    this.form.updateValueAndValidity();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.creando.set(true);
    this.error.set('');
    try {
      const envio = await this.shipments.crear({
        origen: limpiarTexto(v.origen),
        destino: limpiarTexto(v.destino),
        idZona: this.destinoCoords() ? null : v.idZona,
        origenCoords: this.origenCoords(),
        destinoCoords: this.destinoCoords(),
        tipoCarga: this.tipoCargaFinal(),
        categoria: v.categoria || undefined,
        notas: v.notas.trim() || undefined,
      });
      this.log.info('Envios', `Envío creado #${envio.id}`, {
        tarifa: envio.tarifa,
        idZona: envio.idZona,
      });
      this.creado.set(envio);
      this.toast.exito('Solicitud enviada');
    } catch (e) {
      this.error.set(this.mapper.traducir(e));
    } finally {
      this.creando.set(false);
    }
  }

  nuevo(): void {
    this.creado.set(null);
    this.cotizacion.set(null);
    this.firmaCotizada.set('');
    this.origenCoords.set(null);
    this.destinoCoords.set(null);
    this.form.reset();
  }

  private tipoCargaFinal(): string {
    const v = this.form.getRawValue();
    return v.tipoCarga === OTRO ? limpiarTexto(v.otroTipo) : v.tipoCarga;
  }

  /** Lo que define el precio: textos, coordenadas, zona (si aplica) y vehículo. */
  private firma(
    v: Partial<{ origen: string; destino: string; idZona: number | null; categoria: string }>,
    o: Coordenadas | null,
    d: Coordenadas | null,
  ): string {
    return JSON.stringify([
      limpiarTexto(v.origen ?? '').toLowerCase(),
      limpiarTexto(v.destino ?? '').toLowerCase(),
      o,
      d,
      d ? null : (v.idZona ?? null),
      v.categoria ?? '',
    ]);
  }
}
