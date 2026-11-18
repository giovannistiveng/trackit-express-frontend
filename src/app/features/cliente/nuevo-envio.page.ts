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
  WritableSignal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import {
  AbstractControl,
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  CAPACIDAD_KG,
  PESO_MAXIMO_KG,
  CATEGORIAS_VEHICULO,
  CategoriaVehiculo,
  DetalleServicio,
  MAX_AYUDANTES,
  MAX_PARADAS,
  MetodoPago,
  PagoResumen,
  RECARGO_PARADA,
  SERVICIOS,
  TIPOS_SERVICIO,
  TipoServicio,
  VALOR_AYUDANTE,
  Coordenadas,
  Cotizacion,
  Envio,
  Seguimiento,
  Zona,
  esIdValido,
  esTipoServicio,
  formatoDuracion,
  limpiarTexto,
  vehiculoMinimo,
} from '../../core/domain';
import { FechaLocalPipe } from '../../shared/pipes/fecha-local.pipe';
import { celularValido, PagoPanelComponent } from './components/pago-panel.component';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { LoggerPort, QuotePort, ShipmentsPort, ZonesPort } from '../../core/ports';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { CampoDireccionComponent } from '../../shared/ui/campo-direccion.component';
import { mostrarError } from '../../shared/ui/campo-error';
import { IconoComponent, NombreIcono } from '../../shared/ui/icono.component';
import { MapaEnvioComponent } from '../../shared/ui/mapa-envio.component';
import { PlacaComponent } from '../../shared/ui/placa.component';
import { ToastService } from '../../shared/ui/toast.service';
import { DesgloseTarifaComponent } from './components/desglose-tarifa.component';
import { PinEnvioComponent } from './components/pin-envio.component';

export const VIGENCIA_COTIZACION_MS = 15 * 60_000;
/** Pausa antes de recotizar sola tras un cambio (dirección elegida, vehículo, detalle). */
export const ESPERA_AUTOCOTIZAR_MS = 500;
/** Igual que el backend: programar con 30 minutos a 7 días de anticipación. */
export const PROGRAMAR_MINIMO_MIN = 30;
export const PROGRAMAR_MAXIMO_DIAS = 7;
const TEXTO_SIN_UBICAR = 'Ubícala: elige una sugerencia, usa tu ubicación o márcala en el mapa.';
const AYUDA_VEHICULO: Record<CategoriaVehiculo, string> = {
  'Moto Express': 'Mandados, mercados y paquetes hasta 20 kg',
  Furgoneta: 'Trasteos y carga pesada hasta 1.500 kg',
};
const ICONO_VEHICULO: Record<CategoriaVehiculo, NombreIcono> = {
  'Moto Express': 'bike',
  Furgoneta: 'truck',
};
/** Atajos para escribir lo que se lleva. */
const SUGERENCIAS_PAQUETE = ['Documentos', 'Ropa', 'Repuestos', 'Comida', 'Encomienda'];
const SUGERENCIAS_INSUMOS = [
  'Abono',
  'Concentrado',
  'Semillas',
  'Cosecha',
  'Herramientas',
  'Madera',
];

interface ParadaForm {
  clave: number;
  control: FormControl<string>;
  coords: WritableSignal<Coordenadas | null>;
}

