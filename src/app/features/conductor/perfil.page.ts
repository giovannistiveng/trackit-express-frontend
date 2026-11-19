import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  CATEGORIAS_VEHICULO,
  CategoriaVehiculo,
  Requisito,
  TIPOS_DOCUMENTO,
  TipoDocumento,
  esPlacaValida,
  normalizarPlaca,
} from '../../core/domain';
import { ApiError } from '../../core/http/api-error';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { LoggerPort, VehiclesPort } from '../../core/ports';
import { mostrarError } from '../../shared/ui/campo-error';
import { PlacaComponent } from '../../shared/ui/placa.component';
import { ToastService } from '../../shared/ui/toast.service';
import { AvisoPerfilComponent } from './components/aviso-perfil.component';
import { DocumentoCardComponent } from './components/documento-card.component';
import { DriverProfileStore } from './state/driver-profile.store';

export const MENSAJE_PLACA_DUPLICADA = 'Esa placa ya está registrada en el sistema.';

/** Requisito sin información del servidor (todavía sin cargar). */
export function requisitoBasico(tipo: TipoDocumento): Requisito {
  return {
    tipo,
    nombre: tipo,
    ayuda: 'Foto legible del documento.',
    obligatorio: true,
    vence: tipo === 'SOAT' || tipo === 'Licencia',
    estado: 'falta',
    verificar: null,
    documento: null,
  };
}

