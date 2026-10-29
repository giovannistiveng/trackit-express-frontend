import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SessionService } from '../../core/auth/session.service';
import { PerfilUsuario, requisitosContrasena } from '../../core/domain';
import { ApiError } from '../../core/http/api-error';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { AccountPort, LoggerPort } from '../../core/ports';
import { FechaLocalPipe } from '../../shared/pipes/fecha-local.pipe';
import { mostrarError } from '../../shared/ui/campo-error';
import { FaseCarga, EstadoCargaComponent } from '../../shared/ui/estado-carga.component';
import { IconoComponent } from '../../shared/ui/icono.component';
import { ToastService } from '../../shared/ui/toast.service';
import { contrasenaValidator } from '../auth/validators';
import { iniciales } from '../../layout/shell.component';

const TELEFONO_RE = /^\+?[\d\s-]{7,20}$/;

/** Mi cuenta: datos personales, teléfono de contacto y cambio de contraseña. */
@Component({
  selector: 'ti-cuenta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, IconoComponent, EstadoCargaComponent, FechaLocalPipe],
  template: `
    <div class="contenedor">
      <h1>Mi cuenta</h1>
      <p class="mt-2 text-piedra">Tus datos de contacto y la seguridad de tu cuenta.</p>

      <ti-estado-carga
        class="mt-8 block"
        [fase]="fase()"
        textoError="No se pudo cargar tu perfil."
        (reintentar)="cargar()"
      >
        @if (perfil(); as p) {
          <section class="tarjeta flex items-center gap-4 p-5 animate-[var(--animate-aparecer)]">
            <span
              class="grid size-16 place-items-center rounded-full bg-marca text-xl font-extrabold text-white"
              >{{ inicialesDe(p.nombre) }}</span
            >
            <div class="min-w-0">
              <p class="truncate text-lg font-bold">{{ p.nombre }}</p>
              <p class="truncate text-piedra">{{ p.correo }}</p>
              <p class="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <span class="insignia bg-marca-suave text-marca">{{ p.nombreRol }}</span>
                @if (p.fechaRegistro) {
                  <span class="text-piedra">Desde {{ p.fechaRegistro | fechaLocal: 'fecha' }}</span>
                }
              </p>
            </div>
          </section>

          <section class="tarjeta mt-6 p-5 sm:p-6" aria-labelledby="titulo-datos">
            <h2 id="titulo-datos" class="flex items-center gap-2">
              <ti-icono nombre="user-round" class="text-marca" /> Datos personales
            </h2>
            <form
              [formGroup]="datos"
              (ngSubmit)="guardarDatos()"
              novalidate
              class="mt-5 grid gap-5 sm:grid-cols-2"
            >
              <div class="sm:col-span-2">
                <label for="nombre" class="etiqueta">Nombre completo</label>
                <input
                  id="nombre"
                  class="campo"
                  formControlName="nombre"
                  autocomplete="name"
                  [attr.aria-invalid]="err('nombre')"
                />
                @if (err('nombre')) {
                  <p class="error-campo">Escribe tu nombre (3 a 120 caracteres).</p>
                }
              </div>
              <div>
                <label for="correo" class="etiqueta">Correo</label>
                <input
                  id="correo"
                  class="campo bg-niebla text-piedra"
                  [value]="p.correo"
                  disabled
                />
                <p class="ayuda">El correo no se puede cambiar.</p>
              </div>
              <div>
                <label for="telefono" class="etiqueta"
                  >Teléfono <span class="font-normal text-piedra">(opcional)</span></label
                >
                <input
                  id="telefono"
                  type="tel"
                  inputmode="tel"
                  class="campo"
                  formControlName="telefono"
                  autocomplete="tel"
                  placeholder="310 555 1234"
                  [attr.aria-invalid]="err('telefono')"
                />
                @if (err('telefono')) {
                  <p class="error-campo">Escribe entre 7 y 15 dígitos.</p>
                } @else {
                  <p class="ayuda">
                    {{
                      p.rol === '3'
                        ? 'Para coordinar las entregas.'
                        : 'Por si el conductor necesita ubicarte.'
                    }}
                  </p>
                }
              </div>
              @if (errorDatos()) {
                <p
                  class="rounded-lg bg-alerta-suave px-3 py-2 text-sm font-medium text-alerta sm:col-span-2"
                  role="alert"
                >
                  {{ errorDatos() }}
                </p>
              }
              <div class="sm:col-span-2">
                <button
                  type="submit"
                  class="btn-primario"
                  [disabled]="guardandoDatos() || datos.pristine"
                >
                  <ti-icono
                    [nombre]="guardandoDatos() ? 'loader' : 'save'"
                    [class]="guardandoDatos() ? 'animate-spin' : ''"
                  />
                  {{ guardandoDatos() ? 'Guardando…' : 'Guardar cambios' }}
                </button>
              </div>
            </form>
          </section>

          <section class="tarjeta mt-6 p-5 sm:p-6" aria-labelledby="titulo-clave">
            <h2 id="titulo-clave" class="flex items-center gap-2">
              <ti-icono nombre="lock" class="text-marca" /> Cambiar contraseña
            </h2>
            <form
              [formGroup]="clave"
              (ngSubmit)="cambiarClave()"
              novalidate
              class="mt-5 grid gap-5"
            >
              <div>
                <label for="actual" class="etiqueta">Contraseña actual</label>
                <input
                  id="actual"
                  type="password"
                  class="campo"
                  formControlName="actual"
                  autocomplete="current-password"
                />
              </div>
              <div>
                <label for="nueva" class="etiqueta">Nueva contraseña</label>
                <input
                  id="nueva"
                  type="password"
                  class="campo"
                  formControlName="nueva"
                  autocomplete="new-password"
                  aria-describedby="requisitos"
                  [attr.aria-invalid]="errClave()"
                />
                <ul id="requisitos" class="mt-2 grid gap-1 text-sm sm:grid-cols-3">
                  @for (r of requisitos(); track r.texto) {
                    <li
                      class="flex items-center gap-1.5"
                      [class.text-exito]="r.ok"
                      [class.text-piedra]="!r.ok"
                    >
                      <ti-icono [nombre]="r.ok ? 'circle-check' : 'clock'" class="size-4" />
                      {{ r.texto }}
                    </li>
                  }
                </ul>
              </div>
              @if (errorClave()) {
                <p
                  class="rounded-lg bg-alerta-suave px-3 py-2 text-sm font-medium text-alerta"
                  role="alert"
                >
                  {{ errorClave() }}
                </p>
              }
              <div>
                <button type="submit" class="btn-primario" [disabled]="guardandoClave()">
                  <ti-icono
                    [nombre]="guardandoClave() ? 'loader' : 'lock'"
                    [class]="guardandoClave() ? 'animate-spin' : ''"
                  />
                  {{ guardandoClave() ? 'Actualizando…' : 'Actualizar contraseña' }}
                </button>
              </div>
            </form>
          </section>
        }
      </ti-estado-carga>
    </div>
  `,
})
export class CuentaPage implements OnInit {
  private readonly cuenta = inject(AccountPort);
  private readonly session = inject(SessionService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerPort);

