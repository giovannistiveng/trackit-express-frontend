import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import {
  ASUNTOS_CONTACTO,
  AsuntoContacto,
  ROL,
  EstadisticasPublicas,
  SERVICIOS,
  TIPOS_SERVICIO,
  TarifaVehiculo,
  VALOR_AYUDANTE,
  VALOR_PISO,
  Zona,
  precioEstimado,
} from '../../core/domain';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { LoggerPort, PublicSitePort } from '../../core/ports';
import { ContadorDirective } from '../../shared/directives/contador.directive';
import { RevelarDirective } from '../../shared/directives/revelar.directive';
import { IlustracionCoberturaComponent } from '../../shared/ilustraciones/cobertura.component';
import { IlustracionConductorComponent } from '../../shared/ilustraciones/conductor.component';
import { IlustracionHeroComponent } from '../../shared/ilustraciones/hero.component';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { IconoComponent, NombreIcono } from '../../shared/ui/icono.component';
import { SitioCabeceraComponent } from './sitio-cabecera.component';
import { SitioPieComponent } from './sitio-pie.component';

/** Minutos por kilómetro para la calculadora (≈ 30 km/h en la región). */
export const MINUTOS_POR_KM = 2;
/** Tarifas de referencia si el backend no responde (mismas que las migraciones). */
export const TARIFAS_REFERENCIA: TarifaVehiculo[] = [
  { categoria: 'Moto Express', banderazo: 2000, porKm: 700, porMinuto: 50, minimo: 4500 },
  { categoria: 'Motocarro', banderazo: 4000, porKm: 950, porMinuto: 80, minimo: 8000 },
  { categoria: 'Camioneta', banderazo: 10000, porKm: 1600, porMinuto: 120, minimo: 18000 },
  { categoria: 'Camión', banderazo: 25000, porKm: 2800, porMinuto: 250, minimo: 45000 },
];

interface Paso {
  icono: NombreIcono;
  titulo: string;
  texto: string;
}

const PASOS: Paso[] = [
  {
    icono: 'receipt',
    titulo: 'Pide y mira el precio',
    texto:
      'Elige el servicio, el origen, el destino y qué llevas. El precio aparece antes de confirmar.',
  },
  {
    icono: 'key',
    titulo: 'Recogida con código',
    texto:
      'Quien entrega la carga le dicta al conductor un código de 4 dígitos. Él cuenta los bultos y toma una foto.',
  },
  {
    icono: 'map-pinned',
    titulo: 'Síguelo en el mapa',
    texto: 'Ves al conductor por las calles, la etapa en que va y cuánto le falta.',
  },
  {
    icono: 'package-check',
    titulo: 'Entrega con tu PIN',
    texto: 'El servicio solo se cierra con el PIN de quien recibe y una foto como evidencia.',
  },
];

/** Servicios en el orden del inicio, con su tipo para el enlace directo. */
const LISTA_SERVICIOS = TIPOS_SERVICIO.map((tipo) => ({ tipo, ...SERVICIOS[tipo] }));

const GARANTIAS: { icono: NombreIcono; titulo: string; texto: string }[] = [
  {
    icono: 'key',
    titulo: 'Código de recogida',
    texto: 'La carga solo sale con el código que tiene quien la entrega.',
  },
  {
    icono: 'lock',
    titulo: 'PIN de entrega',
    texto: 'Nadie más puede recibirla: la entrega se valida con tu código.',
  },
  {
    icono: 'camera',
    titulo: 'Fotos al recoger y al entregar',
    texto: 'Queda constancia de cómo salió la carga y de cómo llegó.',
  },
  {
    icono: 'badge-check',
    titulo: 'Conductores verificados',
    texto:
      'Cédula, selfie, licencia, SOAT, tarjeta de propiedad y antecedentes, revisados uno por uno. Si un documento vence, el conductor queda suspendido.',
  },
  {
    icono: 'circle-dollar',
    titulo: 'Precio antes de pedir',
    texto: 'Según la distancia real, el vehículo, los ayudantes y la zona.',
  },
  {
    icono: 'star',
    titulo: 'Calificación',
    texto: 'Calificas cada servicio y la reputación de los conductores es visible.',
  },
];

