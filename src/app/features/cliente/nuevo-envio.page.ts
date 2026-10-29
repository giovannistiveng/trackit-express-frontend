import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
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
import { SessionService } from '../../core/auth/session.service';
import { DemoModeService } from '../../core/config/demo-mode.service';
import {
  CATEGORIAS_VEHICULO,
  CategoriaVehiculo,
  Cotizacion,
  Envio,
  TIPOS_CARGA,
  Zona,
  limpiarTexto,
} from '../../core/domain';
import { ApiError } from '../../core/http/api-error';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import {
  ClientShipmentsPort,
  LoggerPort,
  QuotePort,
  ShipmentsPort,
  ZonesPort,
} from '../../core/ports';
import { LUGARES_FRECUENTES } from '../../core/adapters/mock/seed-data';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { mostrarError } from '../../shared/ui/campo-error';
import { ToastService } from '../../shared/ui/toast.service';
import { PinEnvioComponent } from './components/pin-envio.component';

export const VIGENCIA_COTIZACION_MS = 15 * 60_000;
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

/** CU-005 Cotización (paso 1) y CU-006 Solicitud de envío (paso 2). */
@Component({
  selector: 'ti-nuevo-envio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, CopPipe, PinEnvioComponent],
  template: `
    <div class="contenedor">
      @if (creado(); as envio) {
        <section aria-labelledby="titulo-creado">
          <p class="font-semibold text-exito">Solicitud enviada</p>
          <h1 id="titulo-creado" class="mt-1">Tu envío #{{ envio.id }} está esperando conductor</h1>
          <div class="mt-8 rounded-2xl border-2 border-tinta bg-papel p-5 sm:p-6">
            <p class="font-semibold">PIN de entrega</p>
            <p class="mt-1 text-sm text-piedra">
              Entrega este PIN al conductor solo al recibir tu paquete.
            </p>
            <div class="mt-4"><ti-pin-envio [pin]="envio.pin ?? ''" tamano="grande" /></div>
          </div>
          @if (tarifaCambio()) {
            <p class="mt-4 rounded-lg bg-aviso-suave px-4 py-3 text-sm" role="status">
              La tarifa final es {{ envio.tarifa | cop }}, distinta de la cotizada ({{
                cotizacion()?.tarifaTotal | cop
              }}), porque la distancia se recalculó al crear el envío.
            </p>
          }
          <dl class="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt class="text-piedra">Recoger en</dt>
            <dd class="font-medium">{{ envio.origen }}</dd>
            <dt class="text-piedra">Entregar en</dt>
            <dd class="font-medium">{{ envio.destino }}</dd>
            <dt class="text-piedra">Carga</dt>
            <dd class="font-medium">{{ envio.tipoCarga }}</dd>
            <dt class="text-piedra">Tarifa</dt>
            <dd class="numeros font-bold">{{ envio.tarifa | cop }}</dd>
          </dl>
          <div class="mt-8 flex flex-wrap gap-3">
            <a class="btn-primario" [routerLink]="['/cliente/envios', envio.id]"
              >Seguir este envío</a
            >
            <button type="button" class="btn-secundario" (click)="nuevo()">Pedir otro envío</button>
          </div>
        </section>
      } @else {
        <h1>Nuevo envío</h1>
        <p class="mt-2 text-piedra">
          Cotiza primero; la solicitud solo se confirma con una cotización vigente.
        </p>

        <form [formGroup]="form" (ngSubmit)="cotizar()" novalidate class="mt-8 space-y-5">
          <datalist id="lugares">
            @for (l of lugares; track l) {
              <option [value]="l"></option>
            }
          </datalist>
          <div>
            <label for="origen" class="etiqueta">Recoger en</label>
            <input
              id="origen"
              class="campo"
              formControlName="origen"
              list="lugares"
              autocomplete="off"
              maxlength="200"
              placeholder="Dirección o lugar de recogida"
              [attr.aria-invalid]="err('origen')"
              [attr.aria-describedby]="err('origen') ? 'origen-error' : null"
            />
            @if (err('origen')) {
              <p id="origen-error" class="error-campo">Escribe entre 3 y 200 caracteres.</p>
            }
          </div>
          <div>
            <label for="destino" class="etiqueta">Entregar en</label>
            <input
              id="destino"
              class="campo"
              formControlName="destino"
              list="lugares"
              autocomplete="off"
              maxlength="200"
              placeholder="Dirección o lugar de entrega"
              [attr.aria-invalid]="err('destino') || iguales()"
              [attr.aria-describedby]="err('destino') || iguales() ? 'destino-error' : null"
            />
            @if (iguales()) {
              <p id="destino-error" class="error-campo">El destino debe ser distinto del origen.</p>
            } @else if (err('destino')) {
              <p id="destino-error" class="error-campo">Escribe entre 3 y 200 caracteres.</p>
            }
          </div>
          <div class="grid gap-5 sm:grid-cols-2">
            <div>
              <label for="zona" class="etiqueta">Zona de tarifa</label>
              <select
                id="zona"
                class="campo"
                formControlName="idZona"
                [attr.aria-invalid]="err('idZona')"
                [attr.aria-describedby]="err('idZona') ? 'zona-error' : 'zona-ayuda'"
              >
                <option [ngValue]="null" disabled>
                  {{ zonasCargando() ? 'Cargando zonas…' : 'Elige una zona' }}
                </option>
                @for (z of zonas(); track z.id) {
                  <option [ngValue]="z.id">{{ z.nombre }} · base {{ z.tarifaBase | cop }}</option>
                }
              </select>
              @if (err('idZona')) {
                <p id="zona-error" class="error-campo">Elige la zona del envío.</p>
              } @else {
                <p id="zona-ayuda" class="ayuda">Define la tarifa base.</p>
              }
              @if (errorZonas()) {
                <p class="error-campo">
                  No se pudieron cargar las zonas.
                  <button type="button" class="btn-texto" (click)="cargarZonas()">
                    Reintentar
                  </button>
                </p>
              }
            </div>
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
          @if (flags.categoriaEnvio) {
            <div>
              <label for="categoria" class="etiqueta">Vehículo</label>
              <select id="categoria" class="campo" formControlName="categoria">
                @for (c of categorias; track c) {
                  <option [value]="c">{{ c }}</option>
                }
              </select>
            </div>
          }

          @if (error()) {
            <p
              class="rounded-lg bg-alerta-suave px-4 py-3 text-sm font-semibold text-alerta"
              role="alert"
            >
              {{ error() }}
            </p>
          }

          <button type="submit" class="btn-secundario w-full sm:w-auto" [disabled]="cotizando()">
            {{ cotizando() ? 'Calculando…' : vigente() ? 'Volver a cotizar' : 'Cotizar' }}
          </button>
        </form>

        @if (cotizacion(); as c) {
          <section
            class="mt-8 rounded-2xl bg-monte p-5 text-white sm:p-6"
            aria-labelledby="titulo-cotizacion"
            aria-live="polite"
          >
            <h2 id="titulo-cotizacion" class="text-white">
              {{ vigente() ? 'Cotización' : 'Cotización vencida' }}
            </h2>
            @if (!vigente()) {
              <p class="mt-1 text-sm text-white/80">
                Cambiaste los datos o pasaron 15 minutos. Vuelve a cotizar para confirmar.
              </p>
            }
            <dl
              class="numeros mt-4 grid grid-cols-[1fr_auto] gap-y-2"
              [class.opacity-60]="!vigente()"
            >
              <dt class="text-white/80">Distancia estimada</dt>
              <dd class="text-right">{{ c.distanciaKm }} km</dd>
              <dt class="text-white/80">Tarifa base de la zona</dt>
              <dd class="text-right">{{ c.tarifaBase | cop }}</dd>
              <dt class="border-t border-white/20 pt-2 font-bold">Total</dt>
              <dd
                class="border-t border-white/20 pt-2 text-right text-3xl font-extrabold"
                style="font-stretch: 112%"
              >
                {{ c.tarifaTotal | cop }}
              </dd>
            </dl>
            <p class="mt-3 text-sm text-white/70">La distancia es una estimación.</p>
            <button
              type="button"
              class="btn-acento mt-5 w-full"
              [disabled]="!vigente() || creando()"
              (click)="confirmar()"
            >
              {{ creando() ? 'Enviando solicitud…' : 'Confirmar solicitud' }}
            </button>
          </section>
        }
      }
    </div>
  `,
})
export class NuevoEnvioPage implements OnInit, OnDestroy {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly zonesPort = inject(ZonesPort);
  private readonly quotePort = inject(QuotePort);
  private readonly shipments = inject(ShipmentsPort);
  private readonly historial = inject(ClientShipmentsPort);
  private readonly session = inject(SessionService);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerPort);
  protected readonly flags = inject(DemoModeService).flags;

  protected readonly lugares = LUGARES_FRECUENTES;
  protected readonly tiposCarga = TIPOS_CARGA;
  protected readonly categorias = CATEGORIAS_VEHICULO;

  protected readonly form = this.fb.group(
    {
      origen: ['', [Validators.required, textoValidator(3, 200)]],
      destino: ['', [Validators.required, textoValidator(3, 200)]],
      idZona: this.fb.control<number | null>(null, Validators.required),
      tipoCarga: [''],
      otroTipo: [''],
      categoria: this.fb.control<CategoriaVehiculo>('Moto Express'),
    },
    { validators: [distintosValidator, tipoCargaValidator] },
  );
  private readonly valores = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  protected readonly zonas = signal<Zona[]>([]);
  protected readonly zonasCargando = signal(false);
  protected readonly errorZonas = signal(false);
  protected readonly cotizacion = signal<Cotizacion | null>(null);
  private readonly firmaCotizada = signal('');
  private readonly vencida = signal(false);
  protected readonly cotizando = signal(false);
  protected readonly creando = signal(false);
  protected readonly error = signal('');
  protected readonly creado = signal<Envio | null>(null);
  private temporizadorVigencia: ReturnType<typeof setTimeout> | null = null;

  protected readonly esOtro = computed(() => this.valores().tipoCarga === OTRO);
  protected readonly iguales = computed(() => {
    this.valores();
    return (
      !!this.form.errors?.['iguales'] &&
      (this.form.controls.destino.touched || this.form.controls.destino.dirty)
    );
  });
  protected readonly vigente = computed(
    () =>
      this.cotizacion() !== null &&
      !this.vencida() &&
      this.firmaCotizada() === this.firma(this.valores()),
  );
  protected readonly tarifaCambio = computed(() => {
    const c = this.cotizacion();
    const e = this.creado();
    return !!c && !!e && c.tarifaTotal !== e.tarifa;
  });

  ngOnInit(): void {
    void this.cargarZonas();
  }

  ngOnDestroy(): void {
    if (this.temporizadorVigencia) clearTimeout(this.temporizadorVigencia);
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

  protected err(c: 'origen' | 'destino' | 'idZona'): boolean {
    return mostrarError(this.form.controls[c]);
  }

  protected errTipo(): boolean {
    this.valores();
    const tocado = this.form.controls.tipoCarga.touched || this.form.controls.otroTipo.touched;
    return tocado && !!this.form.errors?.['tipoCarga'];
  }

  async cotizar(): Promise<void> {
    this.form.markAllAsTouched();
    this.valores(); // fuerza recálculo de errores
    this.form.updateValueAndValidity();
    if (this.form.invalid || this.cotizando()) return;
    const v = this.form.getRawValue();
    this.cotizando.set(true);
    this.error.set('');
    try {
      const c = await this.quotePort.cotizar({
        origen: limpiarTexto(v.origen),
        destino: limpiarTexto(v.destino),
        idZona: v.idZona as number,
        tipoCarga: this.tipoCargaFinal(),
        categoria: this.flags.categoriaEnvio ? v.categoria : undefined,
      });
      this.cotizacion.set(c);
      this.firmaCotizada.set(this.firma(v));
      this.vencida.set(false);
      if (this.temporizadorVigencia) clearTimeout(this.temporizadorVigencia);
      this.temporizadorVigencia = setTimeout(() => this.vencida.set(true), VIGENCIA_COTIZACION_MS);
    } catch (e) {
      this.cotizacion.set(null);
      this.error.set(
        e instanceof ApiError && e.status === 404
          ? 'La zona elegida no existe. Elige otra zona.'
          : this.mapper.traducir(e),
      );
    } finally {
      this.cotizando.set(false);
    }
  }

  async confirmar(): Promise<void> {
    if (!this.vigente() || this.creando()) return;
    this.form.markAllAsTouched();
    this.form.updateValueAndValidity();
    if (this.form.invalid) return;
    const usuario = this.session.usuario();
    if (!usuario) return;
    const v = this.form.getRawValue();
    this.creando.set(true);
    this.error.set('');
    try {
      const envio = await this.shipments.crear({
        origen: limpiarTexto(v.origen),
        destino: limpiarTexto(v.destino),
        idZona: v.idZona as number,
        tipoCarga: this.tipoCargaFinal(),
        categoria: this.flags.categoriaEnvio ? v.categoria : undefined,
        idCliente: usuario.id,
      });
      await this.historial.recordar(usuario.id, envio.id).catch(() => undefined);
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
    this.form.reset();
  }

  private tipoCargaFinal(): string {
    const v = this.form.getRawValue();
    return v.tipoCarga === OTRO ? limpiarTexto(v.otroTipo) : v.tipoCarga;
  }

  private firma(
    v: Partial<{
      origen: string;
      destino: string;
      idZona: number | null;
      tipoCarga: string;
      otroTipo: string;
      categoria: string;
    }>,
  ): string {
    return JSON.stringify([
      limpiarTexto(v.origen ?? '').toLowerCase(),
      limpiarTexto(v.destino ?? '').toLowerCase(),
      v.idZona ?? null,
      v.tipoCarga ?? '',
      v.tipoCarga === OTRO ? limpiarTexto(v.otroTipo ?? '') : '',
      this.flags.categoriaEnvio ? (v.categoria ?? '') : '',
    ]);
  }
}
