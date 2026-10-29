import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { ApiError } from '../../../core/http/api-error';
import { ErrorMessageMapper } from '../../../core/http/error-message.mapper';
import { LoggerPort, RatingPort } from '../../../core/ports';
import { RatedShipments } from '../../../core/adapters/local/local-adapters';
import { EstrellasComponent } from '../../../shared/ui/estrellas.component';
import { ModalComponent } from '../../../shared/ui/modal.component';
import { ToastService } from '../../../shared/ui/toast.service';

/** CU-010 Calificación del servicio (1 a 5 estrellas, entero, sin comentario). */
@Component({
  selector: 'ti-calificar-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, EstrellasComponent],
  template: `
    <ti-modal titulo="¿Cómo te fue con la entrega?" (cerrar)="cerrar.emit()">
      <p class="text-piedra">Califica el servicio del envío #{{ idEnvio() }}.</p>
      <div class="mt-5 flex justify-center">
        <ti-estrellas
          [(valor)]="puntuacion"
          etiqueta="Calificación del servicio"
          [deshabilitado]="enviando()"
        />
      </div>
      @if (error()) {
        <p class="error-campo mt-4 text-center" role="alert">{{ error() }}</p>
      }
      <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" class="btn-secundario" (click)="cerrar.emit()">Ahora no</button>
        <button
          type="button"
          class="btn-primario"
          [disabled]="puntuacion() < 1 || enviando()"
          (click)="enviar()"
        >
          {{ enviando() ? 'Enviando…' : 'Enviar calificación' }}
        </button>
      </div>
    </ti-modal>
  `,
})
export class CalificarModalComponent {
  readonly idEnvio = input.required<number>();
  readonly cerrar = output<void>();
  /** Se emite cuando el envío queda calificado (por esta acción o porque ya lo estaba). */
  readonly calificado = output<number | null>();

  private readonly rating = inject(RatingPort);
  private readonly calificados = inject(RatedShipments);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerPort);

  protected readonly puntuacion = signal(0);
  protected readonly enviando = signal(false);
  protected readonly error = signal('');

  async enviar(): Promise<void> {
    const valor = Math.round(this.puntuacion());
    if (valor < 1 || valor > 5 || this.enviando()) return;
    this.enviando.set(true);
    this.error.set('');
    try {
      await this.rating.calificar(this.idEnvio(), valor);
      await this.calificados.marcar(this.idEnvio());
      this.log.info('Calificacion', `Envío #${this.idEnvio()} calificado`, { puntuacion: valor });
      this.toast.exito('¡Gracias por calificar!');
      this.calificado.emit(valor);
    } catch (e) {
      if (e instanceof ApiError && /ya fue calificado/i.test(e.message)) {
        await this.calificados.marcar(this.idEnvio());
        this.toast.mostrar('Este envío ya estaba calificado.');
        this.calificado.emit(null);
      } else {
        this.error.set(this.mapper.traducir(e));
      }
    } finally {
      this.enviando.set(false);
    }
  }
}
