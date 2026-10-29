import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { esCorreoValido } from '../../core/domain';
import { ApiError } from '../../core/http/api-error';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { AuthPort, LoggerPort } from '../../core/ports';
import { DriverProfileStore } from '../conductor/state/driver-profile.store';
import { AuthLayoutComponent } from './auth-layout.component';
import { mostrarError } from '../../shared/ui/campo-error';
import { correoValidator } from './validators';

export const MENSAJE_CREDENCIALES = 'Correo o contraseña incorrectos';

/** CU-002 Inicio de sesión. */
@Component({
  selector: 'ti-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent],
  template: `
    <ti-auth-layout
      titulo="Inicia sesión"
      subtitulo="Entra con el correo con el que te registraste."
    >
      @if (aviso()) {
        <p class="mb-6 rounded-lg bg-aviso-suave px-4 py-3 text-sm font-medium" role="status">
          {{ aviso() }}
        </p>
      }
      <form [formGroup]="form" (ngSubmit)="enviar()" novalidate class="space-y-5">
        <div>
          <label for="correo" class="etiqueta">Correo</label>
          <input
            id="correo"
            type="email"
            class="campo"
            formControlName="correo"
            autocomplete="email"
            inputmode="email"
            [attr.aria-invalid]="err('correo')"
            [attr.aria-describedby]="err('correo') ? 'correo-error' : null"
          />
          @if (err('correo')) {
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
              autocomplete="current-password"
              [type]="verClave() ? 'text' : 'password'"
              [attr.aria-invalid]="err('password')"
              [attr.aria-describedby]="err('password') ? 'password-error' : null"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-1 my-auto h-9 rounded-md px-3 text-sm font-semibold text-monte"
              [attr.aria-pressed]="verClave()"
              (click)="verClave.set(!verClave())"
            >
              {{ verClave() ? 'Ocultar' : 'Mostrar' }}
            </button>
          </div>
          @if (err('password')) {
            <p id="password-error" class="error-campo">Escribe tu contraseña.</p>
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
          {{ enviando() ? 'Entrando…' : 'Iniciar sesión' }}
        </button>
      </form>
      <p class="mt-8 text-sm text-piedra">
        ¿No tienes cuenta? <a routerLink="/registro" class="btn-texto">Crea una</a>
      </p>
    </ti-auth-layout>
  `,
})
export class LoginPage implements OnInit {
  /** Query params (?correo=…&motivo=sesion) gracias a withComponentInputBinding. */
  readonly correo = input<string>();
  readonly motivo = input<string>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthPort);
  private readonly session = inject(SessionService);
  private readonly perfil = inject(DriverProfileStore);
  private readonly router = inject(Router);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly log = inject(LoggerPort);

  protected readonly form = this.fb.group({
    correo: ['', [Validators.required, correoValidator]],
    password: ['', Validators.required],
  });
  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  protected readonly aviso = signal('');
  protected readonly verClave = signal(false);

  ngOnInit(): void {
    const correo = this.correo();
    if (correo && esCorreoValido(correo)) this.form.controls.correo.setValue(correo);
    const cierre = this.session.ultimoCierre();
    if (this.motivo() === 'sesion' || cierre === 'rechazada' || cierre === 'expirada') {
      this.aviso.set('Tu sesión terminó. Inicia sesión otra vez para continuar.');
    } else if (this.motivo() === 'registro') {
      this.aviso.set('Cuenta creada. Ya puedes iniciar sesión.');
    }
  }

  protected err(campo: 'correo' | 'password'): boolean {
    return mostrarError(this.form.controls[campo]);
  }

  async enviar(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.enviando()) return;
    this.enviando.set(true);
    this.error.set('');
    const { correo, password } = this.form.getRawValue();
    try {
      const { usuario, token } = await this.auth.iniciarSesion(correo.trim(), password);
      if (!this.session.iniciar(usuario, token)) throw new ApiError(500, 'Token inválido');
      if (usuario.rol === '3') await this.perfil.cargar(true);
      await this.router.navigateByUrl(this.session.inicioDelRol());
    } catch (e) {
      this.error.set(
        e instanceof ApiError && e.status === 401 ? MENSAJE_CREDENCIALES : this.mapper.traducir(e),
      );
      if (!(e instanceof ApiError))
        this.log.error('Login', 'Fallo inesperado al iniciar sesión', e);
    } finally {
      this.enviando.set(false);
    }
  }
}
