import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Envio, SERVICIOS } from '../../../core/domain';
import { ErrorMessageMapper } from '../../../core/http/error-message.mapper';
import { DriverServicePort, LoggerPort } from '../../../core/ports';
import { CargaArchivoComponent } from '../../../shared/ui/carga-archivo.component';
import { IconoComponent } from '../../../shared/ui/icono.component';
import { ModalComponent } from '../../../shared/ui/modal.component';

/** Qué falta para confirmar la recogida, o '' si está completa. */
export function faltaRecogida(
  e: Pick<Envio, 'pideCodigoRecogida' | 'detalle'>,
  datos: { codigo: string; bultos: string; foto: File | null },
): string {
  if (e.pideCodigoRecogida && !/^\d{4}$/.test(datos.codigo.trim()))
    return 'Escribe el código de 4 dígitos que te dan.';
  const bultos = Number(datos.bultos);
  if (e.detalle?.bultos && (Number.isNaN(bultos) || bultos < 1))
    return 'Cuenta los bultos que recibes.';
  if (!datos.foto) return 'Toma la foto.';
  return '';
}

/**
 * Recogida de la carga: código de recogida (lo da quien entrega), bultos contados, valor de la
 * compra (mandados y mercados) y foto. Con eso el servicio pasa a "En camino".
 */
@Component({
  selector: 'ti-recogida-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ModalComponent, CargaArchivoComponent, IconoComponent],
  template: `
    <ti-modal
      [titulo]="conCompra() ? 'Registrar la compra' : 'Recoger la carga'"
      [cerrable]="!enviando()"
      (cerrar)="cerrar.emit()"
    >
      <div class="space-y-5">
        @if (envio().pideCodigoRecogida) {
          <div>
            <label for="rec-codigo" class="etiqueta flex items-center gap-2"
              ><ti-icono nombre="key" class="size-4 text-marca" /> Código de recogida</label
            >
            <input
              id="rec-codigo"
              class="campo numeros max-w-40 text-center text-2xl font-extrabold tracking-[0.3em]"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="4"
              [ngModel]="codigo()"
              (ngModelChange)="codigo.set($event)"
              [disabled]="enviando()"
            />
            <p class="ayuda">
              Pídeselo a quien te entrega. Si no lo tiene, el cliente lo ve en su app.
            </p>
          </div>
        }
        <div>
          <label for="rec-bultos" class="etiqueta flex items-center gap-2"
            ><ti-icono nombre="boxes" class="size-4 text-marca" /> Bultos que recibes</label
          >
          <input
            id="rec-bultos"
            type="number"
            min="1"
            max="200"
            class="campo max-w-40"
            inputmode="numeric"
            [ngModel]="bultos()"
            (ngModelChange)="bultos.set($event)"
            [disabled]="enviando()"
          />
          @if (envio().detalle?.bultos; as declarados) {
            <p class="ayuda" [class.!text-alerta]="!!bultos() && +bultos() !== declarados">
              El cliente declaró {{ declarados }}.
              {{ bultos() && +bultos() !== declarados ? 'Le avisaremos de la diferencia.' : '' }}
            </p>
          } @else {
            <p class="ayuda">Opcional: ayuda a que nadie tenga dudas al entregar.</p>
          }
        </div>
        @if (conCompra()) {
          <div>
            <label for="rec-compra" class="etiqueta flex items-center gap-2"
              ><ti-icono nombre="receipt" class="size-4 text-marca" /> Valor de la factura</label
            >
            <input
              id="rec-compra"
              type="number"
              min="0"
              step="100"
              class="campo max-w-52"
              inputmode="numeric"
              [ngModel]="valorCompra()"
              (ngModelChange)="valorCompra.set($event)"
              [disabled]="enviando()"
            />
            <p class="ayuda">
              Lo cobras en efectivo al entregar, además del servicio{{
                envio().detalle?.presupuesto
                  ? ' (el cliente calculó ' + envio().detalle?.presupuesto + ')'
                  : ''
              }}.
            </p>
          </div>
        }
        <div>
          <p class="etiqueta">
            {{ conCompra() ? 'Foto de la factura y la compra' : 'Foto de la carga' }}
          </p>
          <ti-carga-archivo
            [tipos]="['image/jpeg', 'image/png', 'image/webp']"
            [conCamara]="true"
            [tituloCamara]="conCompra() ? 'Foto de la factura' : 'Foto de la carga'"
            guiaCamara="entrega"
            [prefijoFoto]="'recogida-' + envio().id"
            textoAccion="Toma o elige la foto"
            ayuda="Que se vea todo completo y en buen estado. JPG, PNG o WebP, hasta 5 MB"
            [deshabilitado]="enviando()"
            (archivo)="foto.set($event)"
          />
        </div>
      </div>
      @if (error()) {
        <p
          class="mt-4 rounded-lg bg-alerta-suave px-4 py-3 text-sm font-semibold text-alerta"
          role="alert"
        >
          {{ error() }}
        </p>
      }
      <button
        type="button"
        class="btn-primario mt-6 w-full"
        [disabled]="!!falta() || enviando()"
        (click)="confirmar()"
      >
        <ti-icono
          [nombre]="enviando() ? 'loader' : 'navigation'"
          [class]="enviando() ? 'animate-spin' : ''"
        />
        {{ enviando() ? 'Enviando…' : 'Confirmar y salir a entregar' }}
      </button>
      @if (falta() && !enviando()) {
        <p class="mt-2 text-center text-sm text-piedra">{{ falta() }}</p>
      }
    </ti-modal>
  `,
})
export class RecogidaModalComponent {
  readonly envio = input.required<Envio>();
  readonly cerrar = output<void>();
  readonly recogido = output<Envio>();

  private readonly servicios = inject(DriverServicePort);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly log = inject(LoggerPort);

  readonly foto = signal<File | null>(null);
  readonly codigo = signal('');
  readonly bultos = signal('');
  readonly valorCompra = signal('');
  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  protected readonly conCompra = computed(() => SERVICIOS[this.envio().tipoServicio].conCompra);
  protected readonly falta = computed(() =>
    faltaRecogida(this.envio(), {
      codigo: String(this.codigo() ?? ''),
      bultos: String(this.bultos() ?? ''),
      foto: this.foto(),
    }),
  );

  async confirmar(): Promise<void> {
    const foto = this.foto();
    if (!foto || this.falta() || this.enviando()) return;
    this.enviando.set(true);
    this.error.set('');
    const bultos = Number(this.bultos());
    const compra = Number(this.valorCompra());
    try {
      const e = await this.servicios.recoger(this.envio().id, foto, {
        codigo: this.envio().pideCodigoRecogida ? String(this.codigo()).trim() : undefined,
        bultos: bultos >= 1 ? Math.round(bultos) : undefined,
        valorCompra: this.conCompra() && compra > 0 ? Math.round(compra) : undefined,
      });
      this.log.info('Servicio', `Carga recogida #${this.envio().id}`);
      this.recogido.emit(e);
    } catch (e) {
      this.error.set(this.mapper.traducir(e));
    } finally {
      this.enviando.set(false);
    }
  }
}