/** "2026-11-02T19:30" en hora local, para los límites del datetime-local. */
export function fechaLocalInput(f: Date): string {
  const d = new Date(f.getTime() - f.getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

/** Mensaje de error de la fecha programada, o '' si es válida. */
export function errorFechaProgramada(valor: string, ahora = new Date()): string {
  if (!valor) return 'Elige la fecha y la hora.';
  const f = new Date(valor);
  if (Number.isNaN(f.getTime())) return 'La fecha no es válida.';
  if (f.getTime() - ahora.getTime() < PROGRAMAR_MINIMO_MIN * 60_000)
    return `Programa con al menos ${PROGRAMAR_MINIMO_MIN} minutos de anticipación.`;
  if (f.getTime() - ahora.getTime() > PROGRAMAR_MAXIMO_DIAS * 86_400_000)
    return `Puedes programar hasta ${PROGRAMAR_MAXIMO_DIAS} días después.`;
  return '';
}

/** Qué falta en los datos del servicio (igual que exige el backend), o '' si está completo. */
export function errorDetalle(tipo: TipoServicio, d: DetalleServicio): string {
  if ((tipo === 'mercado' || tipo === 'mandado') && !d.lista?.trim())
    return tipo === 'mercado' ? 'Escribe la lista del mercado.' : 'Cuéntanos qué hay que hacer.';
  if (tipo === 'trasteo' && !d.objetos?.trim()) return 'Cuéntanos qué vas a trastear.';
  if (tipo === 'insumos' && !d.insumo?.trim()) return 'Indica qué insumo llevas.';
  if (tipo === 'insumos' && !d.pesoKg) return 'Indica el peso aproximado en kilos.';
  if (d.pesoKg !== undefined && (d.pesoKg < 1 || d.pesoKg > PESO_MAXIMO_KG))
    return `El peso debe estar entre 1 y ${PESO_MAXIMO_KG.toLocaleString('es-CO')} kg.`;
  return '';
}

const textoValidator =
  (min: number, max: number): ValidatorFn =>
  (c: AbstractControl): ValidationErrors | null => {
    // Solo se usa en controles de texto no anulables
    const v = limpiarTexto(c.value as string);
    return v.length >= min && v.length <= max ? null : { longitud: { min, max } };
  };

const distintosValidator: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
  const { origen, destino } = g.value as { origen: string; destino: string };
  const o = limpiarTexto(origen).toLowerCase();
  const d = limpiarTexto(destino).toLowerCase();
  return o && d && o === d ? { iguales: true } : null;
};

const entero = (v: unknown): number | undefined => {
  const n = Number(v);
  return v === '' || v === null || v === undefined || !Number.isFinite(n)
    ? undefined
    : Math.round(n);
};

/** CU-005 Cotización y CU-006 Solicitud de pedido (mandado, mercado, paquete, trasteo o insumos). */
@Component({
  selector: 'ti-nuevo-envio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
    CopPipe,
    FechaLocalPipe,
    PagoPanelComponent,
    PinEnvioComponent,
    PlacaComponent,
    IconoComponent,
    CampoDireccionComponent,
    MapaEnvioComponent,
    DesgloseTarifaComponent,
  ],
  template: `
    <div class="contenedor-ancho max-w-5xl pb-28 lg:pb-0">
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
          <p class="mt-5 font-semibold text-exito">Pedido recibido</p>
          <h1 id="titulo-creado" class="mt-1">
            Tu {{ nombreServicio(envio) }} #{{ envio.id }} está buscando conductor
          </h1>
          <p class="mt-3 text-piedra">{{ textoCreado(envio) }}</p>
          @if (envio.pago?.metodo === 'nequi') {
            <ti-pago-panel
              class="mx-auto mt-6 block max-w-md text-left"
              [idEnvio]="envio.id"
              [pagoInicial]="envio.pago"
              (cambio)="alCambiarPago(envio, $event)"
            />
          }
          <div class="mx-auto mt-8 grid max-w-xl gap-4 text-left sm:grid-cols-2">
            @if (envio.codigoRecogida) {
              <div class="tarjeta p-5">
                <p class="flex items-center gap-2 font-semibold">
                  <ti-icono nombre="key" class="text-marca" /> Código de recogida
                </p>
                <p class="mt-1 text-sm text-piedra">
                  Quien entregue la carga se lo dice al conductor. Así se lleva el pedido correcto.
                </p>
                <div class="mt-4">
                  <ti-placa
                    [valor]="envio.codigoRecogida"
                    etiqueta="Código de recogida"
                    pie="RECOGIDA"
                  />
                </div>
              </div>
            }
            <div
              class="tarjeta border-2 border-tinta p-5"
              [class.sm:col-span-2]="!envio.codigoRecogida"
            >
              <p class="flex items-center gap-2 font-semibold">
                <ti-icono nombre="lock" class="text-marca" /> PIN de entrega
              </p>
              <p class="mt-1 text-sm text-piedra">
                Quien recibe se lo da al conductor solo cuando tenga el pedido en la mano.
              </p>
              <div class="mt-4"><ti-pin-envio [pin]="envio.pin ?? ''" /></div>
            </div>
          </div>
          @if (tarifaCambio(envio)) {
            <p
              class="mx-auto mt-4 max-w-md rounded-xl bg-aviso-suave px-4 py-3 text-left text-sm"
              role="status"
            >
              La tarifa final es {{ envio.tarifa | cop }}, distinta de la cotizada ({{
                precioConfirmado() | cop
              }}), porque la ruta o el horario cambiaron al crear el pedido.
            </p>
          }
          <dl
            class="tarjeta mx-auto mt-4 grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 p-5 text-left text-sm"
          >
            <dt class="text-piedra">Recoger en</dt>
            <dd class="font-medium">{{ envio.origen }}</dd>
            <dt class="text-piedra">Entregar en</dt>
            <dd class="font-medium">{{ envio.destino }}</dd>
            <dt class="text-piedra">Servicio</dt>
            <dd class="font-medium">{{ nombreServicio(envio) }}</dd>
            <dt class="text-piedra">Vehículo</dt>
            <dd class="font-medium">{{ envio.categoria ?? 'El que pueda llevarlo' }}</dd>
            <dt class="text-piedra">Tarifa</dt>
            <dd class="numeros font-bold">{{ envio.tarifa | cop }}</dd>
            <dt class="text-piedra">Pago</dt>
            <dd class="font-medium">
              {{ envio.metodoPago === 'nequi' ? 'Nequi' : 'Efectivo al recibir' }}
            </dd>
            @if (envio.fechaProgramada) {
              <dt class="text-piedra">Programado</dt>
              <dd class="font-medium">{{ envio.fechaProgramada | fechaLocal }}</dd>
            }
          </dl>
          <div class="mt-8 flex flex-wrap justify-center gap-3">
            <a class="btn-primario" [routerLink]="['/cliente/envios', envio.id]"
              ><ti-icono nombre="map-pinned" /> Seguir este pedido</a
            >
            <button type="button" class="btn-secundario" (click)="nuevo()">
              Hacer otro pedido
            </button>
          </div>
        </section>
      } @else {
        <div class="flex items-center gap-2">
          <a
            routerLink="/cliente/inicio"
            class="grid size-10 place-items-center rounded-full hover:bg-papel"
            aria-label="Volver al inicio"
          >
            <ti-icono nombre="arrow-left" />
          </a>
          <h1>Nuevo pedido</h1>
        </div>

        <fieldset class="mt-5 min-w-0">
          <legend class="sr-only">¿Qué necesitas?</legend>
          <div
            class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:px-0"
          >
            @for (s of servicios; track s.tipo) {
              <label
                class="relative flex min-w-28 shrink-0 cursor-pointer flex-col items-start gap-2 rounded-2xl border-2 bg-papel p-3 transition-colors"
                [class]="
                  servicio() === s.tipo
                    ? 'border-marca bg-marca-suave'
                    : 'border-transparent hover:border-linea'
                "
              >
                <input
                  type="radio"
                  class="sr-only"
                  name="servicio"
                  [id]="'servicio-' + s.tipo"
                  [value]="s.tipo"
                  [checked]="servicio() === s.tipo"
                  (change)="elegirServicio(s.tipo)"
                />
                <ti-icono [nombre]="s.info.icono" class="size-6 text-marca" />
                <span class="text-sm font-bold leading-tight">{{ s.info.nombre }}</span>
              </label>
            }
          </div>
          <p class="ayuda">{{ info().descripcion }}.</p>
        </fieldset>

        <div class="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_23rem]">
          <form [formGroup]="form" (ngSubmit)="cotizar()" novalidate class="space-y-4">
            <section class="tarjeta space-y-5 p-5 sm:p-6" aria-labelledby="titulo-recorrido">
              <h2 id="titulo-recorrido" class="text-base">Recorrido</h2>
              <div class="relative space-y-5 pl-9">
                <span
                  class="absolute bottom-16 left-[13px] top-10 w-0.5 border-l-2 border-dashed border-linea"
                  aria-hidden="true"
                ></span>
                <div class="relative">
                  <span
                    class="absolute -left-9 top-8 grid size-7 place-items-center rounded-full bg-tinta text-xs font-extrabold text-white"
                    aria-hidden="true"
                    >A</span
                  >
                  <label for="origen" class="etiqueta">{{ etiquetaOrigen() }}</label>
                  <ti-campo-direccion
                    idCampo="origen"
                    etiqueta="recogida"
                    formControlName="origen"
                    [placeholder]="placeholderOrigen()"
                    [conUbicacion]="true"
                    [coords]="origenCoords()"
                    (coordsChange)="origenCoords.set($event)"
                    [zonas]="zonas()"
                    [invalido]="err('origen')"
                    [idError]="err('origen') ? 'origen-error' : null"
                  />
                  @if (err('origen')) {
                    <p id="origen-error" class="error-campo">Escribe entre 3 y 200 caracteres.</p>
                  } @else if (sinUbicar('origen')) {
                    <p id="origen-error" class="error-campo">{{ textoSinUbicar }}</p>
                  }
                </div>
                @for (p of paradas(); track p.clave; let i = $index) {
                  <div class="relative">
                    <span
                      class="absolute -left-9 top-8 grid size-7 place-items-center rounded-full border-2 border-tinta bg-papel text-xs font-bold"
                      aria-hidden="true"
                      >{{ i + 1 }}</span
                    >
                    <div class="flex items-center justify-between">
                      <label [for]="'parada-' + p.clave" class="etiqueta">Parada {{ i + 1 }}</label>
                      <button
                        type="button"
                        class="btn-texto -mt-1 text-sm text-alerta"
                        (click)="quitarParada(p.clave)"
                        [attr.aria-label]="'Quitar parada ' + (i + 1)"
                      >
                        <ti-icono nombre="trash" class="size-4" /> Quitar
                      </button>
                    </div>
                    <ti-campo-direccion
                      [idCampo]="'parada-' + p.clave"
                      [etiqueta]="'parada ' + (i + 1)"
                      [formControl]="p.control"
                      placeholder="Dirección de la parada"
                      [coords]="p.coords()"
                      (coordsChange)="p.coords.set($event)"
                      [zonas]="zonas()"
                      [invalido]="paradaSinUbicar(p)"
                    />
                    @if (paradaSinUbicar(p)) {
                      <p class="error-campo">{{ textoSinUbicar }}</p>
                    }
                  </div>
                }
                <div class="relative">
                  <span
                    class="absolute -left-9 top-8 grid size-7 place-items-center rounded-full bg-placa text-xs font-extrabold text-tinta ring-2 ring-tinta"
                    aria-hidden="true"
                    >B</span
                  >
                  <label for="destino" class="etiqueta">Entregar en</label>
                  <ti-campo-direccion
                    idCampo="destino"
                    etiqueta="entrega"
                    formControlName="destino"
                    placeholder="Dirección, barrio, vereda o finca"
                    [coords]="destinoCoords()"
                    (coordsChange)="destinoCoords.set($event)"
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
                  } @else if (sinUbicar('destino')) {
                    <p id="destino-error" class="error-campo">{{ textoSinUbicar }}</p>
                  }
                </div>
              </div>
              @if (paradas().length < maxParadas) {
                <button type="button" class="btn-texto -mt-2 text-sm" (click)="agregarParada()">
                  <ti-icono nombre="plus" class="size-4" /> Agregar una parada
                  <span class="font-normal text-piedra">(+{{ recargoParada | cop }} c/u)</span>
                </button>
              }
              @if (rutaEnMapa(); as ruta) {
                <ti-mapa-envio [seguimiento]="ruta" [paradas]="coordsParadas()" />
              }
            </section>

            <section
              class="tarjeta space-y-4 p-5 sm:p-6"
              aria-labelledby="titulo-detalle"
              formGroupName="detalle"
            >
              <h2 id="titulo-detalle" class="text-base">{{ tituloDetalle() }}</h2>
              @switch (servicio()) {
                @case ('mandado') {
                  <div>
                    <label for="det-lista" class="etiqueta">¿Qué hay que hacer?</label>
                    <textarea
                      id="det-lista"
                      rows="3"
                      class="campo"
                      formControlName="lista"
                      maxlength="1000"
                      placeholder="Ej.: pagar el recibo de la luz en Efecty y traer el comprobante"
                      [attr.aria-invalid]="errDetalle()"
                    ></textarea>
                  </div>
                  <ng-container *ngTemplateOutlet="presupuesto" />
                }
                @case ('mercado') {
                  <div>
                    <label for="det-lista" class="etiqueta">Lista del mercado</label>
                    <textarea
                      id="det-lista"
                      rows="4"
                      class="campo"
                      formControlName="lista"
                      maxlength="1000"
                      placeholder="Una cosa por línea: 2 libras de arroz, 1 panal de huevos, aceite…"
                      [attr.aria-invalid]="errDetalle()"
                    ></textarea>
                    <p class="ayuda">
                      En "Recoger en" pon la tienda o la plaza donde quieres que compre.
                    </p>
                  </div>
                  <ng-container *ngTemplateOutlet="presupuesto" />
                }
                @case ('paquete') {
                  <div>
                    <label for="det-que" class="etiqueta"
                      >¿Qué envías? <span class="font-normal text-piedra">(opcional)</span></label
                    >
                    <input
                      id="det-que"
                      class="campo"
                      formControlName="queEnvias"
                      maxlength="80"
                      placeholder="Ej.: documentos"
                    />
                    <div class="mt-2 flex flex-wrap gap-2">
                      @for (t of sugerenciasPaquete; track t) {
                        <button type="button" class="chip" (click)="ponerTexto('queEnvias', t)">
                          {{ t }}
                        </button>
                      }
                    </div>
                  </div>
                  <ng-container *ngTemplateOutlet="cantidades" />
                }
                @case ('trasteo') {
                  <div>
                    <label for="det-objetos" class="etiqueta">¿Qué vas a trastear?</label>
                    <textarea
                      id="det-objetos"
                      rows="3"
                      class="campo"
                      formControlName="objetos"
                      maxlength="500"
                      placeholder="Ej.: nevera, cama doble, comedor de 4 puestos y 10 cajas"
                      [attr.aria-invalid]="errDetalle()"
                    ></textarea>
                  </div>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label for="det-piso-o" class="etiqueta">Piso donde se recoge</label>
                      <input
                        id="det-piso-o"
                        type="number"
                        min="1"
                        max="30"
                        class="campo"
                        formControlName="pisosOrigen"
                      />
                      <label class="mt-2 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          class="size-4 accent-[var(--color-marca)]"
                          formControlName="ascensorOrigen"
                        />
                        Hay ascensor
                      </label>
                    </div>
                    <div>
                      <label for="det-piso-d" class="etiqueta">Piso donde se entrega</label>
                      <input
                        id="det-piso-d"
                        type="number"
                        min="1"
                        max="30"
                        class="campo"
                        formControlName="pisosDestino"
                      />
                      <label class="mt-2 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          class="size-4 accent-[var(--color-marca)]"
                          formControlName="ascensorDestino"
                        />
                        Hay ascensor
                      </label>
                    </div>
                  </div>
                  <div>
                    <p class="etiqueta" id="ayudantes-titulo">Ayudantes para cargar y descargar</p>
                    <div
                      class="flex items-center gap-3"
                      role="group"
                      aria-labelledby="ayudantes-titulo"
                    >
                      <button
                        type="button"
                        class="grid size-11 place-items-center rounded-full border border-linea bg-papel disabled:opacity-40"
                        [disabled]="ayudantes() === 0"
                        (click)="cambiarAyudantes(-1)"
                        aria-label="Quitar un ayudante"
                      >
                        <ti-icono nombre="minus" />
                      </button>
                      <span
                        class="numeros w-8 text-center text-xl font-extrabold"
                        aria-live="polite"
                        >{{ ayudantes() }}</span
                      >
                      <button
                        type="button"
                        class="grid size-11 place-items-center rounded-full border border-linea bg-papel disabled:opacity-40"
                        [disabled]="ayudantes() >= maxAyudantes"
                        (click)="cambiarAyudantes(1)"
                        aria-label="Agregar un ayudante"
                      >
                        <ti-icono nombre="plus" />
                      </button>
                      <span class="text-sm text-piedra"
                        >{{ valorAyudante | cop }} cada uno. El conductor siempre ayuda.</span
                      >
                    </div>
                  </div>
                  <ng-container *ngTemplateOutlet="cantidades" />
                }
                @case ('insumos') {
                  <div>
                    <label for="det-insumo" class="etiqueta">¿Qué llevas?</label>
                    <input
                      id="det-insumo"
                      class="campo"
                      formControlName="insumo"
                      maxlength="200"
                      placeholder="Ej.: 10 bultos de abono"
                      [attr.aria-invalid]="errDetalle()"
                    />
                    <div class="mt-2 flex flex-wrap gap-2">
                      @for (t of sugerenciasInsumos; track t) {
                        <button type="button" class="chip" (click)="ponerTexto('insumo', t)">
                          {{ t }}
                        </button>
                      }
                    </div>
                  </div>
                  <ng-container *ngTemplateOutlet="cantidades" />
                  <label
                    class="flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 text-sm"
                    [class]="
                      valores().detalle.accesoDestapado
                        ? 'border-marca bg-marca-suave'
                        : 'border-linea'
                    "
                  >
                    <input
                      type="checkbox"
                      class="mt-1 size-4 accent-[var(--color-marca)]"
                      formControlName="accesoDestapado"
                    />
                    <span>
                      <span class="flex items-center gap-1.5 font-semibold"
                        ><ti-icono nombre="signpost" class="size-4" /> Vía destapada o entrada a
                        finca</span
                      >
                      <span class="block text-piedra"
                        >Suma el 15 % del viaje: el conductor va más despacio y gasta más.</span
                      >
                    </span>
                  </label>
                }
              }
              @if (errDetalle()) {
                <p class="error-campo" id="detalle-error">{{ textoErrorDetalle() }}</p>
              }

              <ng-template #presupuesto>
                <div>
                  <label for="det-presupuesto" class="etiqueta"
                    >¿Cuánto crees que cuesta la compra?
                    <span class="font-normal text-piedra">(opcional)</span></label
                  >
                  <input
                    id="det-presupuesto"
                    type="number"
                    min="0"
                    step="1000"
                    class="campo"
                    formControlName="presupuesto"
                    inputmode="numeric"
                    placeholder="Ej.: 60000"
                  />
                  <p class="ayuda">
                    El conductor paga la compra y te la cobra en efectivo al entregar, con la
                    factura.
                  </p>
                </div>
              </ng-template>
              <ng-template #cantidades>
                <div class="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label for="det-bultos" class="etiqueta"
                      >Bultos, cajas u objetos
                      <span class="font-normal text-piedra">(opcional)</span></label
                    >
                    <input
                      id="det-bultos"
                      type="number"
                      min="1"
                      max="200"
                      class="campo"
                      formControlName="bultos"
                      inputmode="numeric"
                    />
                    <p class="ayuda">El conductor los cuenta al recoger.</p>
                  </div>
                  <div>
                    <label for="det-peso" class="etiqueta"
                      >Peso aproximado (kg)
                      @if (servicio() !== 'insumos') {
                        <span class="font-normal text-piedra">(opcional)</span>
                      }
                    </label>
                    <input
                      id="det-peso"
                      type="number"
                      min="1"
                      max="3500"
                      class="campo"
                      formControlName="pesoKg"
                      inputmode="numeric"
                    />
                    <p class="ayuda">Con más de 20 kg ya no va en moto.</p>
                  </div>
                </div>
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    class="size-4 accent-[var(--color-marca)]"
                    formControlName="fragil"
                  />
                  Es frágil: manejar con cuidado
                </label>
              </ng-template>
            </section>

            <section class="tarjeta space-y-5 p-5 sm:p-6" aria-labelledby="titulo-vehiculo">
              <fieldset class="min-w-0">
                <legend id="titulo-vehiculo" class="text-base font-bold">Vehículo</legend>
                <div class="mt-3 grid grid-cols-2 gap-3">
                  @for (op of opcionesVehiculo(); track op.valor) {
                    <label
                      class="relative flex min-h-24 flex-col gap-1 rounded-xl border-2 p-3 text-sm transition-colors"
                      [class]="claseVehiculo(op.valor, op.disponible)"
                    >
                      <input
                        type="radio"
                        class="sr-only"
                        name="vehiculo"
                        [id]="'vehiculo-' + op.id"
                        [value]="op.valor"
                        [checked]="vehiculoElegido() === op.valor"
                        [disabled]="!op.disponible"
                        (change)="elegirVehiculo(op.valor)"
                      />
                      <span class="flex items-center gap-2 font-bold">
                        <ti-icono [nombre]="op.icono" class="size-6" /> {{ op.valor }}
                      </span>
                      <span class="text-xs text-piedra">{{ op.ayuda }}</span>
                      @if (!op.disponible) {
                        <span class="text-xs font-semibold text-alerta">{{ op.motivo }}</span>
                      } @else if (precioDe(op.valor); as p) {
                        <span class="numeros mt-auto text-base font-extrabold text-tinta">{{
                          p | cop
                        }}</span>
                      }
                    </label>
                  }
                </div>
                @if (minimo() === 'Moto Express') {
                  <p class="ayuda">
                    Una furgoneta también puede tomar tu pedido si la moto no está disponible.
                  </p>
                }
              </fieldset>
              <fieldset class="min-w-0">
                <legend class="etiqueta">Opciones</legend>
                <div class="grid gap-2 sm:grid-cols-2">
                  <label
                    class="flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 text-sm"
                    [class]="valores().idaYVuelta ? 'border-marca bg-marca-suave' : 'border-linea'"
                  >
                    <input
                      type="checkbox"
                      class="mt-1 accent-[var(--color-marca)]"
                      formControlName="idaYVuelta"
                    />
                    <span>
                      <span class="flex items-center gap-1.5 font-semibold"
                        ><ti-icono nombre="repeat" class="size-4" /> Ida y vuelta</span
                      >
                      <span class="block text-piedra"
                        >El conductor regresa al origen (con el recibido, un cambio, etc.).</span
                      >
                    </span>
                  </label>
                  <label
                    class="flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 text-sm"
                    [class]="valores().programar ? 'border-marca bg-marca-suave' : 'border-linea'"
                  >
                    <input
                      type="checkbox"
                      class="mt-1 accent-[var(--color-marca)]"
                      formControlName="programar"
                    />
                    <span>
                      <span class="flex items-center gap-1.5 font-semibold"
                        ><ti-icono nombre="calendar-clock" class="size-4" /> Programar</span
                      >
                      <span class="block text-piedra"
                        >Para más tarde o hasta {{ maxDias }} días después.</span
                      >
                    </span>
                  </label>
                </div>
                @if (valores().programar) {
                  <div class="mt-3">
                    <label for="fecha" class="etiqueta">Fecha y hora de recogida</label>
                    <input
                      id="fecha"
                      type="datetime-local"
                      class="campo"
                      formControlName="fecha"
                      [min]="fechaMin()"
                      [max]="fechaMax()"
                      [attr.aria-invalid]="!!errorFecha()"
                      [attr.aria-describedby]="errorFecha() ? 'fecha-error' : 'fecha-ayuda'"
                    />
                    @if (errorFecha()) {
                      <p id="fecha-error" class="error-campo">{{ errorFecha() }}</p>
                    } @else {
                      <p id="fecha-ayuda" class="ayuda">
                        Los conductores lo ven una hora antes. Mínimo {{ minMinutos }} minutos desde
                        ahora.
                      </p>
                    }
                  </div>
                }
              </fieldset>
            </section>

            <section class="tarjeta space-y-5 p-5 sm:p-6" aria-labelledby="titulo-contactos">
              <h2 id="titulo-contactos" class="text-base">Contactos</h2>
              @if (info().pideCodigoRecogida) {
                <fieldset formGroupName="detalle">
                  <legend class="etiqueta">
                    ¿Quién entrega la carga?
                    <span class="font-normal text-piedra">(si no eres tú)</span>
                  </legend>
                  <div class="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label for="origNombre" class="sr-only">Nombre de quien entrega</label>
                      <input
                        id="origNombre"
                        class="campo"
                        formControlName="contactoNombre"
                        maxlength="120"
                        autocomplete="off"
                        placeholder="Nombre"
                      />
                    </div>
                    <div>
                      <label for="origTelefono" class="sr-only">Celular de quien entrega</label>
                      <input
                        id="origTelefono"
                        class="campo"
                        formControlName="contactoTelefono"
                        maxlength="20"
                        inputmode="tel"
                        autocomplete="off"
                        placeholder="Celular"
                      />
                    </div>
                  </div>
                  <p class="ayuda">Compártele el código de recogida: lo verás al confirmar.</p>
                </fieldset>
              }
              <fieldset class="min-w-0">
                <legend class="etiqueta">
                  ¿Quién recibe? <span class="font-normal text-piedra">(opcional)</span>
                </legend>
                <div class="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label for="destNombre" class="sr-only">Nombre de quien recibe</label>
                    <input
                      id="destNombre"
                      class="campo"
                      formControlName="destinatarioNombre"
                      maxlength="120"
                      autocomplete="off"
                      placeholder="Nombre"
                    />
                  </div>
                  <div>
                    <label for="destTelefono" class="sr-only">Celular de quien recibe</label>
                    <input
                      id="destTelefono"
                      class="campo"
                      formControlName="destinatarioTelefono"
                      maxlength="20"
                      inputmode="tel"
                      autocomplete="off"
                      placeholder="Celular"
                      [attr.aria-invalid]="errTelDestino()"
                    />
                  </div>
                </div>
                @if (errTelDestino()) {
                  <p class="error-campo">Escribe un teléfono de 7 a 15 dígitos.</p>
                } @else {
                  <p class="ayuda">
                    El conductor podrá llamarle y tú podrás enviarle el enlace de seguimiento por
                    WhatsApp.
                  </p>
                }
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
                  placeholder="Ej.: casa de rejas verdes, preguntar por Juan, entrar por la portería 2"
                ></textarea>
                <p class="ayuda text-right">{{ valores().notas.length }}/300</p>
              </div>
            </section>

            <section class="tarjeta p-5 sm:p-6" aria-labelledby="titulo-pago">
              <fieldset class="min-w-0">
                <legend id="titulo-pago" class="text-base font-bold">¿Cómo vas a pagar?</legend>
                <div class="mt-3 grid grid-cols-2 gap-2">
                  @for (m of metodos; track m.valor) {
                    <label
                      class="flex cursor-pointer flex-col gap-1 rounded-xl border-2 p-3 text-sm transition-colors"
                      [class]="
                        valores().metodoPago === m.valor
                          ? 'border-marca bg-marca-suave'
                          : 'border-linea hover:border-marca/40'
                      "
                    >
                      <input
                        type="radio"
                        class="sr-only"
                        formControlName="metodoPago"
                        [value]="m.valor"
                      />
                      <span class="flex items-center gap-2 font-semibold"
                        ><ti-icono [nombre]="m.icono" class="size-5 text-marca" />
                        {{ m.texto }}</span
                      >
                      <span class="text-piedra">{{ m.ayuda }}</span>
                    </label>
                  }
                </div>
                @if (valores().metodoPago === 'nequi') {
                  <div class="mt-3">
                    <label for="telNequi" class="etiqueta">Celular registrado en Nequi</label>
                    <input
                      id="telNequi"
                      class="campo"
                      formControlName="telefonoNequi"
                      inputmode="numeric"
                      autocomplete="tel-national"
                      maxlength="13"
                      placeholder="300 123 4567"
                      [attr.aria-invalid]="errNequi()"
                      [attr.aria-describedby]="errNequi() ? 'nequi-error' : 'nequi-ayuda'"
                    />
                    @if (errNequi()) {
                      <p id="nequi-error" class="error-campo">
                        Escribe los 10 dígitos de tu celular (empieza por 3).
                      </p>
                    } @else {
                      <p id="nequi-ayuda" class="ayuda">
                        Al confirmar te llega una notificación de cobro en la app Nequi. Tu pedido
                        se publica cuando la aceptes.
                      </p>
                    }
                  </div>
                }
                @if (info().conCompra) {
                  <p class="mt-3 flex gap-2 rounded-xl bg-aviso-suave px-3 py-2 text-sm">
                    <ti-icono nombre="receipt" class="size-4 shrink-0 text-placa-oscuro" />
                    La compra se paga aparte, en efectivo al recibir, con la factura.
                  </p>
                }
              </fieldset>
            </section>

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
              {{ cotizando() ? 'Calculando…' : vigente() ? 'Volver a cotizar' : 'Calcular precio' }}
            </button>
          </form>

          <aside class="hidden lg:sticky lg:top-24 lg:block">
            <ng-container *ngTemplateOutlet="precio" />
          </aside>
        </div>

        <!-- Celular: el precio y el botón quedan siempre a la vista, sobre la barra de navegación -->
        <div
          class="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 lg:hidden"
        >
          <div class="hoja flex items-center gap-3 px-4 py-3">
            <div class="min-w-0 flex-1">
              @if (cotizacionVigente(); as c) {
                <p class="text-xs text-piedra">{{ vehiculoCotizado() }}</p>
                <p class="numeros text-xl font-extrabold leading-tight" style="font-stretch: 112%">
                  {{ precioEn(c) | cop }}
                </p>
              } @else {
                <p class="text-sm font-semibold">
                  {{ cotizando() ? 'Calculando tu precio…' : 'Ubica A y B para ver el precio' }}
                </p>
              }
            </div>
            <button
              type="button"
              class="btn-acento shrink-0"
              [disabled]="!vigente() || creando() || cotizando()"
              (click)="confirmar()"
            >
              {{ creando() ? 'Enviando…' : textoBoton() }}
            </button>
          </div>
        </div>
      }
    </div>

    <ng-template #precio>
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
              {{ precioEn(c) | cop }}
            </p>
            <p class="mt-1 flex flex-wrap gap-x-4 text-sm text-white/85">
              <span class="inline-flex items-center gap-1"
                ><ti-icono nombre="route" class="size-4" /> {{ c.distanciaKm }} km</span
              >
              @if (c.duracionMin) {
                <span class="inline-flex items-center gap-1"
                  ><ti-icono nombre="timer" class="size-4" /> {{ duracion(c.duracionMin) }}</span
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
              Distancia y tiempo por carretera (OpenStreetMap).
              @if (valores().metodoPago === 'efectivo') {
                Pagas en efectivo al recibir.
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
                <ti-icono nombre="loader" class="animate-spin" /> Enviando pedido…
              } @else {
                <ti-icono [nombre]="valores().metodoPago === 'nequi' ? 'smartphone' : 'check'" />
                {{ textoBoton() }} {{ precioEn(c) | cop }}
              }
            </button>
          </div>
        </section>
      } @else {
        <section class="rounded-2xl border border-dashed border-linea bg-papel/60 p-6 text-center">
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
            Ubica la recogida (A) y la entrega (B) y lo calculamos al instante.
          </p>
        </section>
      }
    </ng-template>
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
  private readonly ruta = inject(ActivatedRoute, { optional: true });

  protected readonly servicios = TIPOS_SERVICIO.map((tipo) => ({ tipo, info: SERVICIOS[tipo] }));
  protected readonly sugerenciasPaquete = SUGERENCIAS_PAQUETE;
  protected readonly sugerenciasInsumos = SUGERENCIAS_INSUMOS;
  protected readonly valorAyudante = VALOR_AYUDANTE;
  protected readonly maxAyudantes = MAX_AYUDANTES;
  protected readonly duracion = formatoDuracion;
  protected readonly maxParadas = MAX_PARADAS;
  protected readonly recargoParada = RECARGO_PARADA;
  protected readonly maxDias = PROGRAMAR_MAXIMO_DIAS;
  protected readonly minMinutos = PROGRAMAR_MINIMO_MIN;
  protected readonly textoSinUbicar = TEXTO_SIN_UBICAR;
  protected readonly metodos: {
    valor: MetodoPago;
    texto: string;
    icono: NombreIcono;
    ayuda: string;
  }[] = [
    {
      valor: 'efectivo',
      texto: 'Efectivo',
      icono: 'banknote',
      ayuda: 'Pagas al conductor al recibir',
    },
    { valor: 'nequi', texto: 'Nequi', icono: 'smartphone', ayuda: 'Pagas ahora desde tu app' },
  ];

  protected readonly servicio = signal<TipoServicio>('paquete');
  protected readonly info = computed(() => SERVICIOS[this.servicio()]);

  protected readonly form = this.fb.group(
    {
      origen: ['', [Validators.required, textoValidator(3, 200)]],
      destino: ['', [Validators.required, textoValidator(3, 200)]],
      detalle: this.fb.group({
        lista: [''],
        presupuesto: [''],
        queEnvias: ['', Validators.maxLength(80)],
        objetos: [''],
        pisosOrigen: ['1'],
        pisosDestino: ['1'],
        ascensorOrigen: [false],
        ascensorDestino: [false],
        ayudantes: [0],
        insumo: [''],
        bultos: [''],
        pesoKg: [''],
        fragil: [false],
        accesoDestapado: [false],
        contactoNombre: ['', Validators.maxLength(120)],
        contactoTelefono: ['', Validators.pattern(/^\+?[\d\s-]{7,20}$/)],
      }),
      idaYVuelta: [false],
      programar: [false],
      fecha: [''],
      destinatarioNombre: ['', Validators.maxLength(120)],
      destinatarioTelefono: ['', Validators.pattern(/^\+?[\d\s-]{7,20}$/)],
      metodoPago: this.fb.control<MetodoPago>('efectivo'),
      telefonoNequi: [''],
      categoria: this.fb.control<CategoriaVehiculo | ''>(''),
      notas: ['', Validators.maxLength(300)],
    },
    { validators: [distintosValidator] },
  );
  /** Valores completos del formulario (getRawValue: ningún campo es opcional). */
  protected readonly valores = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    {
      initialValue: this.form.getRawValue(),
    },
  );
  protected readonly origenCoords = signal<Coordenadas | null>(null);
  protected readonly paradas = signal<ParadaForm[]>([]);
  private claveParada = 0;
  /** Se intentó cotizar o confirmar: se muestran los campos sin ubicar o incompletos. */
  private readonly intento = signal(false);
  private readonly reloj = signal(new Date());
  protected readonly destinoCoords = signal<Coordenadas | null>(null);

  protected readonly zonas = signal<Zona[]>([]);
  protected readonly cotizacion = signal<Cotizacion | null>(null);
  private readonly firmaCotizada = signal('');
  private readonly vencida = signal(false);
  protected readonly cotizando = signal(false);
  protected readonly creando = signal(false);
  protected readonly error = signal('');
  protected readonly creado = signal<Envio | null>(null);
  private temporizadorVigencia: ReturnType<typeof setTimeout> | null = null;
  private temporizadorAuto: ReturnType<typeof setTimeout> | null = null;
  private consulta = 0;

  /** Detalle del servicio elegido, solo con los campos que aplican. */
  protected readonly detalle = computed<DetalleServicio>(() =>
    this.detalleDe(this.servicio(), this.valores().detalle),
  );
  protected readonly ayudantes = computed(() => this.valores().detalle.ayudantes);
  protected readonly textoErrorDetalle = computed(() =>
    errorDetalle(this.servicio(), this.detalle()),
  );
  protected readonly errDetalle = computed(() => this.intento() && !!this.textoErrorDetalle());
  protected readonly minimo = computed(
    () => this.cotizacion()?.vehiculoMinimo ?? vehiculoMinimo(this.servicio(), this.detalle()),
  );
  /** Las dos opciones; la moto se desactiva si el pedido no le cabe (trasteo o mucho peso). */
  protected readonly opcionesVehiculo = computed(() => {
    const min = CATEGORIAS_VEHICULO.indexOf(this.minimo());
    return CATEGORIAS_VEHICULO.map((c, i) => ({
      valor: c,
      id: c === 'Furgoneta' ? 'furgoneta' : 'moto',
      icono: ICONO_VEHICULO[c],
      ayuda: AYUDA_VEHICULO[c],
      disponible: i >= min,
      motivo:
        this.servicio() === 'trasteo'
          ? 'Los trasteos van en furgoneta'
          : `Más de ${CAPACIDAD_KG[c]} kg va en furgoneta`,
    }));
  });
  /** Vehículo marcado: el que eligió el cliente o, si no eligió, el mínimo para el pedido. */
  protected readonly vehiculoElegido = computed<CategoriaVehiculo>(
    () => this.valores().categoria || this.minimo(),
  );
  protected readonly coordsParadas = computed(() =>
    this.paradas()
      .map((p) => p.coords())
      .filter((c): c is Coordenadas => !!c),
  );
  protected readonly etiquetaOrigen = computed(() =>
    this.info().conCompra ? 'Dónde comprar o hacer la vuelta' : 'Recoger en',
  );
  protected readonly placeholderOrigen = computed(() =>
    this.info().conCompra
      ? 'Tienda, plaza, banco o dirección'
      : 'Dirección, barrio, vereda o finca',
  );
  protected readonly tituloDetalle = computed(
    () =>
      ({
        mandado: 'El mandado',
        mercado: 'Tu mercado',
        paquete: 'El paquete',
        trasteo: 'El trasteo',
        insumos: 'La carga',
      })[this.servicio()],
  );

  protected readonly iguales = computed(() => {
    this.valores();
    return (
      !!this.form.errors?.['iguales'] &&
      (this.form.controls.destino.touched || this.form.controls.destino.dirty)
    );
  });
  private readonly firmaActual = computed(() =>
    this.firma(
      this.valores(),
      this.origenCoords(),
      this.destinoCoords(),
      this.paradas().map((p) => p.coords()),
      this.servicio(),
      this.detalle(),
    ),
  );
  protected readonly fechaMin = computed(() =>
    fechaLocalInput(new Date(this.reloj().getTime() + PROGRAMAR_MINIMO_MIN * 60_000)),
  );
  protected readonly fechaMax = computed(() =>
    fechaLocalInput(new Date(this.reloj().getTime() + PROGRAMAR_MAXIMO_DIAS * 86_400_000)),
  );
  protected readonly errorFecha = computed(() => {
    // Solo se lee con "Programar" activo
    const v = this.valores();
    const tocado = this.intento() || this.form.controls.fecha.touched;
    const e = errorFechaProgramada(v.fecha, this.reloj());
    return tocado || v.fecha ? e : '';
  });
  protected readonly errNequi = computed(() => {
    // Solo se lee con Nequi elegido
    const tocado = this.intento() || this.form.controls.telefonoNequi.touched;
    return tocado && !celularValido(this.valores().telefonoNequi);
  });
  protected readonly errTelDestino = computed(() => {
    this.valores();
    return this.form.controls.destinatarioTelefono.invalid;
  });
  protected readonly textoBoton = computed(() =>
    this.valores().metodoPago === 'nequi' ? 'Pagar con Nequi' : 'Confirmar',
  );
  protected textoCreado(e: Envio): string {
    if (e.pago?.metodo === 'nequi' && e.pago.estado !== 'aprobado')
      return 'Acepta el cobro en tu app Nequi y lo publicamos para los conductores.';
    if (e.fechaProgramada)
      return 'Lo publicaremos para los conductores una hora antes de la hora programada.';
    return 'Avisamos a los conductores cercanos. Te notificamos cuando uno lo acepte.';
  }
  protected readonly vigente = computed(
    () =>
      this.cotizacion() !== null && !this.vencida() && this.firmaCotizada() === this.firmaActual(),
  );
  protected readonly cotizacionVigente = computed(() =>
    this.vigente() ? this.cotizacion() : null,
  );
  /** Precio cotizado del vehículo con que se confirmó el pedido. */
  protected readonly precioConfirmado = signal(0);

  /** Precio del vehículo elegido (todas las opciones vienen en la misma cotización). */
  protected precioEn(c: Cotizacion): number {
    const cat = this.valores().categoria || this.minimo();
    return c.opciones?.find((o) => o.categoria === cat)?.tarifaTotal ?? c.tarifaTotal;
  }
  protected readonly vehiculoCotizado = computed(() => this.valores().categoria || this.minimo());
  /** El backend recalcula al crear: si la ruta o la hora cambiaron, el precio puede variar. */
  protected tarifaCambio(e: Envio): boolean {
    return this.precioConfirmado() !== e.tarifa;
  }
  /** Vista previa del trayecto cuando las dos direcciones están en el mapa. */
  protected readonly rutaEnMapa = computed<Seguimiento | null>(() => {
    const o = this.cotizacion()?.origenCoords ?? this.origenCoords();
    const d = this.cotizacion()?.destinoCoords ?? this.destinoCoords();
    if (!o || !d) return null;
    const v = this.valores();
    return {
      idEnvio: 0,
      estado: 'Pendiente',
      origen: { direccion: v.origen, coords: o },
      destino: { direccion: v.destino, coords: d },
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
    const params = this.ruta?.snapshot.queryParamMap;
    const tipo = params?.get('servicio');
    if (esTipoServicio(tipo)) {
      this.servicio.set(tipo);
      // En el celular la fila de servicios se desliza: se deja a la vista el elegido
      setTimeout(() =>
        document
          .querySelector(`#servicio-${tipo}`)
          ?.closest('label')
          ?.scrollIntoView?.({ inline: 'center', block: 'nearest' }),
      );
    }
    const repetir = Number(params?.get('repetir'));
    if (esIdValido(repetir)) void this.repetir(repetir);
  }

  ngOnDestroy(): void {
    if (this.temporizadorVigencia) clearTimeout(this.temporizadorVigencia);
    if (this.temporizadorAuto) clearTimeout(this.temporizadorAuto);
  }

  /** Zonas de cobertura para dibujarlas en el mapa (si fallan, el mapa funciona igual). */
  async cargarZonas(): Promise<void> {
    try {
      this.zonas.set(await this.zonesPort.listar());
    } catch (e) {
      this.log.debug('Zonas', 'No se pudieron cargar las zonas', e);
    }
  }

  /** Copia un pedido anterior: servicio, direcciones, detalle y contactos (el precio se recalcula). */
  async repetir(id: number): Promise<void> {
    try {
      const e = await this.shipments.obtener(id);
      this.servicio.set(e.tipoServicio);
      const d = e.detalle ?? {};
      this.form.patchValue({
        origen: e.origen,
        destino: e.destino,
        destinatarioNombre: e.destinatarioNombre ?? '',
        destinatarioTelefono: e.destinatarioTelefono ?? '',
        notas: e.notas ?? '',
        detalle: {
          lista: d.lista ?? '',
          objetos: d.objetos ?? '',
          insumo: d.insumo ?? '',
          queEnvias: e.tipoServicio === 'paquete' ? e.tipoCarga : '',
          ayudantes: d.ayudantes ?? 0,
          pisosOrigen: String(d.pisosOrigen ?? 1),
          pisosDestino: String(d.pisosDestino ?? 1),
          ascensorOrigen: !!d.ascensorOrigen,
          ascensorDestino: !!d.ascensorDestino,
          bultos: d.bultos ? String(d.bultos) : '',
          pesoKg: d.pesoKg ? String(d.pesoKg) : '',
          fragil: !!d.fragil,
          accesoDestapado: !!d.accesoDestapado,
          contactoNombre: d.contactoOrigenNombre ?? '',
          contactoTelefono: d.contactoOrigenTelefono ?? '',
        },
      });
      this.origenCoords.set(e.origenCoords ?? null);
      this.destinoCoords.set(e.destinoCoords ?? null);
      this.toast.mostrar('Copiamos tu pedido anterior. Revisa y confirma.');
    } catch (e) {
      this.log.debug('Envios', 'No se pudo repetir el pedido', e);
    }
  }

  elegirServicio(tipo: TipoServicio): void {
    this.servicio.set(tipo);
    this.error.set('');
  }

  protected cambiarAyudantes(delta: number): void {
    const ctrl = this.form.controls.detalle.controls.ayudantes;
    ctrl.setValue(Math.min(MAX_AYUDANTES, Math.max(0, ctrl.value + delta)));
  }

  protected ponerTexto(campo: 'queEnvias' | 'insumo', texto: string): void {
    this.form.controls.detalle.controls[campo].setValue(texto);
  }

  agregarParada(): void {
    if (this.paradas().length >= MAX_PARADAS) return;
    const p: ParadaForm = {
      clave: ++this.claveParada,
      control: new FormControl('', { nonNullable: true }),
      coords: signal<Coordenadas | null>(null),
    };
    this.paradas.update((l) => [...l, p]);
  }

  quitarParada(clave: number): void {
    this.paradas.update((l) => l.filter((p) => p.clave !== clave));
  }

  protected nombreServicio(e: Envio): string {
    return SERVICIOS[e.tipoServicio].nombre.toLowerCase();
  }

  protected sinUbicar(c: 'origen' | 'destino'): boolean {
    const coords = c === 'origen' ? this.origenCoords() : this.destinoCoords();
    const ctrl = this.form.controls[c];
    return !coords && (this.intento() || (ctrl.touched && ctrl.value.trim().length >= 3));
  }

  protected paradaSinUbicar(p: ParadaForm): boolean {
    return !p.coords() && (this.intento() || p.control.touched);
  }

  private todoUbicado(): boolean {
    return (
      !!this.origenCoords() && !!this.destinoCoords() && this.paradas().every((p) => !!p.coords())
    );
  }

  protected alCambiarPago(e: Envio, pago: PagoResumen): void {
    this.creado.set({ ...e, pago, metodoPago: pago.metodo });
  }

  protected err(c: 'origen' | 'destino'): boolean {
    return mostrarError(this.form.controls[c]);
  }

  /** Elegir el mínimo es "cualquiera que pueda llevarlo"; elegir uno mayor lo exige. */
  protected elegirVehiculo(c: CategoriaVehiculo): void {
    this.form.controls.categoria.setValue(c === this.minimo() ? '' : c);
  }

  protected claseVehiculo(c: CategoriaVehiculo, disponible: boolean): string {
    if (!disponible) return 'cursor-not-allowed border-linea bg-niebla/60 opacity-70';
    return this.vehiculoElegido() === c
      ? 'cursor-pointer border-marca bg-marca-suave'
      : 'cursor-pointer border-linea hover:border-marca/40';
  }

  protected precioDe(valor: CategoriaVehiculo): number | null {
    const c = this.cotizacion();
    if (!c?.opciones) return null;
    return c.opciones.find((o) => o.categoria === valor)?.tarifaTotal ?? null;
  }

  /** Con las direcciones ubicadas, el detalle completo y la fecha válida (si se programa) se cotiza solo. */
  private listoParaAutocotizar(): boolean {
    const v = this.valores();
    const rutaValida =
      this.form.controls.origen.valid &&
      this.form.controls.destino.valid &&
      !this.form.errors?.['iguales'];
    const fechaOk = !v.programar || errorFechaProgramada(v.fecha) === '';
    return rutaValida && fechaOk && this.todoUbicado() && !this.textoErrorDetalle();
  }

  private programarCotizacion(): void {
    if (this.temporizadorAuto) clearTimeout(this.temporizadorAuto);
    this.temporizadorAuto = setTimeout(() => void this.cotizar(false), ESPERA_AUTOCOTIZAR_MS);
  }

  /**
   * Qué impide cotizar: null si nada; '' si el error ya se ve junto al campo; o el mensaje
   * general (direcciones sin ubicar, detalle incompleto).
   */
  private faltaParaCotizar(): string | null {
    this.form.updateValueAndValidity();
    const { origen, destino } = this.form.controls;
    if (origen.invalid || destino.invalid || this.form.errors?.['iguales']) return '';
    if (!this.todoUbicado())
      return 'Ubica en el mapa todas las direcciones para calcular el precio.';
    if (this.textoErrorDetalle()) return this.textoErrorDetalle();
    const v = this.form.getRawValue();
    if (v.programar && errorFechaProgramada(v.fecha)) return '';
    return null;
  }

  /** Con `marcar` (botón Calcular) se muestran los errores de todos los campos. */
  async cotizar(marcar = true): Promise<void> {
    if (this.temporizadorAuto) clearTimeout(this.temporizadorAuto);
    this.reloj.set(new Date());
    if (marcar) {
      this.intento.set(true);
      this.form.controls.origen.markAsTouched();
      this.form.controls.destino.markAsTouched();
      this.form.controls.fecha.markAsTouched();
    }
    const falta = this.faltaParaCotizar();
    if (falta !== null) {
      if (marcar && falta) this.error.set(falta);
      return;
    }
    const firma = this.firmaActual();
    const n = ++this.consulta;
    this.cotizando.set(true);
    this.error.set('');
    try {
      const c = await this.quotePort.cotizar(this.solicitudRuta());
      if (n !== this.consulta) return;
      this.cotizacion.set(c);
      this.firmaCotizada.set(firma);
      this.vencida.set(false);
      if (this.temporizadorVigencia) clearTimeout(this.temporizadorVigencia);
      this.temporizadorVigencia = setTimeout(() => this.vencida.set(true), VIGENCIA_COTIZACION_MS);
    } catch (e) {
      if (n !== this.consulta) return;
      this.cotizacion.set(null);
      this.firmaCotizada.set(firma);
      this.error.set(this.mapper.traducir(e));
    } finally {
      if (n === this.consulta) this.cotizando.set(false);
    }
  }

  async confirmar(): Promise<void> {
    const c = this.cotizacionVigente();
    if (!c || this.creando()) return;
    this.intento.set(true);
    this.form.markAllAsTouched();
    this.form.updateValueAndValidity();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    if (v.metodoPago === 'nequi' && !celularValido(v.telefonoNequi)) {
      this.error.set('Escribe tu celular de Nequi para pagar.');
      return;
    }
    if (v.programar && errorFechaProgramada(v.fecha)) {
      this.error.set(errorFechaProgramada(v.fecha));
      return;
    }
    this.creando.set(true);
    this.error.set('');
    try {
      const queEnvias = limpiarTexto(v.detalle.queEnvias);
      const envio = await this.shipments.crear({
        ...this.solicitudRuta(),
        tipoCarga: this.servicio() === 'paquete' && queEnvias ? queEnvias : undefined,
        notas: v.notas.trim() || undefined,
        metodoPago: v.metodoPago,
        telefonoNequi:
          v.metodoPago === 'nequi' ? v.telefonoNequi.replaceAll(/[\s-]/g, '') : undefined,
        destinatarioNombre: limpiarTexto(v.destinatarioNombre) || undefined,
        destinatarioTelefono: v.destinatarioTelefono.replaceAll(/[\s-]/g, '') || undefined,
      });
      this.log.info('Envios', `Pedido creado #${envio.id}`, {
        tarifa: envio.tarifa,
        pago: envio.metodoPago,
        servicio: envio.tipoServicio,
      });
      this.precioConfirmado.set(this.precioEn(c));
      this.creado.set(envio);
      this.toast.exito('Pedido enviado');
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
    this.paradas.set([]);
    this.intento.set(false);
    this.form.reset();
  }

  private solicitudRuta() {
    const v = this.form.getRawValue();
    return {
      origen: limpiarTexto(v.origen),
      destino: limpiarTexto(v.destino),
      categoria: v.categoria || undefined,
      origenCoords: this.origenCoords(),
      destinoCoords: this.destinoCoords(),
      paradas: this.paradas().map((p) => ({
        direccion: limpiarTexto(p.control.value) || 'Parada',
        coords: p.coords() as Coordenadas,
      })),
      idaYVuelta: v.idaYVuelta,
      fechaProgramada: v.programar && v.fecha ? new Date(v.fecha) : null,
      tipoServicio: this.servicio(),
      detalle: this.detalle(),
    };
  }

  /** Del formulario al modelo: solo los campos del servicio elegido. */
  private detalleDe(
    tipo: TipoServicio,
    f: ReturnType<typeof this.form.controls.detalle.getRawValue>,
  ): DetalleServicio {
    const d: DetalleServicio = {};
    const texto = (s: string) => limpiarTexto(s) || undefined;
    if (tipo === 'mandado' || tipo === 'mercado') {
      d.lista = texto(f.lista);
      d.presupuesto = entero(f.presupuesto);
      return d;
    }
    d.bultos = entero(f.bultos);
    d.pesoKg = entero(f.pesoKg);
    d.fragil = f.fragil || undefined;
    d.contactoOrigenNombre = texto(f.contactoNombre);
    d.contactoOrigenTelefono = texto(f.contactoTelefono);
    if (tipo === 'trasteo') {
      d.objetos = texto(f.objetos);
      d.pisosOrigen = entero(f.pisosOrigen) ?? 1;
      d.pisosDestino = entero(f.pisosDestino) ?? 1;
      d.ascensorOrigen = !!f.ascensorOrigen;
      d.ascensorDestino = !!f.ascensorDestino;
      d.ayudantes = f.ayudantes;
    }
    if (tipo === 'insumos') {
      d.insumo = texto(f.insumo);
      d.accesoDestapado = !!f.accesoDestapado;
    }
    return Object.fromEntries(Object.entries(d).filter(([, x]) => x !== undefined));
  }

  /** Lo que define el precio: ruta (con paradas), vehículo, servicio y su detalle, ida y vuelta y hora. */
  private firma(
    v: {
      origen: string;
      destino: string;
      categoria: string;
      idaYVuelta: boolean;
      programar: boolean;
      fecha: string;
    },
    o: Coordenadas | null,
    d: Coordenadas | null,
    paradas: (Coordenadas | null)[],
    servicio: TipoServicio,
    detalle: DetalleServicio,
  ): string {
    return JSON.stringify([
      limpiarTexto(v.origen).toLowerCase(),
      limpiarTexto(v.destino).toLowerCase(),
      o,
      d,
      paradas,
      v.categoria,
      v.idaYVuelta,
      v.programar ? v.fecha : '',
      servicio,
      detalle,
    ]);
  }
}
