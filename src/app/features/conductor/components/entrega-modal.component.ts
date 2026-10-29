import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { esPinValido } from '../../../core/domain';
import { ApiError } from '../../../core/http/api-error';
import { ErrorMessageMapper } from '../../../core/http/error-message.mapper';
import { DeliveryPort, EvidenceStoragePort, LoggerPort } from '../../../core/ports';
import { CargaArchivoComponent } from '../../../shared/ui/carga-archivo.component';
import { ModalComponent } from '../../../shared/ui/modal.component';
import { TecladoPinComponent } from '../../../shared/ui/teclado-pin.component';
import { ToastService } from '../../../shared/ui/toast.service';

export const MENSAJE_PIN_INCORRECTO =
  'El PIN no coincide. Pídeselo de nuevo al cliente e inténtalo otra vez.';

/** CU-009 Validación de entrega: PIN de 4 dígitos + foto de evidencia. */
@Component({
  selector: 'ti-entrega-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, TecladoPinComponent, CargaArchivoComponent],
  template: `
    <ti-modal titulo="Finalizar entrega" [cerrable]="!enviando()" (cerrar)="cerrar.emit()">
      <section aria-labelledby="paso-pin">
        <h3 id="paso-pin">PIN del cliente</h3>
        <p class="mb-4 text-sm text-piedra">Pídele al cliente los 4 dígitos de su PIN.</p>
        <ti-teclado-pin [(valor)]="pin" [deshabilitado]="enviando()" />
      </section>
      <section class="mt-6" aria-labelledby="paso-foto">
        <h3 id="paso-foto" class="mb-2">Foto de la entrega</h3>
        <ti-carga-archivo
          [tipos]="['image/jpeg', 'image/png']"
          [capturar]="true"
          textoAccion="Toma o elige una foto"
          ayuda="JPG o PNG, hasta 5 MB"
          [deshabilitado]="enviando()"
          (archivo)="alElegirFoto($event)"
        />
      </section>
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
        [disabled]="!listo() || enviando()"
        (click)="finalizar()"
      >
        {{ enviando() ? paso() : 'Finalizar entrega' }}
      </button>
    </ti-modal>
  `,
})
export class EntregaModalComponent {
  readonly idEnvio = input.required<number>();
  readonly cerrar = output<void>();
  readonly entregado = output<void>();
  /** Se emite si el backend dice que el envío ya estaba entregado. */
  readonly yaEntregado = output<void>();

  private readonly evidencias = inject(EvidenceStoragePort);
  private readonly entregas = inject(DeliveryPort);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerPort);

  readonly pin = signal('');
  readonly foto = signal<File | null>(null);
  /** URL de la foto ya subida: se reutiliza si el PIN fue incorrecto. */
  private urlFoto: string | null = null;
  protected readonly enviando = signal(false);
  protected readonly paso = signal('');
  protected readonly error = signal('');
  protected readonly listo = computed(() => esPinValido(this.pin()) && this.foto() !== null);

  alElegirFoto(f: File): void {
    this.foto.set(f);
    this.urlFoto = null;
  }

  async finalizar(): Promise<void> {
    const foto = this.foto();
    if (!this.listo() || !foto || this.enviando()) return;
    this.enviando.set(true);
    this.error.set('');
    try {
      if (!this.urlFoto) {
        this.paso.set('Subiendo foto…');
        this.urlFoto = await this.evidencias.subir(this.idEnvio(), foto);
      }
      this.paso.set('Validando PIN…');
      await this.entregas.validar(this.idEnvio(), this.urlFoto, this.pin());
      this.log.info('Entrega', `Envío #${this.idEnvio()} entregado`);
      this.toast.exito('Entrega registrada. ¡Buen trabajo!');
      this.entregado.emit();
    } catch (e) {
      if (e instanceof ApiError && /pin incorrecto/i.test(e.message)) {
        this.pin.set('');
        this.error.set(MENSAJE_PIN_INCORRECTO);
      } else if (
        e instanceof ApiError &&
        /ya ha sido validado|ya tiene una evidencia/i.test(e.message)
      ) {
        this.toast.mostrar('Este envío ya estaba entregado.');
        this.yaEntregado.emit();
      } else {
        this.error.set(this.mapper.traducir(e));
      }
    } finally {
      this.enviando.set(false);
    }
  }
}