/** CU-003 Registro de vehículo y CU-004 Carga de documentos. */
@Component({
  selector: 'ti-perfil-conductor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, PlacaComponent, DocumentoCardComponent, AvisoPerfilComponent],
  template: `
    <div class="contenedor">
      <h1>Mi perfil</h1>
      <p class="mt-2 text-piedra">
        Registra tu vehículo y sube tus documentos. Revisamos cada uno contra las fuentes oficiales
        (RUNT, Policía y Registraduría) antes de aprobarte.
      </p>

      @if (!perfil.aprobado()) {
        <div class="mt-6"><ti-aviso-perfil [perfil]="perfil.perfil()" [conEnlace]="false" /></div>
      } @else {
        <p class="mt-6 rounded-lg bg-exito-suave px-4 py-3 text-sm font-semibold text-exito">
          Cuenta aprobada: ya puedes tomar servicios.
        </p>
      }

      <section class="mt-10" aria-labelledby="titulo-vehiculo">
        <h2 id="titulo-vehiculo">Vehículo</h2>
        @if (vehiculo(); as v) {
          <div class="mt-4 flex items-center gap-4 rounded-xl border border-linea bg-papel p-4">
            <ti-placa [valor]="v.placa" etiqueta="Placa del vehículo" pie="COLOMBIA" />
            <div>
              <p class="font-semibold">{{ v.categoria }}</p>
              <p class="text-sm text-exito">Vehículo registrado</p>
            </div>
          </div>
        } @else {
          <form
            [formGroup]="form"
            (ngSubmit)="registrar()"
            novalidate
            class="mt-4 grid gap-5 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
          >
            <div>
              <label for="placa" class="etiqueta">Placa</label>
              <input
                id="placa"
                class="campo numeros uppercase tracking-widest"
                formControlName="placa"
                maxlength="8"
                autocomplete="off"
                placeholder="ABC123"
                (blur)="normalizar()"
                [attr.aria-invalid]="err('placa') || !!errorPlaca()"
                [attr.aria-describedby]="'placa-ayuda'"
              />
              @if (errorPlaca()) {
                <p id="placa-ayuda" class="error-campo" role="alert">{{ errorPlaca() }}</p>
              } @else if (err('placa')) {
                <p id="placa-ayuda" class="error-campo">
                  Usa el formato ABC123 (carro) o ABC12D (moto).
                </p>
              } @else {
                <p id="placa-ayuda" class="ayuda">Tres letras y tres caracteres, sin espacios.</p>
              }
            </div>
            <div>
              <label for="categoria" class="etiqueta">Categoría</label>
              <select id="categoria" class="campo" formControlName="categoria">
                @for (c of categorias; track c) {
                  <option [value]="c">{{ c }}</option>
                }
              </select>
            </div>
            <button
              type="submit"
              class="btn-primario sm:mt-6"
              [disabled]="guardando() || sinPerfil()"
            >
              {{ guardando() ? 'Guardando…' : 'Registrar vehículo' }}
            </button>
          </form>
        }
      </section>

      <section class="mt-10" aria-labelledby="titulo-documentos">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="titulo-documentos">Documentos</h2>
            <p class="mt-1 text-sm text-piedra">Foto o PDF de hasta 5 MB cada uno.</p>
          </div>
          @if (avance(); as a) {
            <p class="numeros text-sm font-semibold">{{ a.listos }} de {{ a.total }} aprobados</p>
          }
        </div>
        @if (avance(); as a) {
          <div
            class="mt-3 h-2 overflow-hidden rounded-full bg-linea"
            role="progressbar"
            [attr.aria-valuenow]="a.listos"
            aria-valuemin="0"
            [attr.aria-valuemax]="a.total"
            aria-label="Documentos aprobados"
          >
            <div
              class="h-full rounded-full bg-marca transition-[width]"
              [style.width.%]="(a.listos / a.total) * 100"
            ></div>
          </div>
        }
        @if (requisitos().length) {
          <div class="mt-4 grid gap-4 md:grid-cols-2">
            @for (r of requisitos(); track r.tipo) {
              <ti-documento-card [requisito]="r" (subido)="alSubirDocumento()" />
            }
          </div>
        } @else {
          <p class="mt-4 text-sm text-piedra">Disponible cuando se cargue tu perfil.</p>
        }
      </section>
    </div>
  `,
})
export class PerfilPage {
  protected readonly perfil = inject(DriverProfileStore);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly vehicles = inject(VehiclesPort);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerPort);

  protected readonly categorias = CATEGORIAS_VEHICULO;
  /** Requisitos que envía el backend; si es una versión anterior, los tres documentos básicos. */
  protected readonly requisitos = computed<Requisito[]>(() => {
    const p = this.perfil.perfil();
    if (!p) return [];
    return p.requisitos?.items ?? TIPOS_DOCUMENTO.slice(0, 4).map((tipo) => requisitoBasico(tipo));
  });
  protected readonly avance = computed(() => {
    const obligatorios = this.requisitos().filter((r) => r.obligatorio);
    if (!obligatorios.length) return null;
    return {
      listos: obligatorios.filter((r) => r.estado === 'aprobado').length,
      total: obligatorios.length,
    };
  });
  protected readonly form = this.fb.group({
    placa: [
      '',
      [
        Validators.required,
        (c: { value: string }) => (!c.value || esPlacaValida(c.value) ? null : { placa: true }),
      ],
    ],
    categoria: this.fb.control<CategoriaVehiculo>('Moto Express'),
  });
  protected readonly guardando = signal(false);
  protected readonly errorPlaca = signal('');
  protected readonly vehiculo = computed(() => this.perfil.perfil()?.vehiculo ?? null);
  protected readonly sinPerfil = computed(() => this.perfil.perfil() === null);

  constructor() {
    this.form.controls.placa.valueChanges.subscribe(() => this.errorPlaca.set(''));
  }

  protected err(c: 'placa'): boolean {
    return mostrarError(this.form.controls[c]);
  }

  protected normalizar(): void {
    const c = this.form.controls.placa;
    if (c.value) c.setValue(normalizarPlaca(c.value), { emitEvent: false });
  }

  async registrar(): Promise<void> {
    this.normalizar();
    this.form.markAllAsTouched();
    if (this.form.invalid || this.guardando()) return;
    const { placa, categoria } = this.form.getRawValue();
    this.guardando.set(true);
    try {
      const v = await this.vehicles.registrar({
        placa: normalizarPlaca(placa),
        categoria,
      });
      this.perfil.registrarVehiculo(v);
      this.log.info('Vehiculos', `Vehículo registrado (${v.categoria})`);
      this.toast.exito('Vehículo registrado');
    } catch (e) {
      if (e instanceof ApiError && /placa ya está registrada/i.test(e.message))
        this.errorPlaca.set(MENSAJE_PLACA_DUPLICADA);
      else this.errorPlaca.set(this.mapper.traducir(e));
    } finally {
      this.guardando.set(false);
    }
  }

  /** Al subir un documento cambia su estado (y un rechazado o suspendido vuelve a revisión). */
  protected alSubirDocumento(): void {
    this.toast.exito('Documento recibido: queda en revisión');
    void this.perfil.cargar(true);
  }
}
