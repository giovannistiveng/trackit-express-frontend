import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { AuthPort } from '../../core/ports';
import { mostrarError } from '../../shared/ui/campo-error';
import { IconoComponent } from '../../shared/ui/icono.component';
import { AuthLayoutComponent } from './auth-layout.component';
import { contrasenaValidator, correoValidator } from './validators';

/** "¿Olvidaste tu contraseña?": pide el enlace por correo. */
@Component({
  selector: 'ti-olvide-contrasena',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent, IconoComponent],
  template: `
    <ti-auth-layout
      titulo="Recupera tu contraseña"
      subtitulo="Te enviaremos un enlace para elegir una nueva."
    >
      @if (enviado()) {
        <div class="rounded-2xl bg-exito-suave p-5" role="status">
          <p class="flex items-center gap-2 font-semibold text-exito">
            <ti-icono nombre="mail" /> Revisa tu correo
          </p>
          <p class="mt-2 text-sm">
            Si <strong>{{ correoEnviado() }}</strong> tiene una cuenta, te llegará un enlace que
            vence en 1 hora. Mira también la carpeta de correo no deseado.
          </p>
        </div>
        <button type="button" class="btn-secundario mt-6 w-full" (click)="enviado.set(false)">
          Usar otro correo
        </button>
      } @else {
        <form [formGroup]="form" (ngSubmit)="enviar()" novalidate class="space-y-5">
          <div>
            <label for="correo" class="etiqueta">Correo de tu cuenta</label>
            <input
              id="correo"
              type="email"
              class="campo"
              formControlName="correo"
              autocomplete="email"
              inputmode="email"
              [attr.aria-invalid]="err()"
              [attr.aria-describedby]="err() ? 'correo-error' : null"
            />
            @if (err()) {
              <p id="correo-error" class="error-campo">Escribe un correo válido.</p>
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
            {{ enviando() ? 'Enviando…' : 'Enviar enlace' }}
          </button>
        </form>
      }
      <p class="mt-8 text-sm text-piedra">
        <a routerLink="/login" class="btn-texto">Volver a iniciar sesión</a>
      </p>
    </ti-auth-layout>
  `,
})
export class OlvideContrasenaPage {
  private readonly auth = inject(AuthPort);
  private readonly mapper = inject(ErrorMessageMapper);
  protected readonly form = inject(NonNullableFormBuilder).group({
    correo: ['', [Validators.required, correoValidator]],
  });
  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly correoEnviado = signal('');
  protected readonly error = signal('');

  protected err(): boolean {
    return mostrarError(this.form.controls.correo);
  }

  async enviar(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.enviando()) return;
    const correo = this.form.getRawValue().correo.trim().toLowerCase();
    this.enviando.set(true);
    this.error.set('');
    try {
      await this.auth.olvidePassword(correo);
      this.correoEnviado.set(correo);
      this.enviado.set(true);
    } catch (e) {
      this.error.set(this.mapper.traducir(e));
    } finally {
      this.enviando.set(false);
    }
  }
}

/** Elegir una contraseña nueva con el enlace del correo (?token=…). */
@Component({
  selector: 'ti-restablecer-contrasena',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent, IconoComponent],
  template: `
    <ti-auth-layout
      titulo="Elige una contraseña nueva"
      subtitulo="Mínimo 8 caracteres, con una mayúscula y un número."
    >
      @if (listo()) {
        <div class="rounded-2xl bg-exito-suave p-5" role="status">
          <p class="flex items-center gap-2 font-semibold text-exito">
            <ti-icono nombre="circle-check" /> Contraseña actualizada
          </p>
          <p class="mt-2 text-sm">Ya puedes iniciar sesión con tu contraseña nueva.</p>
        </div>
        <a routerLink="/login" class="btn-primario mt-6 w-full">Iniciar sesión</a>
      } @else if (!token()) {
        <p
          class="rounded-lg bg-alerta-suave px-4 py-3 text-sm font-semibold text-alerta"
          role="alert"
        >
          El enlace está incompleto. Pide uno nuevo.
        </p>
        <a routerLink="/olvide-contrasena" class="btn-primario mt-6 w-full"
          >Pedir un enlace nuevo</a
        >
      } @else {
        <form [formGroup]="form" (ngSubmit)="enviar()" novalidate class="space-y-5">
          <div>
            <label for="nueva" class="etiqueta">Contraseña nueva</label>
            <input
              id="nueva"
              type="password"
              class="campo"
              formControlName="nueva"
              autocomplete="new-password"
              [attr.aria-invalid]="err('nueva')"
              [attr.aria-describedby]="err('nueva') ? 'nueva-error' : null"
            />
            @if (err('nueva')) {
              <p id="nueva-error" class="error-campo">
                Mínimo 8 caracteres, con una mayúscula y un número.
              </p>
            }
          </div>
          <div>
            <label for="confirmar" class="etiqueta">Repítela</label>
            <input
              id="confirmar"
              type="password"
              class="campo"
              formControlName="confirmar"
              autocomplete="new-password"
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
              @if (vencido()) {
                <a routerLink="/olvide-contrasena" class="btn-texto">Pedir otro enlace</a>
              }
            </p>
          }
          <button type="submit" class="btn-primario w-full" [disabled]="enviando()">
            {{ enviando() ? 'Guardando…' : 'Guardar contraseña' }}
          </button>
        </form>
      }
    </ti-auth-layout>
  `,
})
export class RestablecerContrasenaPage {
  readonly token = input<string>();
  private readonly auth = inject(AuthPort);
  private readonly mapper = inject(ErrorMessageMapper);
  protected readonly form = inject(NonNullableFormBuilder).group({
    nueva: ['', [Validators.required, contrasenaValidator]],
    confirmar: ['', Validators.required],
  });
  protected readonly enviando = signal(false);
  protected readonly listo = signal(false);
  protected readonly error = signal('');
  protected readonly vencido = signal(false);

