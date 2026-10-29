import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MensajeContactoRecibido, Pagina } from '../../core/domain';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { AdminOperationsPort } from '../../core/ports';
import { FechaLocalPipe } from '../../shared/pipes/fecha-local.pipe';
import { EstadoCargaComponent, FaseCarga } from '../../shared/ui/estado-carga.component';
import { IconoComponent } from '../../shared/ui/icono.component';
import { ToastService } from '../../shared/ui/toast.service';

/** Administración: mensajes que llegan por el formulario de contacto del sitio. */
@Component({
  selector: 'ti-mensajes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FechaLocalPipe, EstadoCargaComponent, IconoComponent],
  template: `
    <div class="contenedor">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Mensajes</h1>
          <p class="mt-1 text-piedra">
            Lo que escriben clientes, empresas y conductores desde el sitio web.
          </p>
        </div>
        <label class="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
          <input
            type="checkbox"
            class="size-5 accent-marca"
            [checked]="soloPendientes()"
            (change)="alternar()"
          />
          Solo pendientes
        </label>
      </div>
      <ti-estado-carga
        class="mt-6 block"
        [fase]="fase()"
        [textoError]="error()"
        textoVacio="No hay mensajes por aquí."
        (reintentar)="cargar()"
      >
        <ul class="space-y-3">
          @for (m of pagina()?.items ?? []; track m.id) {
            <li class="tarjeta p-5" [class.opacity-70]="m.atendido">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="flex flex-wrap items-center gap-2 font-semibold">
                    {{ m.nombre }}
                    <span class="insignia bg-marca-suave text-marca">{{ m.asunto }}</span>
                    @if (m.atendido) {
                      <span class="insignia bg-exito-suave text-exito"
                        ><ti-icono nombre="check" class="size-3" /> Atendido</span
                      >
                    }
                  </p>
                  <p class="mt-0.5 text-sm text-piedra">
                    {{ m.correo }}
                    @if (m.telefono) {
                      · {{ m.telefono }}
                    }
                    · {{ m.fecha | fechaLocal }}
                  </p>
                </div>
                <div class="flex gap-2">
                  <a
                    class="btn-secundario min-h-9 px-3 text-sm"
                    [href]="'mailto:' + m.correo + '?subject=' + asuntoCorreo(m)"
                    ><ti-icono nombre="mail" class="size-4" /> Responder</a
                  >
                  @if (!m.atendido) {
                    <button
                      type="button"
                      class="btn-primario min-h-9 px-3 text-sm"
                      (click)="atender(m)"
                    >
                      <ti-icono nombre="check" class="size-4" /> Atendido
                    </button>
                  }
                </div>
              </div>
              <p class="mt-3 whitespace-pre-line rounded-xl bg-crema p-3">{{ m.mensaje }}</p>
            </li>
          }
        </ul>
      </ti-estado-carga>
    </div>
  `,
})
export class MensajesPage implements OnInit {
  private readonly ops = inject(AdminOperationsPort);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly toast = inject(ToastService);

  protected readonly pagina = signal<Pagina<MensajeContactoRecibido> | null>(null);
  protected readonly soloPendientes = signal(true);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly fase = computed<FaseCarga>(() =>
    this.cargando()
      ? 'cargando'
      : this.error()
        ? 'error'
        : (this.pagina()?.items.length ?? 0) === 0
          ? 'vacio'
          : 'listo',
  );

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      this.pagina.set(await this.ops.mensajes(this.soloPendientes(), 1));
    } catch (e) {
      this.error.set(this.mapper.traducir(e));
    } finally {
      this.cargando.set(false);
    }
  }

  protected alternar(): void {
    this.soloPendientes.update((v) => !v);
    void this.cargar();
  }

  protected asuntoCorreo(m: MensajeContactoRecibido): string {
    return encodeURIComponent(`Re: tu mensaje a TrackIt Express (${m.asunto})`);
  }

  async atender(m: MensajeContactoRecibido): Promise<void> {
    try {
      await this.ops.atenderMensaje(m.id);
      this.toast.exito('Mensaje marcado como atendido');
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mapper.traducir(e));
    }
  }
}