const PREGUNTAS = [
  {
    p: '¿Cómo se calcula el precio?',
    r: 'Se suma un banderazo, los kilómetros y los minutos del trayecto según el vehículo, con una tarifa mínima para viajes cortos. En trasteos se suman los ayudantes y los pisos sin ascensor; si el acceso es por carretera destapada hay un recargo del 15 %. Algunas zonas alejadas tienen un recargo fijo y de 8:00 p. m. a 6:00 a. m. hay un recargo nocturno del 20 %. Ves el desglose antes de confirmar.',
  },
  {
    p: '¿Para qué sirven el código de recogida y el PIN?',
    r: 'Al pedir recibes dos códigos. El de recogida se lo das a quien entrega la carga: sin él, el conductor no puede llevársela. El PIN es para quien recibe: el conductor solo cierra la entrega cuando se lo dictan.',
  },
  {
    p: '¿Llegan a las veredas?',
    r: 'Sí, dentro de las zonas de cobertura. Al pedir indica si el acceso es destapado y marca el punto exacto en el mapa; así te asignamos el vehículo adecuado y el conductor llega sin perderse.',
  },
  {
    p: '¿Puedo cancelar un pedido?',
    r: 'Sí. Mientras ningún conductor lo haya tomado, lo cancelas desde el detalle del pedido sin costo.',
  },
  {
    p: '¿Qué necesito para ser conductor?',
    r: 'Crear tu cuenta, registrar tu vehículo y subir cédula, una selfie, licencia, SOAT, tarjeta de propiedad y certificado de antecedentes (la revisión técnico-mecánica si aplica). Revisamos cada documento y lo cruzamos con el RUNT, la Policía y la Procuraduría antes de aprobarte.',
  },
  {
    p: '¿Cuánto gana un conductor?',
    r: 'El 80 % de la tarifa de cada servicio que completa, más los ayudantes que cobra en trasteos. En su panel ve lo que ha ganado en el mes y en total.',
  },
];

