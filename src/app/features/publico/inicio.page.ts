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
import { ASUNTOS_CONTACTO, AsuntoContacto, EstadisticasPublicas, Zona } from '../../core/domain';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { LoggerPort, PublicSitePort } from '../../core/ports';
import { ContadorDirective } from '../../shared/directives/contador.directive';
import { RevelarDirective } from '../../shared/directives/revelar.directive';
import { IlustracionCoberturaComponent } from '../../shared/ilustraciones/cobertura.component';
import { IlustracionConductorComponent } from '../../shared/ilustraciones/conductor.component';
import { IlustracionHeroComponent } from '../../shared/ilustraciones/hero.component';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { IconoComponent, NombreIcono } from '../../shared/ui/icono.component';
import { PlacaComponent } from '../../shared/ui/placa.component';
import { SitioCabeceraComponent } from './sitio-cabecera.component';
import { SitioPieComponent } from './sitio-pie.component';

/** Costo por kilómetro que suma el backend a la tarifa base de la zona. */
export const COSTO_KM = 1000;

interface Paso {
  icono: NombreIcono;
  titulo: string;
  texto: string;
}

const PASOS: Paso[] = [
  {
    icono: 'calendar',
    titulo: 'Cotiza en segundos',
    texto:
      'Escribe origen, destino y zona. Ves la distancia, el tiempo estimado y el precio antes de pedir.',
  },
  {
    icono: 'lock',
    titulo: 'Recibe tu PIN',
    texto: 'Al confirmar te damos un PIN de 4 dígitos. Solo tú lo ves y solo tú lo entregas.',
  },
  {
    icono: 'map-pinned',
    titulo: 'Síguelo en el mapa',
    texto: 'Ves al conductor en tiempo real, cuánto le falta y la hora estimada de llegada.',
  },
  {
    icono: 'package-check',
    titulo: 'Entrega verificada',
    texto: 'El conductor solo cierra la entrega con tu PIN y una foto como evidencia.',
  },
];

const SERVICIOS: { icono: NombreIcono; titulo: string; texto: string; vehiculo: string }[] = [
  {
    icono: 'file-text',
    titulo: 'Documentos',
    texto: 'Contratos, facturas, trámites y sobres que no pueden esperar.',
    vehiculo: 'Moto Express',
  },
  {
    icono: 'store',
    titulo: 'Mercancía general',
    texto: 'Pedidos de tu tienda, mercado y paquetes medianos.',
    vehiculo: 'Moto Express o Motocarro',
  },
  {
    icono: 'package',
    titulo: 'Carga pesada',
    texto: 'Electrodomésticos, insumos agrícolas y bultos voluminosos.',
    vehiculo: 'Motocarro o Camioneta',
  },
  {
    icono: 'truck',
    titulo: 'Acarreos',
    texto: 'Trasteos pequeños y traslados entre veredas y el casco urbano.',
    vehiculo: 'Camioneta',
  },
];

const GARANTIAS: { icono: NombreIcono; titulo: string; texto: string }[] = [
  {
    icono: 'lock',
    titulo: 'PIN de entrega',
    texto: 'Nadie más puede recibir tu paquete: la entrega se valida con tu código.',
  },
  {
    icono: 'camera',
    titulo: 'Foto como evidencia',
    texto: 'Cada entrega queda con una foto tomada por el conductor.',
  },
  {
    icono: 'badge-check',
    titulo: 'Conductores verificados',
    texto: 'Revisamos cédula, SOAT y licencia antes de aprobar a cada conductor.',
  },
  {
    icono: 'bell-ring',
    titulo: 'Avisos en cada paso',
    texto: 'Te avisamos cuando lo aceptan, cuando sale y cuando llega.',
  },
  {
    icono: 'circle-dollar',
    titulo: 'Precio claro',
    texto: 'Tarifa base de la zona más $1.000 por km. Lo ves antes de confirmar.',
  },
  {
    icono: 'star',
    titulo: 'Calificación',
    texto: 'Califica cada servicio. La reputación de los conductores es visible.',
  },
];