  protected readonly perfil = signal<PerfilUsuario | null>(null);
  protected readonly fase = signal<FaseCarga>('cargando');
  protected readonly datos = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    telefono: ['', [Validators.pattern(TELEFONO_RE)]],
  });
  protected readonly clave = this.fb.group({
    actual: ['', Validators.required],
    nueva: ['', [Validators.required, contrasenaValidator]],
  });
  protected readonly guardandoDatos = signal(false);
  protected readonly guardandoClave = signal(false);
  protected readonly errorDatos = signal('');
  protected readonly errorClave = signal('');
  protected readonly requisitos = signal(this.listaRequisitos(''));

  constructor() {
    this.clave.controls.nueva.valueChanges.subscribe((v) =>
      this.requisitos.set(this.listaRequisitos(v)),
    );
  }

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.fase.set('cargando');
    try {
      const p = await this.cuenta.perfil();
      this.perfil.set(p);
      this.datos.reset({ nombre: p.nombre, telefono: p.telefono ?? '' });
      this.fase.set('listo');
    } catch (e) {
      this.log.warn('Cuenta', 'No se pudo cargar el perfil', e);
      this.fase.set('error');
    }
  }

  protected err(campo: 'nombre' | 'telefono'): boolean {
    return mostrarError(this.datos.controls[campo]);
  }

  protected errClave(): boolean {
    return mostrarError(this.clave.controls.nueva);
  }

  protected inicialesDe(nombre: string): string {
    return iniciales(nombre);
  }

  async guardarDatos(): Promise<void> {
    this.datos.markAllAsTouched();
    if (this.datos.invalid || this.guardandoDatos()) return;
    this.guardandoDatos.set(true);
    this.errorDatos.set('');
    try {
      const v = this.datos.getRawValue();
      const p = await this.cuenta.actualizar({
        nombre: v.nombre.trim(),
        telefono: v.telefono.trim(),
      });
      this.perfil.set(p);
      this.datos.reset({ nombre: p.nombre, telefono: p.telefono ?? '' });
      const u = this.session.usuario();
      if (u) this.session.actualizarNombre(p.nombre);
      this.toast.exito('Datos actualizados');
    } catch (e) {
      this.errorDatos.set(this.mapper.traducir(e));
    } finally {
      this.guardandoDatos.set(false);
    }
  }

  async cambiarClave(): Promise<void> {
    this.clave.markAllAsTouched();
    if (this.clave.invalid || this.guardandoClave()) return;
    this.guardandoClave.set(true);
    this.errorClave.set('');
    try {
      const v = this.clave.getRawValue();
      await this.cuenta.cambiarPassword(v.actual, v.nueva);
      this.clave.reset();
      this.toast.exito('Contraseña actualizada');
      this.log.info('Cuenta', 'Contraseña cambiada');
    } catch (e) {
      this.errorClave.set(
        e instanceof ApiError && /actual no es correcta/i.test(e.message)
          ? 'La contraseña actual no es correcta.'
          : this.mapper.traducir(e),
      );
    } finally {
      this.guardandoClave.set(false);
    }
  }

  private listaRequisitos(valor: string) {
    const r = requisitosContrasena(valor);
    return [
      { texto: '8 caracteres o más', ok: r.longitud },
      { texto: 'Una mayúscula', ok: r.mayuscula },
      { texto: 'Un número', ok: r.numero },
    ];
  }
}