/** Página de inicio pública de TrackIt Express. */
@Component({
  selector: 'ti-inicio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    FormsModule,
    SitioCabeceraComponent,
    SitioPieComponent,
    IconoComponent,
    IlustracionHeroComponent,
    IlustracionCoberturaComponent,
    IlustracionConductorComponent,
    RevelarDirective,
    ContadorDirective,
    CopPipe,
  ],
  template: `
    <ti-sitio-cabecera />

    <main id="contenido" tabindex="-1">
      <!-- Portada -->
      <section
        id="inicio"
        class="relative overflow-hidden bg-gradient-to-b from-crema via-niebla to-niebla pt-28 sm:pt-32"
      >
        <div
          class="fondo-puntos pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_75%)]"
        ></div>
        <div
          class="contenedor-ancho relative grid items-center gap-12 pb-12 lg:grid-cols-[1.05fr_1fr] lg:pb-16"
        >
          <div class="animate-[var(--animate-aparecer)]">
            <p class="antetitulo">
              <ti-icono nombre="mountain" class="size-4" /> Fusagasugá y la región del Sumapaz
            </p>
            <h1 class="mt-4 text-[2.5rem] leading-[1.05] font-extrabold sm:text-[3.5rem]">
              De la vereda al casco urbano, lo que necesites mover.
            </h1>
            <p class="mt-5 max-w-xl text-lg text-piedra">
              Mandados, mercado, paquetes, trasteos e insumos del campo. Ves el precio antes de
              pedir, la carga sale solo con tu código de recogida y se entrega solo con tu PIN.
            </p>
            <div class="mt-8 flex flex-wrap gap-3">
              <a [routerLink]="enlacePedir()" class="btn-primario btn-grande">
                {{ session.estaAutenticado() ? 'Ir a mi panel' : 'Pedir un servicio' }}
                <ti-icono nombre="arrow-right" />
              </a>
              <a routerLink="/" fragment="conductores" class="btn-secundario btn-grande">
                <ti-icono nombre="truck" class="text-marca" /> Quiero ser conductor
              </a>
            </div>
          </div>

          <div
            class="relative hidden animate-[var(--animate-aparecer)] [animation-delay:150ms] lg:block"
          >
            <div class="overflow-hidden rounded-[2.25rem] shadow-[var(--shadow-elevada)]">
              <ti-ilustracion-hero />
            </div>
          </div>
        </div>

        <!-- Selector de servicio: el atajo principal del sitio -->
        <div id="servicios" class="contenedor-ancho relative scroll-mt-24 pb-16 lg:pb-24">
          <h2 class="text-xl font-extrabold sm:text-2xl">¿Qué necesitas mover hoy?</h2>
          <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            @for (s of servicios; track s.tipo) {
              <article
                class="tarjeta-interactiva group relative flex flex-col p-4 sm:p-5"
                [class]="s.tipo === 'insumos' ? 'col-span-2 sm:col-span-1' : ''"
              >
                <span
                  class="grid size-12 place-items-center rounded-xl bg-marca-suave text-marca transition-colors group-hover:bg-marca group-hover:text-white"
                >
                  <ti-icono [nombre]="s.icono" class="size-6" />
                </span>
                <h3 class="mt-4 text-base sm:text-lg">
                  <a
                    [routerLink]="enlaceServicio()"
                    [queryParams]="esCliente() ? { servicio: s.tipo } : null"
                    class="after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none"
                    >{{ s.nombre }}</a
                  >
                </h3>
                <p class="mt-1 text-sm text-piedra">{{ s.descripcion }}</p>
                <p class="mt-auto pt-3 text-xs font-semibold text-bosque">
                  Desde {{ s.vehiculoMinimo }}
                </p>
              </article>
            }
          </div>
        </div>
      </section>

      <!-- Cifras reales -->
      @if (cifras().length > 0) {
        <section aria-label="TrackIt Express en cifras" class="border-y border-linea bg-papel">
          <dl
            class="contenedor-ancho flex flex-wrap justify-center gap-x-16 gap-y-8 py-10 sm:gap-x-24"
          >
            @for (c of cifras(); track c.etiqueta; let i = $index) {
              <div tiRevelar [retraso]="i * 90" class="flex min-w-36 flex-col text-center">
                <dt class="text-sm font-semibold text-piedra">{{ c.etiqueta }}</dt>
                <dd
                  class="numeros order-first text-4xl font-extrabold text-marca"
                  style="font-stretch: 112%"
                >
                  <span [tiContador]="c.valor" [decimales]="c.decimales" [sufijo]="c.sufijo"></span>
                </dd>
              </div>
            }
          </dl>
        </section>
      }

      <!-- Cómo funciona -->
      <section id="como-funciona" class="bg-papel py-20 sm:py-24">
        <div class="contenedor-ancho">
          <div tiRevelar class="mx-auto max-w-2xl text-center">
            <p class="antetitulo">Cómo funciona</p>
            <h2 class="mt-3 text-3xl font-extrabold sm:text-4xl">
              Cada parte sabe qué hacer y cuándo
            </h2>
            <p class="mt-4 text-lg text-piedra">
              Dos códigos cierran el recorrido: uno para recoger y otro para entregar. Así nadie se
              lleva la carga equivocada.
            </p>
          </div>
          <ol class="relative mt-14 grid gap-6 md:grid-cols-4">
            <svg
              class="pointer-events-none absolute left-[12%] right-[12%] top-9 hidden h-2 md:block"
              preserveAspectRatio="none"
              viewBox="0 0 100 2"
              aria-hidden="true"
            >
              <line
                x1="0"
                y1="1"
                x2="100"
                y2="1"
                stroke="#8cc4a7"
                stroke-width="2"
                vector-effect="non-scaling-stroke"
                class="ruta-animada"
              />
            </svg>
            @for (p of pasos; track p.titulo; let i = $index) {
              <li tiRevelar [retraso]="i * 120" class="relative text-center">
                <span
                  class="relative mx-auto grid size-18 place-items-center rounded-2xl bg-marca text-white shadow-[var(--shadow-marca)]"
                >
                  <ti-icono [nombre]="p.icono" class="size-8" />
                  <span
                    class="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full border-2 border-papel bg-placa text-sm font-extrabold text-tinta"
                    >{{ i + 1 }}</span
                  >
                </span>
                <h3 class="mt-5 text-lg">{{ p.titulo }}</h3>
                <p class="mx-auto mt-2 max-w-60 text-piedra">{{ p.texto }}</p>
              </li>
            }
          </ol>
        </div>
      </section>

      <!-- Seguridad -->
      <section class="overflow-hidden py-20 sm:py-24">
        <div class="contenedor-ancho grid items-center gap-14 lg:grid-cols-2">
          <div tiRevelar class="relative mx-auto w-full max-w-sm">
            <div
              class="absolute -inset-10 rounded-full bg-marca-suave blur-3xl"
              aria-hidden="true"
            ></div>
            <!-- Maqueta del seguimiento en el celular -->
            <div
              class="relative rounded-[2.75rem] border-[10px] border-noche bg-noche shadow-[var(--shadow-elevada)]"
              aria-hidden="true"
            >
              <div class="overflow-hidden rounded-[2.1rem] bg-niebla">
                <div class="flex items-center justify-between bg-papel px-5 pb-3 pt-4">
                  <span class="text-sm font-extrabold">Trasteo #1043</span>
                  <span class="insignia bg-marca text-white">En camino</span>
                </div>
                <svg viewBox="0 0 300 200" class="block w-full bg-[#eef2ec]">
                  <path
                    d="M0 60 H300 M0 150 H300 M80 0 V200 M210 0 V200"
                    stroke="#fff"
                    stroke-width="10"
                  />
                  <path
                    d="M40 170 C 80 160, 100 115, 150 115 S 230 55, 260 45"
                    stroke="#0b5d45"
                    stroke-width="5"
                    fill="none"
                    stroke-linecap="round"
                    class="ruta-animada"
                  />
                  <g transform="translate(40 170)">
                    <circle r="11" fill="#142019" stroke="#fff" stroke-width="3" />
                    <text y="4" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">
                      A
                    </text>
                  </g>
                  <g transform="translate(260 45)">
                    <circle r="11" fill="#0b5d45" stroke="#fff" stroke-width="3" />
                    <text y="4" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">
                      B
                    </text>
                  </g>
                  <g transform="translate(150 115)">
                    <circle r="18" fill="#0b5d45" opacity="0.2">
                      <animate
                        attributeName="r"
                        values="12;22;12"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle r="9" fill="#f5c518" stroke="#142019" stroke-width="2.5" />
                  </g>
                </svg>
                <div class="space-y-3 p-4">
                  <ol class="tarjeta space-y-2 p-3 text-sm">
                    <li class="flex items-center gap-2 text-piedra">
                      <span class="grid size-5 place-items-center rounded-full bg-bosque text-white"
                        ><ti-icono nombre="check" class="size-3"
                      /></span>
                      Recogido con código, 6 bultos
                    </li>
                    <li class="flex items-center gap-2 font-bold">
                      <span class="size-5 rounded-full border-4 border-marca bg-placa"></span>
                      En camino, llega en 12 min
                    </li>
                    <li class="flex items-center gap-2 text-piedra">
                      <span class="size-5 rounded-full border-2 border-linea"></span>
                      Entrega con tu PIN
                    </li>
                  </ol>
                  <div class="tarjeta flex items-center gap-3 p-3">
                    <span
                      class="grid size-10 place-items-center rounded-full bg-marca-suave font-bold text-marca"
                      >CR</span
                    >
                    <div class="text-sm">
                      <p class="font-bold">Camilo R. <span class="text-piedra">★ 4,9</span></p>
                      <p class="text-piedra">Camioneta, placa ABC12D</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div>
            <div tiRevelar>
              <p class="antetitulo">Seguridad</p>
              <h2 class="mt-3 text-3xl font-extrabold sm:text-4xl">Tranquilidad en cada entrega</h2>
              <p class="mt-4 text-lg text-piedra">
                Sabes quién lleva tu carga, por dónde va y en qué paso está. Y queda constancia de
                cada entrega.
              </p>
            </div>
            <ul class="mt-10 grid gap-6 sm:grid-cols-2">
              @for (g of garantias; track g.titulo; let i = $index) {
                <li tiRevelar [retraso]="i * 80" class="flex gap-4">
                  <span
                    class="grid size-11 shrink-0 place-items-center rounded-xl bg-bosque-suave text-bosque"
                  >
                    <ti-icono [nombre]="g.icono" />
                  </span>
                  <div>
                    <h3>{{ g.titulo }}</h3>
                    <p class="mt-1 text-sm text-piedra">{{ g.texto }}</p>
                  </div>
                </li>
              }
            </ul>
          </div>
        </div>
      </section>

      <!-- Cobertura y tarifas -->
      <section id="tarifas" class="bg-papel py-20 sm:py-24">
        <div class="contenedor-ancho grid items-start gap-12 lg:grid-cols-[1fr_1.1fr]">
          <div tiRevelar>
            <p class="antetitulo">Cobertura y tarifas</p>
            <h2 class="mt-3 text-3xl font-extrabold sm:text-4xl">Precios claros, sin sorpresas</h2>
            <p class="mt-4 text-lg text-piedra">
              Pagas por la distancia real y el vehículo que necesitas, con una tarifa mínima para
              viajes cortos. En trasteos sumas {{ valorAyudante | cop }} por ayudante y
              {{ valorPiso | cop }} por piso sin ascensor. Calcula un valor aproximado:
            </p>

            @if (zonas().length > 0) {
              <div class="tarjeta mt-8 p-6">
                <div class="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label for="calc-vehiculo" class="etiqueta">Vehículo</label>
                    <select
                      id="calc-vehiculo"
                      class="campo"
                      [ngModel]="vehiculoCalculo()"
                      (ngModelChange)="vehiculoCalculo.set($event)"
                    >
                      @for (t of tarifas(); track t.categoria) {
                        <option [value]="t.categoria">{{ t.categoria }}</option>
                      }
                    </select>
                  </div>
                  <div>
                    <label for="calc-zona" class="etiqueta">Zona de destino</label>
                    <select
                      id="calc-zona"
                      class="campo"
                      [ngModel]="zonaCalculo()"
                      (ngModelChange)="zonaCalculo.set(+$event)"
                    >
                      @for (z of zonas(); track z.id) {
                        <option [value]="z.id">{{ z.nombre }}</option>
                      }
                    </select>
                  </div>
                  <div class="sm:col-span-2">
                    <label for="calc-km" class="etiqueta"
                      >Distancia: <span class="numeros text-marca">{{ km() }} km</span>
                      <span class="font-normal text-piedra"
                        >(unos {{ km() * minutosPorKm }} min)</span
                      ></label
                    >
                    <input
                      id="calc-km"
                      type="range"
                      min="1"
                      max="40"
                      class="mt-3 w-full accent-marca"
                      [ngModel]="km()"
                      (ngModelChange)="km.set(+$event)"
                    />
                  </div>
                </div>
                <div class="mt-6 flex items-end justify-between gap-4 border-t border-linea pt-5">
                  <p class="text-sm text-piedra">
                    @if (tarifaElegida(); as t) {
                      {{ t.banderazo | cop }} + {{ t.porKm | cop }}/km + {{ t.porMinuto | cop }}/min
                      @if ((zonaElegida()?.tarifaBase ?? 0) > 0) {
                        + recargo {{ zonaElegida()?.tarifaBase | cop }}
                      }
                      <br /><span class="text-xs"
                        >Mínimo {{ t.minimo | cop }}, sin recargo nocturno</span
                      >
                    }
                  </p>
                  <p class="numeros text-3xl font-extrabold text-marca">{{ estimado() | cop }}</p>
                </div>
              </div>

              <ul
                class="mt-6 divide-y divide-linea overflow-hidden rounded-2xl border border-linea"
              >
                @for (z of zonas(); track z.id) {
                  <li class="flex items-center justify-between gap-3 bg-crema px-5 py-3">
                    <span class="flex min-w-0 items-center gap-2 font-semibold"
                      ><ti-icono nombre="map-pin" class="size-4 shrink-0 text-marca" />
                      <span class="truncate">{{ z.nombre }}</span></span
                    >
                    <span class="numeros shrink-0 text-sm text-piedra">
                      @if (z.tarifaBase > 0) {
                        recargo <strong class="text-tinta">{{ z.tarifaBase | cop }}</strong>
                      } @else {
                        <strong class="text-exito">sin recargo</strong>
                      }
                    </span>
                  </li>
                }
              </ul>
            } @else if (errorZonas()) {
              <p class="mt-6 rounded-xl bg-aviso-suave p-4 text-sm">
                Las tarifas no están disponibles en este momento. Crea tu cuenta para cotizar.
              </p>
            } @else {
              <div class="mt-8 space-y-3">
                <div class="esqueleto h-40"></div>
                <div class="esqueleto h-24"></div>
              </div>
            }
          </div>
          <div tiRevelar [retraso]="150" class="lg:sticky lg:top-24">
            <ti-ilustracion-cobertura />
          </div>
        </div>
      </section>

      <!-- Conductores -->
      <section id="conductores" class="relative overflow-hidden bg-marca py-20 text-white sm:py-24">
        <div
          class="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:24px_24px]"
        ></div>
        <div class="contenedor-ancho relative grid items-center gap-12 lg:grid-cols-2">
          <div tiRevelar>
            <p class="antetitulo !text-placa">Trabaja con nosotros</p>
            <h2 class="mt-3 text-3xl font-extrabold sm:text-4xl">
              Gana con tu moto, motocarro, camioneta o camión
            </h2>
            <p class="mt-4 text-lg text-white/85">
              Tú decides qué servicios tomar. Te quedas con el 80 % de cada tarifa y ves tus
              ganancias en tiempo real. Antes de empezar revisamos tus documentos uno por uno.
            </p>
            <ul class="mt-8 space-y-4">
              @for (b of beneficios; track b) {
                <li class="flex items-start gap-3">
                  <span
                    class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-placa text-tinta"
                    ><ti-icono nombre="check" class="size-4"
                  /></span>
                  <span>{{ b }}</span>
                </li>
              }
            </ul>
            <a
              routerLink="/registro"
              [queryParams]="{ rol: 'conductor' }"
              class="btn-acento btn-grande mt-10"
            >
              Registrarme como conductor <ti-icono nombre="arrow-right" />
            </a>
          </div>
          <div tiRevelar [retraso]="150" class="mx-auto w-full max-w-md">
            <ti-ilustracion-conductor />
          </div>
        </div>
      </section>

      <!-- Preguntas frecuentes -->
      <section class="py-20 sm:py-24">
        <div class="contenedor max-w-3xl">
          <div tiRevelar class="text-center">
            <p class="antetitulo">Preguntas frecuentes</p>
            <h2 class="mt-3 text-3xl font-extrabold sm:text-4xl">Lo que más nos preguntan</h2>
          </div>
          <div class="mt-10 space-y-3">
            @for (q of preguntas; track q.p; let i = $index) {
              <details
                tiRevelar
                [retraso]="i * 60"
                class="tarjeta group p-0 open:shadow-[var(--shadow-elevada)]"
              >
                <summary
                  class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-bold [&::-webkit-details-marker]:hidden"
                >
                  {{ q.p }}
                  <ti-icono
                    nombre="chevron-down"
                    class="text-marca transition-transform duration-300 group-open:rotate-180"
                  />
                </summary>
                <p class="px-5 pb-5 text-piedra">{{ q.r }}</p>
              </details>
            }
          </div>
        </div>
      </section>

      <!-- Contacto -->
      <section id="contacto" class="bg-papel py-20 sm:py-24">
        <div class="contenedor-ancho grid gap-12 lg:grid-cols-[1fr_1.2fr]">
          <div tiRevelar>
            <p class="antetitulo">Contacto</p>
            <h2 class="mt-3 text-3xl font-extrabold sm:text-4xl">
              ¿Tienes un negocio o una pregunta?
            </h2>
            <p class="mt-4 text-lg text-piedra">
              Escríbenos si quieres envíos frecuentes para tu empresa, tienes dudas como conductor o
              necesitas ayuda con un envío. Te respondemos al correo que nos dejes.
            </p>
            <ul class="mt-8 space-y-4">
              <li class="flex items-center gap-3">
                <span class="grid size-11 place-items-center rounded-xl bg-marca-suave text-marca"
                  ><ti-icono nombre="building"
                /></span>
                Planes para tiendas y empresas
              </li>
              <li class="flex items-center gap-3">
                <span class="grid size-11 place-items-center rounded-xl bg-marca-suave text-marca"
                  ><ti-icono nombre="headset"
                /></span>
                Soporte con tus envíos
              </li>
              <li class="flex items-center gap-3">
                <span class="grid size-11 place-items-center rounded-xl bg-marca-suave text-marca"
                  ><ti-icono nombre="map"
                /></span>
                Fusagasugá, Silvania, Pasca y veredas
              </li>
            </ul>
          </div>

          <div tiRevelar [retraso]="120" class="tarjeta p-6 sm:p-8">
            @if (enviado()) {
              <div class="py-10 text-center" role="status">
                <span
                  class="mx-auto grid size-16 place-items-center rounded-full bg-exito-suave text-exito"
                  ><ti-icono nombre="circle-check" class="size-9"
                /></span>
                <h3 class="mt-5 text-xl">¡Mensaje enviado!</h3>
                <p class="mt-2 text-piedra">
                  Gracias por escribirnos. Te responderemos pronto a tu correo.
                </p>
                <button type="button" class="btn-secundario mt-6" (click)="enviado.set(false)">
                  Enviar otro mensaje
                </button>
              </div>
            } @else {
              <form
                [formGroup]="contacto"
                (ngSubmit)="enviar()"
                novalidate
                class="grid gap-5 sm:grid-cols-2"
              >
                <div>
                  <label for="c-nombre" class="etiqueta">Nombre</label>
                  <input
                    id="c-nombre"
                    class="campo"
                    formControlName="nombre"
                    autocomplete="name"
                    [attr.aria-invalid]="invalido('nombre')"
                  />
                  @if (invalido('nombre')) {
                    <p class="error-campo">Escribe tu nombre.</p>
                  }
                </div>
                <div>
                  <label for="c-correo" class="etiqueta">Correo</label>
                  <input
                    id="c-correo"
                    type="email"
                    class="campo"
                    formControlName="correo"
                    autocomplete="email"
                    [attr.aria-invalid]="invalido('correo')"
                  />
                  @if (invalido('correo')) {
                    <p class="error-campo">Escribe un correo válido.</p>
                  }
                </div>
                <div>
                  <label for="c-telefono" class="etiqueta"
                    >Teléfono <span class="font-normal text-piedra">(opcional)</span></label
                  >
                  <input
                    id="c-telefono"
                    type="tel"
                    class="campo"
                    formControlName="telefono"
                    autocomplete="tel"
                    inputmode="tel"
                  />
                </div>
                <div>
                  <label for="c-asunto" class="etiqueta">Asunto</label>
                  <select id="c-asunto" class="campo" formControlName="asunto">
                    @for (a of asuntos; track a) {
                      <option [value]="a">{{ a }}</option>
                    }
                  </select>
                </div>
                <div class="sm:col-span-2">
                  <label for="c-mensaje" class="etiqueta">Mensaje</label>
                  <textarea
                    id="c-mensaje"
                    rows="4"
                    class="campo"
                    formControlName="mensaje"
                    maxlength="1000"
                    [attr.aria-invalid]="invalido('mensaje')"
                  ></textarea>
                  @if (invalido('mensaje')) {
                    <p class="error-campo">Cuéntanos un poco más (mínimo 10 caracteres).</p>
                  }
                </div>
                @if (errorContacto()) {
                  <p
                    class="rounded-lg bg-alerta-suave px-3 py-2 text-sm font-medium text-alerta sm:col-span-2"
                    role="alert"
                  >
                    {{ errorContacto() }}
                  </p>
                }
                <button
                  type="submit"
                  class="btn-primario btn-grande sm:col-span-2"
                  [disabled]="enviando()"
                >
                  @if (enviando()) {
                    <ti-icono nombre="loader" class="animate-spin" /> Enviando…
                  } @else {
                    <ti-icono nombre="send" /> Enviar mensaje
                  }
                </button>
              </form>
            }
          </div>
        </div>
      </section>
    </main>

    <ti-sitio-pie />
  `,
})
export class InicioPage implements OnInit {
  protected readonly session = inject(SessionService);
  private readonly sitio = inject(PublicSitePort);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly log = inject(LoggerPort);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly pasos = PASOS;
  protected readonly servicios = LISTA_SERVICIOS;
  protected readonly valorAyudante = VALOR_AYUDANTE;
  protected readonly valorPiso = VALOR_PISO;
  protected readonly garantias = GARANTIAS;
  protected readonly preguntas = PREGUNTAS;
  protected readonly asuntos = ASUNTOS_CONTACTO;
  protected readonly minutosPorKm = MINUTOS_POR_KM;
  protected readonly beneficios = [
    'Registro en línea: tomas la foto de cada documento con el celular.',
    'Antes de aceptar ves qué llevas, a dónde, cuánto pesa y lo que ganas.',
    'Un solo botón por paso: llegué, recogí, llegué al destino, entregué.',
    'Te avisamos 15 días antes de que se venza un documento.',
  ];

