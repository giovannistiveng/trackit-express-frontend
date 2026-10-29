import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MAX_CORREO, MAX_NOMBRE, nombreCompleto, requisitosContrasena } from '../../core/domain';
import { ApiError } from '../../core/http/api-error';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { AuthPort, LoggerPort } from '../../core/ports';
import { mostrarError } from '../../shared/ui/campo-error';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthLayoutComponent } from './auth-layout.component';
import {
  coincidenValidator,
  contrasenaValidator,
  correoValidator,
  nombreValidator,
} from './validators';

export const MENSAJE_CORREO_DUPLICADO =
  'Este correo ya tiene una cuenta. Inicia sesión o usa otro correo.';

/** CU-001 Registro de usuario (solo Cliente o Conductor). */
@Component({
  selector: 'ti-registro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent],
  template: `
    <ti-auth-layout
      titulo="Crea tu cuenta"
      subtitulo="Para pedir envíos o para trabajar como conductor."
    >
      <form [formGroup]="form" (ngSubmit)="enviar()" novalidate class="space-y-5">
        <fieldset>
          <legend class="etiqueta">¿Cómo vas a usar TrackIt?</legend>
          <div class="grid grid-cols-2 gap-2">
            @for (op of perfiles; track op.valor) {
              <label
                class="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 has-[:checked]:border-marca has-[:checked]:bg-marca-suave"
              >
                <input
                  type="radio"
                  formControlName="rol"
                  [value]="op.valor"
                  class="size-4 accent-marca"
                />
                <span
                  ><span class="block font-semibold">{{ op.titulo }}</span
                  ><span class="text-sm text-piedra">{{ op.detalle }}</span></span
                >
              </label>
            }
          </div>
        </fieldset>

        <div class="grid gap-5 sm:grid-cols-2">
          <div>
            <label for="nombres" class="etiqueta">Nombres</label>
            <input
              id="nombres"
              class="campo"
              formControlName="nombres"
              autocomplete="given-name"
              [attr.aria-invalid]="err('nombres')"
              [attr.aria-describedby]="err('nombres') ? 'nombres-error' : null"
            />
            @if (err('nombres')) {
              <p id="nombres-error" class="error-campo">Solo letras y espacios.</p>
            }
          </div>
          <div>
            <label for="apellidos" class="etiqueta">Apellidos</label>
            <input
              id="apellidos"
              class="campo"
              formControlName="apellidos"
              autocomplete="family-name"
              [attr.aria-invalid]="err('apellidos')"
              [attr.aria-describedby]="err('apellidos') ? 'apellidos-error' : null"
            />
            @if (err('apellidos')) {
              <p id="apellidos-error" class="error-campo">Solo letras y espacios.</p>
            }
          </div>
        </div>
        @if (nombreLargo()) {
          <p class="error-campo" role="alert">
            Nombre y apellidos juntos no pueden pasar de {{ maxNombre }} caracteres.
          </p>
        }

        <div>
          <label for="correo" class="etiqueta">Correo</label>
          <input
            id="correo"
            type="email"
            class="campo"
            formControlName="correo"
            autocomplete="email"
            inputmode="email"
            [maxlength]="maxCorreo"
            [attr.aria-invalid]="err('correo') || !!errorCorreo()"
            [attr.aria-describedby]="err('correo') || errorCorreo() ? 'correo-error' : null"
          />
          @if (errorCorreo()) {
            <p id="correo-error" class="error-campo" role="alert">{{ errorCorreo() }}</p>
          } @else if (err('correo')) {
            <p id="correo-error" class="error-campo">
              Escribe un correo válido, por ejemplo nombre&#64;correo.co
            </p>
          }
        </div>

        <div>
          <label for="password" class="etiqueta">Contraseña</label>
          <div class="relative">
            <input
              id="password"
              class="campo pr-24"
              formControlName="password"
              autocomplete="new-password"
              [type]="verClave() ? 'text' : 'password'"
              aria-describedby="requisitos"
              [attr.aria-invalid]="err('password')"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-1 my-auto h-9 rounded-md px-3 text-sm font-semibold text-marca"
              [attr.aria-pressed]="verClave()"
              (click)="verClave.set(!verClave())"
            >
              {{ verClave() ? 'Ocultar' : 'Mostrar' }}
            </button>
          </div>
          <ul id="requisitos" class="mt-2 space-y-1 text-sm" aria-live="polite">
            @for (r of listaRequisitos(); track r.texto) {
              <li
                class="flex items-center gap-2"
                [class.text-exito]="r.ok"
                [class.text-piedra]="!r.ok"
              >
                <span aria-hidden="true">{{ r.ok ? '✓' : '○' }}</span
                >{{ r.texto }}<span class="sr-only">{{ r.ok ? ': cumplido' : ': pendiente' }}</span>
              </li>
            }
          </ul>
        </div>

        <div>
          <label for="confirmar" class="etiqueta">Confirma la contraseña</label>
          <input
            id="confirmar"
            class="campo"
            formControlName="confirmar"
            autocomplete="new-password"
            [type]="verClave() ? 'text' : 'password'"
            [attr.aria-invalid]="noCoinciden()"
            [attr.aria-describedby]="noCoinciden() ? 'confirmar-error' : null"
          />
          @if (noCoinciden()) {
            <p id="confirmar-error" class="error-campo">Las contraseñas no coinciden.</p>
          }
        </div>

        @if (error()) {
          <p
            class="rounded-lg bg-alerta-suave px-4 py-3 text-sm font-semibold text-alerta"
            role="alert"
          >
            {{ error() }}
          </p>
        }
        <button type="submit" class="btn-primario w-full" [disabled]="enviando()">
          {{ enviando() ? 'Creando cuenta…' : 'Crear cuenta' }}
        </button>
      </form>
      <p class="mt-8 text-sm text-piedra">
        ¿Ya tienes cuenta? <a routerLink="/login" class="btn-texto">Inicia sesión</a>
      </p>
    </ti-auth-layout>
  `,
})
export class RegistroPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthPort);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly log = inject(LoggerPort);

  protected readonly maxNombre = MAX_NOMBRE;
  protected readonly maxCorreo = MAX_CORREO;
  protected readonly perfiles = [
    { valor: '2' as const, titulo: 'Cliente', detalle: 'Pido envíos' },
    { valor: '3' as const, titulo: 'Conductor', detalle: 'Hago entregas' },
  ];

  protected readonly form = this.fb.group(
    {
      rol: this.fb.control<'2' | '3'>('2'),
      nombres: ['', [Validators.required, nombreValidator]],
      apellidos: ['', [Validators.required, nombreValidator]],
      correo: ['', [Validators.required, correoValidator]],
      password: ['', [Validators.required, contrasenaValidator]],
      confirmar: ['', Validators.required],
    },
    { validators: coincidenValidator },
  );

  private readonly valores = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  protected readonly errorCorreo = signal('');
  protected readonly verClave = signal(false);

  protected readonly listaRequisitos = computed(() => {
    const r = requisitosContrasena(this.valores().password ?? '');
    return [
      { texto: 'Al menos 8 caracteres', ok: r.longitud },
      { texto: 'Una letra mayúscula', ok: r.mayuscula },
      { texto: 'Un número', ok: r.numero },
    ];
  });
  protected readonly nombreLargo = computed(() => {
    const v = this.valores();
    return nombreCompleto(v.nombres ?? '', v.apellidos ?? '').length > MAX_NOMBRE;
  });
  protected readonly noCoinciden = computed(() => {
    const v = this.valores();
    return !!v.confirmar && !!v.password && v.confirmar !== v.password;
  });

  constructor() {
    this.form.controls.correo.valueChanges.subscribe(() => this.errorCorreo.set(''));
  }

  protected err(campo: 'nombres' | 'apellidos' | 'correo' | 'password'): boolean {
    return mostrarError(this.form.controls[campo]);
  }

  async enviar(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.nombreLargo() || this.enviando()) return;
    const v = this.form.getRawValue();
    this.enviando.set(true);
    this.error.set('');
    try {
      await this.auth.registrar({
        nombre: nombreCompleto(v.nombres, v.apellidos),
        correo: v.correo.trim(),
        password: v.password,
        rol: v.rol,
      });
      this.log.info('Registro', `Cuenta creada (rol ${v.rol})`);
      this.toast.exito('Cuenta creada. Ya puedes iniciar sesión.');
      await this.router.navigate(['/login'], { queryParams: { correo: v.correo.trim() } });
    } catch (e) {
      if (e instanceof ApiError && /correo ya está registrado/i.test(e.message))
        this.errorCorreo.set(MENSAJE_CORREO_DUPLICADO);
      else this.error.set(this.mapper.traducir(e));
    } finally {
      this.enviando.set(false);
    }
  }
}
