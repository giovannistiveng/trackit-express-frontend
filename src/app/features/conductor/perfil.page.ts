import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  CATEGORIAS_VEHICULO,
  CategoriaVehiculo,
  TIPOS_DOCUMENTO,
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
export const MENSAJE_SIN_PERFIL = 'Tu perfil de conductor aún no está creado. Contacta a soporte.';

/** CU-003 Registro de vehículo y CU-004 Carga de documentos. */
@Component({
  selector: 'ti-perfil-conductor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, PlacaComponent, DocumentoCardComponent, AvisoPerfilComponent],
  template: `
    <div class="contenedor">
      <h1>Mi perfil</h1>
      <p class="mt-2 text-piedra">
        Registra tu vehículo y sube tus documentos para que te aprueben.
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
        <h2 id="titulo-documentos">Documentos</h2>
        <p class="mt-1 text-sm text-piedra">Imagen JPG o PNG, o PDF, de hasta 5 MB cada uno.</p>
        @if (perfil.idConductor(); as id) {
          <div class="mt-4 grid gap-4 md:grid-cols-3">
            @for (t of tipos; track t) {
              <ti-documento-card [tipo]="t" [idConductor]="id" />
            }
          </div>
        } @else {
          <p class="mt-4 text-sm text-piedra">
            Disponible cuando tu perfil de conductor esté creado.
          </p>
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
  protected readonly tipos = TIPOS_DOCUMENTO;
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
  protected readonly sinPerfil = computed(() => this.perfil.idConductor() === null);

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
    const idConductor = this.perfil.idConductor();
    if (idConductor === null) {
      this.errorPlaca.set(MENSAJE_SIN_PERFIL);
      return;
    }
    const { placa, categoria } = this.form.getRawValue();
    this.guardando.set(true);
    try {
      const v = await this.vehicles.registrar({
        placa: normalizarPlaca(placa),
        categoria,
        idConductor,
      });
      this.perfil.registrarVehiculo(v);
      this.log.info('Vehiculos', `Vehículo registrado (${v.categoria})`);
      this.toast.exito('Vehículo registrado');
    } catch (e) {
      if (e instanceof ApiError && /placa ya está registrada/i.test(e.message))
        this.errorPlaca.set(MENSAJE_PLACA_DUPLICADA);
      else if (e instanceof ApiError && e.status === 404) this.errorPlaca.set(MENSAJE_SIN_PERFIL);
      else this.errorPlaca.set(this.mapper.traducir(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