  /** Botón principal: al panel si ya hay sesión, al registro si no. */
  protected readonly enlacePedir = computed(() =>
    this.session.estaAutenticado() ? this.session.inicioDelRol() : '/registro',
  );

  protected readonly esCliente = computed(() => this.session.rol() === ROL.CLIENTE);

  /** Las tarjetas de servicio abren el pedido directo para el cliente. */
  protected readonly enlaceServicio = computed(() => {
    if (this.esCliente()) return '/cliente/nuevo-envio';
    return this.enlacePedir();
  });

  protected readonly estadisticas = signal<EstadisticasPublicas | null>(null);
  protected readonly zonas = signal<Zona[]>([]);
  protected readonly errorZonas = signal(false);
  protected readonly tarifas = signal<TarifaVehiculo[]>(TARIFAS_REFERENCIA);
  protected readonly vehiculoCalculo = signal<string>('Moto Express');
  protected readonly zonaCalculo = signal(0);
  protected readonly km = signal(5);
  protected readonly zonaElegida = computed<Zona | undefined>(
    () => this.zonas().find((z) => z.id === this.zonaCalculo()) ?? this.zonas()[0],
  );
  protected readonly tarifaElegida = computed<TarifaVehiculo | undefined>(
    () => this.tarifas().find((t) => t.categoria === this.vehiculoCalculo()) ?? this.tarifas()[0],
  );
  protected readonly estimado = computed(() => {
    const t = this.tarifaElegida();
    if (!t) return 0;
    return precioEstimado(
      t,
      this.km(),
      this.km() * MINUTOS_POR_KM,
      this.zonaElegida()?.tarifaBase ?? 0,
    );
  });