const PREGUNTAS = [
  {
    p: '¿Cómo se calcula la tarifa?',
    r: 'Es la tarifa base de la zona de destino más $1.000 por kilómetro recorrido. La distancia se calcula con OpenStreetMap y la ves antes de confirmar el envío.',
  },
  {
    p: '¿Para qué sirve el PIN?',
    r: 'Es la llave de tu entrega. El conductor solo puede cerrar el servicio con el PIN que tú le dictas al recibir el paquete, así nadie más lo puede reclamar.',
  },
  {
    p: '¿Puedo cancelar un envío?',
    r: 'Sí. Mientras ningún conductor lo haya tomado, lo cancelas desde el detalle del envío sin costo.',
  },
  {
    p: '¿Cómo sigo mi paquete?',
    r: 'Desde "Mis envíos" abres el seguimiento: ves al conductor en el mapa, el recorrido, la distancia que falta y la hora estimada de llegada.',
  },
  {
    p: '¿Qué necesito para ser conductor?',
    r: 'Crear tu cuenta como conductor, registrar tu vehículo (moto, motocarro o camioneta) y subir tu cédula, SOAT y licencia. Puedes tomarles foto con la cámara del celular. Cuando te aprobamos, empiezas a tomar servicios.',
  },
  {
    p: '¿Cuánto gana un conductor?',
    r: 'El 80 % de la tarifa de cada servicio que completa. En su panel ve lo que ha ganado en el mes y en total.',
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
    PlacaComponent,
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
          class="contenedor-ancho relative grid items-center gap-12 pb-16 lg:grid-cols-[1.05fr_1fr] lg:pb-24"
        >
          <div class="animate-[var(--animate-aparecer)]">
            <p class="antetitulo">
              <ti-icono nombre="mountain" class="size-4" /> Fusagasugá y la región del Sumapaz
            </p>
            <h1 class="mt-4 text-[2.5rem] leading-[1.05] font-extrabold sm:text-[3.5rem]">
              De la vereda al casco urbano, <span class="text-marca">seguro y a tiempo.</span>
            </h1>
            <p class="mt-5 max-w-xl text-lg text-piedra">
              Cotiza, pide y sigue tus envíos en el mapa. Cada entrega se confirma con un PIN que
              solo tú conoces y una foto como evidencia.
            </p>
            <div class="mt-8 flex flex-wrap gap-3">
              <a
                [routerLink]="session.estaAutenticado() ? session.inicioDelRol() : '/registro'"
                class="btn-primario btn-grande"
              >
                {{ session.estaAutenticado() ? 'Ir a mi panel' : 'Cotizar mi envío' }}
                <ti-icono nombre="arrow-right" />
              </a>
              <a routerLink="/" fragment="conductores" class="btn-secundario btn-grande">
                <ti-icono nombre="bike" class="text-marca" /> Quiero ser conductor
              </a>
            </div>
            <ul class="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-piedra">
              <li class="flex items-center gap-2">
                <ti-icono nombre="shield-check" class="text-bosque" /> Conductores verificados
              </li>
              <li class="flex items-center gap-2">
                <ti-icono nombre="radar" class="text-bosque" /> Seguimiento en vivo
              </li>
              <li class="flex items-center gap-2">
                <ti-icono nombre="lock" class="text-bosque" /> Entrega con PIN
              </li>
            </ul>
          </div>

          <div class="relative animate-[var(--animate-aparecer)] [animation-delay:150ms]">
            <div class="overflow-hidden rounded-[2.25rem] shadow-[var(--shadow-elevada)]">
              <ti-ilustracion-hero />
            </div>
            <div
              class="tarjeta absolute -left-3 top-8 hidden w-56 p-3 sm:block lg:-left-10"
              style="animation: var(--animate-flotar)"
            >
              <p class="flex items-center gap-2 text-xs font-bold text-bosque">
                <span
                  class="size-2 rounded-full bg-bosque"
                  style="animation: var(--animate-pulso)"
                ></span>
                EN VIVO
              </p>
              <p class="mt-1 font-bold">Envío #1043 va en camino</p>
              <p class="text-sm text-piedra">
                Llega en <strong class="text-tinta">12 min</strong> · 3,4 km
              </p>
            </div>
            <div
              class="tarjeta absolute -right-2 bottom-8 hidden items-center gap-3 p-3 sm:flex lg:-right-8"
              style="animation: var(--animate-flotar); animation-delay: -2.5s"
            >
              <ti-placa
                valor="4821"
                etiqueta="PIN de entrega de ejemplo"
                pie="PIN"
                tamano="pequeno"
              />
              <div>
                <p class="text-sm font-bold">Entregado</p>
                <p class="text-xs text-piedra">Validado con PIN y foto</p>
              </div>
            </div>
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
      <section id="como-funciona" class="py-20 sm:py-24">
        <div class="contenedor-ancho">
          <div tiRevelar class="mx-auto max-w-2xl text-center">
            <p class="antetitulo">Cómo funciona</p>
            <h2 class="mt-3 text-3xl font-extrabold sm:text-4xl">Tu envío en cuatro pasos</h2>
            <p class="mt-4 text-lg text-piedra">
              Sin llamadas ni esperas: todo desde el celular o el computador.
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
                stroke="#fdba74"
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
                    class="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full border-2 border-niebla bg-placa text-sm font-extrabold text-tinta"
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

      <!-- Servicios -->
      <section id="servicios" class="bg-papel py-20 sm:py-24">
        <div class="contenedor-ancho">
          <div tiRevelar class="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div class="max-w-xl">
              <p class="antetitulo">Servicios</p>
              <h2 class="mt-3 text-3xl font-extrabold sm:text-4xl">
                Llevamos lo que necesites mover
              </h2>
            </div>
            <p class="max-w-md text-piedra">
              Elige el tipo de carga y, si hace falta, el vehículo. Solo lo verán conductores con
              ese vehículo.
            </p>
          </div>
          <div class="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            @for (s of servicios; track s.titulo; let i = $index) {
              <article tiRevelar [retraso]="i * 100" class="tarjeta-interactiva group p-6">
                <span
                  class="grid size-14 place-items-center rounded-xl bg-marca-suave text-marca transition-colors group-hover:bg-marca group-hover:text-white"
                >
                  <ti-icono [nombre]="s.icono" class="size-7" />
                </span>
                <h3 class="mt-5 text-lg">{{ s.titulo }}</h3>
                <p class="mt-2 text-piedra">{{ s.texto }}</p>
                <p class="mt-4 flex items-center gap-2 text-sm font-semibold text-bosque">
                  <ti-icono nombre="bike" class="size-4" /> {{ s.vehiculo }}
                </p>
              </article>
            }
          </div>
        </div>
      </section>

      <!-- Seguridad y app -->
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
                  <span class="text-sm font-extrabold">Envío #1043</span>
                  <span class="insignia bg-marca text-white">En Ruta</span>
                </div>
                <svg viewBox="0 0 300 220" class="block w-full bg-[#eef2ec]">
                  <path
                    d="M0 60 H300 M0 150 H300 M80 0 V220 M210 0 V220"
                    stroke="#fff"
                    stroke-width="10"
                  />
                  <path
                    d="M0 105 C 60 100, 90 140, 150 130 S 250 70, 300 80"
                    stroke="#dbe7df"
                    stroke-width="16"
                    fill="none"
                  />
                  <path
                    d="M40 180 C 80 170, 100 120, 150 120 S 230 60, 260 50"
                    stroke="#c2410c"
                    stroke-width="5"
                    fill="none"
                    stroke-linecap="round"
                    class="ruta-animada"
                  />
                  <circle cx="40" cy="180" r="9" fill="#1f1a17" stroke="#fff" stroke-width="3" />
                  <g transform="translate(260 50)">
                    <circle r="11" fill="#c2410c" stroke="#fff" stroke-width="3" />
                    <circle r="4" fill="#f5c518" />
                  </g>
                  <g transform="translate(150 120)">
                    <circle r="18" fill="#c2410c" opacity="0.2">
                      <animate
                        attributeName="r"
                        values="12;22;12"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle r="10" fill="#c2410c" stroke="#fff" stroke-width="3" />
                  </g>
                </svg>
                <div class="space-y-3 p-4">
                  <div class="tarjeta flex items-center justify-between p-3">
                    <div>
                      <p class="text-xs text-piedra">Llegada estimada</p>
                      <p class="text-xl font-extrabold">12 min</p>
                    </div>
                    <div class="text-right">
                      <p class="text-xs text-piedra">Faltan</p>
                      <p class="text-xl font-extrabold">3,4 km</p>
                    </div>
                  </div>
                  <div class="tarjeta flex items-center gap-3 p-3">
                    <span
                      class="grid size-10 place-items-center rounded-full bg-marca-suave font-bold text-marca"
                      >CR</span
                    >
                    <div class="text-sm">
                      <p class="font-bold">Camilo R. · ★ 4,9</p>
                      <p class="text-piedra">Moto Express · ABC12D</p>
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
                Diseñamos cada paso para que tu paquete llegue a quien debe, y para que siempre
                sepas dónde está.
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
              Pagas la tarifa base de la zona más {{ costoKm | cop }} por kilómetro. Calcula un
              valor aproximado:
            </p>

            @if (zonas().length > 0) {
              <div class="tarjeta mt-8 p-6">
                <div class="grid gap-5 sm:grid-cols-2">
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
                  <div>
                    <label for="calc-km" class="etiqueta"
                      >Distancia: <span class="numeros text-marca">{{ km() }} km</span></label
                    >
                    <input
                      id="calc-km"
                      type="range"
                      min="1"
                      max="60"
                      class="mt-3 w-full accent-marca"
                      [ngModel]="km()"
                      (ngModelChange)="km.set(+$event)"
                    />
                  </div>
                </div>
                <div class="mt-6 flex items-end justify-between gap-4 border-t border-linea pt-5">
                  <p class="text-sm text-piedra">
                    {{ zonaElegida()?.tarifaBase ?? 0 | cop }} base + {{ km() }} km ×
                    {{ costoKm | cop }}
                  </p>
                  <p class="numeros text-3xl font-extrabold text-marca">{{ estimado() | cop }}</p>
                </div>
              </div>

              <ul
                class="mt-6 divide-y divide-linea overflow-hidden rounded-2xl border border-linea"
              >
                @for (z of zonas(); track z.id) {
                  <li class="flex items-center justify-between bg-crema px-5 py-3">
                    <span class="flex items-center gap-2 font-semibold"
                      ><ti-icono nombre="map-pin" class="size-4 text-marca" /> {{ z.nombre }}</span
                    >
                    <span class="numeros text-piedra"
                      >desde <strong class="text-tinta">{{ z.tarifaBase | cop }}</strong></span
                    >
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
              Gana con tu moto, motocarro o camioneta
            </h2>
            <p class="mt-4 text-lg text-white/85">
              Tú decides qué servicios tomar. Te quedas con el 80 % de cada tarifa y ves tus
              ganancias en tiempo real.
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

      <!-- Llamado final -->
      <section class="py-20">
        <div tiRevelar class="contenedor-ancho">
          <div
            class="relative overflow-hidden rounded-[2rem] bg-noche px-6 py-14 text-center text-white sm:px-12"
          >
            <div
              class="pointer-events-none absolute -left-20 -top-20 size-72 rounded-full bg-marca/40 blur-3xl"
              aria-hidden="true"
            ></div>
            <div
              class="pointer-events-none absolute -bottom-24 -right-10 size-72 rounded-full bg-placa/20 blur-3xl"
              aria-hidden="true"
            ></div>
            <h2 class="relative text-3xl font-extrabold sm:text-4xl">
              Tu próximo envío empieza aquí
            </h2>
            <p class="relative mx-auto mt-4 max-w-xl text-white/80">
              Crea tu cuenta gratis y cotiza en menos de un minuto.
            </p>
            <div class="relative mt-8 flex flex-wrap justify-center gap-3">
              <a routerLink="/registro" class="btn-primario btn-grande">Crear mi cuenta</a>
              <a
                routerLink="/login"
                class="btn btn-grande border border-white/30 text-white hover:bg-white/10"
                >Ya tengo cuenta</a
              >
            </div>
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
  protected readonly servicios = SERVICIOS;
  protected readonly garantias = GARANTIAS;
  protected readonly preguntas = PREGUNTAS;
  protected readonly asuntos = ASUNTOS_CONTACTO;
  protected readonly costoKm = COSTO_KM;
  protected readonly beneficios = [
    'Registro en línea: sube tu cédula, SOAT y licencia con la cámara del celular.',
    'Ves el destino, el tipo de carga y lo que ganas antes de aceptar.',
    'Navegación con el mapa y avisos de cada servicio.',
    'Tu calificación crece con cada entrega bien hecha.',
  ];

  protected readonly estadisticas = signal<EstadisticasPublicas | null>(null);
  protected readonly zonas = signal<Zona[]>([]);
  protected readonly errorZonas = signal(false);
  protected readonly zonaCalculo = signal(0);
  protected readonly km = signal(8);
  protected readonly zonaElegida = computed<Zona | undefined>(
    () => this.zonas().find((z) => z.id === this.zonaCalculo()) ?? this.zonas()[0],
  );
  protected readonly estimado = computed(
    () => (this.zonaElegida()?.tarifaBase ?? 0) + this.km() * COSTO_KM,
  );

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

  async ngOnInit(): Promise<void> {
    const [estadisticas, zonas] = await Promise.allSettled([
      this.sitio.estadisticas(),
      this.sitio.zonas(),
    ]);
    if (estadisticas.status === 'fulfilled') this.estadisticas.set(estadisticas.value);
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