  protected err(c: 'nueva'): boolean {
    return mostrarError(this.form.controls[c]);
  }

  protected noCoinciden(): boolean {
    const c = this.form.controls.confirmar;
    return (c.touched || c.dirty) && c.value !== this.form.controls.nueva.value;
  }

  async enviar(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.noCoinciden() || this.enviando()) return;
    this.enviando.set(true);
    this.error.set('');
    try {
      await this.auth.restablecerPassword(this.token() ?? '', this.form.getRawValue().nueva);
      this.listo.set(true);
    } catch (e) {
      const texto = this.mapper.traducir(e);
      this.vencido.set(/venció|ya se usó|no es válido/i.test(texto));
      this.error.set(texto);
    } finally {
      this.enviando.set(false);
    }
  }
}

/** Confirma el correo con el enlace recibido al registrarse (?token=…). */
@Component({
  selector: 'ti-verificar-correo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AuthLayoutComponent, IconoComponent],
  template: `
    <ti-auth-layout titulo="Verificación de correo" subtitulo="Confirmamos que el correo es tuyo.">
      @switch (estado()) {
        @case ('verificando') {
          <p class="flex items-center gap-2 text-piedra" role="status">
            <ti-icono nombre="loader" class="animate-spin" /> Verificando…
          </p>
        }
        @case ('ok') {
          <div class="rounded-2xl bg-exito-suave p-5" role="status">
            <p class="flex items-center gap-2 font-semibold text-exito">
              <ti-icono nombre="badge-check" /> ¡Correo verificado!
            </p>
            <p class="mt-2 text-sm">Gracias. Tu cuenta quedó protegida.</p>
          </div>
          <a [routerLink]="destino()" class="btn-primario mt-6 w-full">Continuar</a>
        }
        @case ('error') {
          <p
            class="rounded-lg bg-alerta-suave px-4 py-3 text-sm font-semibold text-alerta"
            role="alert"
          >
            {{ error() }}
          </p>
          <p class="mt-4 text-sm text-piedra">
            Puedes pedir un enlace nuevo desde <strong>Mi cuenta</strong>.
          </p>
          <a
            [routerLink]="session.estaAutenticado() ? '/cuenta' : '/login'"
            class="btn-primario mt-6 w-full"
          >
            {{ session.estaAutenticado() ? 'Ir a Mi cuenta' : 'Iniciar sesión' }}
          </a>
        }
      }
    </ti-auth-layout>
  `,
})
export class VerificarCorreoPage implements OnInit {
  readonly token = input<string>();
  protected readonly session = inject(SessionService);
  private readonly auth = inject(AuthPort);
  private readonly mapper = inject(ErrorMessageMapper);
  protected readonly estado = signal<'verificando' | 'ok' | 'error'>('verificando');
  protected readonly error = signal('');

  protected destino(): string {
    return this.session.estaAutenticado() ? this.session.inicioDelRol() : '/login';
  }

  ngOnInit(): void {
    void this.inicializar();
  }

  /** Carga inicial (asíncrona); el hook de Angular no espera promesas. */
  async inicializar(): Promise<void> {
    if (!this.token()) {
      this.error.set('El enlace está incompleto.');
      this.estado.set('error');
      return;
    }
    try {
      await this.auth.verificarCorreo(this.token() as string);
      this.session.marcarCorreoVerificado();
      this.estado.set('ok');
    } catch (e) {
      this.error.set(this.mapper.traducir(e));
      this.estado.set('error');
    }
  }
}