  /** Solo se muestran cifras reales y con valor: un sitio nuevo no exhibe ceros. */
  protected readonly cifras = computed(() => {
    const e = this.estadisticas();
    if (!e) return [];
    const lista = [
      { etiqueta: 'envíos entregados', valor: e.enviosEntregados, decimales: 0, sufijo: '' },
      {
        etiqueta: 'conductores verificados',
        valor: e.conductoresActivos,
        decimales: 0,
        sufijo: '',
      },
      { etiqueta: 'zonas de cobertura', valor: e.zonasCubiertas, decimales: 0, sufijo: '' },
      {
        etiqueta: 'calificación promedio',
        valor: e.calificacionPromedio,
        decimales: 1,
        sufijo: ' ★',
      },
    ];
    return lista.filter((c) => c.valor > 0);
  });

  protected readonly contacto = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    correo: ['', [Validators.required, Validators.email]],
    telefono: [''],
    asunto: this.fb.control<AsuntoContacto>('General'),
    mensaje: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(1000)]],
  });
  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly errorContacto = signal('');

  ngOnInit(): void {
    void this.inicializar();
  }

  /** Carga inicial (asíncrona); el hook de Angular no espera promesas. */
  async inicializar(): Promise<void> {
    const [estadisticas, zonas, tarifas] = await Promise.allSettled([
      this.sitio.estadisticas(),
      this.sitio.zonas(),
      this.sitio.tarifas(),
    ]);
    if (estadisticas.status === 'fulfilled') this.estadisticas.set(estadisticas.value);
    if (tarifas.status === 'fulfilled' && tarifas.value.tarifas.length > 0)
      this.tarifas.set(tarifas.value.tarifas);
    if (zonas.status === 'fulfilled') {
      this.zonas.set(zonas.value);
      this.zonaCalculo.set(zonas.value[0]?.id ?? 0);
    } else this.errorZonas.set(true);
  }

  protected invalido(campo: 'nombre' | 'correo' | 'mensaje'): boolean {
    const c = this.contacto.controls[campo];
    return c.invalid && (c.touched || c.dirty);
  }

  async enviar(): Promise<void> {
    this.contacto.markAllAsTouched();
    if (this.contacto.invalid || this.enviando()) return;
    this.enviando.set(true);
    this.errorContacto.set('');
    try {
      await this.sitio.contactar(this.contacto.getRawValue());
      this.log.info('Sitio', 'Mensaje de contacto enviado');
      this.enviado.set(true);
      this.contacto.reset({ asunto: 'General' });
    } catch (e) {
      this.errorContacto.set(this.mapper.traducir(e));
    } finally {
      this.enviando.set(false);
    }
  }
}
