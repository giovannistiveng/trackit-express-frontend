import { FormsModule } from '@angular/forms';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { ApiError } from '../../../core/http/api-error';
import { ErrorMessageMapper } from '../../../core/http/error-message.mapper';
import { LoggerPort, RatingPort } from '../../../core/ports';
import { EstrellasComponent } from '../../../shared/ui/estrellas.component';
import { ModalComponent } from '../../../shared/ui/modal.component';
import { ToastService } from '../../../shared/ui/toast.service';

const SUGERENCIAS = ['Puntual', 'Amable', 'Cuidó el paquete', 'Buena comunicación'];

/** CU-010 Calificación del servicio: 1 a 5 estrellas (entero) y un comentario opcional. */
@Component({
  selector: 'ti-calificar-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, EstrellasComponent, FormsModule],
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
      @if (puntuacion() > 0) {
        <div class="mt-6 animate-[var(--animate-aparecer)]">
          <p class="etiqueta">
            ¿Qué destacas? <span class="font-normal text-piedra">(opcional)</span>
          </p>
          <div class="flex flex-wrap gap-2">
            @for (s of sugerencias; track s) {
              <button
                type="button"
                class="insignia min-h-9 border transition-colors"
                [class]="
                  comentario().includes(s)
                    ? 'border-marca bg-marca text-white'
                    : 'border-linea bg-papel text-piedra hover:border-marca'
                "
                [attr.aria-pressed]="comentario().includes(s)"
                (click)="alternarSugerencia(s)"
              >
                {{ s }}
              </button>
            }
          </div>
          <label for="comentario" class="sr-only">Comentario</label>
          <textarea
            id="comentario"
            rows="2"
            class="campo mt-3"
            maxlength="300"
            placeholder="Cuéntanos más (opcional)"
            [ngModel]="comentario()"
            (ngModelChange)="comentario.set($event)"
          ></textarea>
          <p class="ayuda text-right">{{ comentario().length }}/300</p>
        </div>
      }
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
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerPort);

  protected readonly puntuacion = signal(0);
  protected readonly comentario = signal('');
  protected readonly sugerencias = SUGERENCIAS;
  protected readonly enviando = signal(false);
  protected readonly error = signal('');

  protected alternarSugerencia(s: string): void {
    const partes = this.comentario()
      .split(/,\s*/)
      .map((p) => p.trim())
      .filter(Boolean);
    const nuevo = partes.includes(s) ? partes.filter((p) => p !== s) : [...partes, s];
    this.comentario.set(nuevo.join(', ').slice(0, 300));
  }

  async enviar(): Promise<void> {
    const valor = Math.round(this.puntuacion());
    if (valor < 1 || valor > 5 || this.enviando()) return;
    this.enviando.set(true);
    this.error.set('');
    try {
      await this.rating.calificar(this.idEnvio(), valor, this.comentario().trim() || undefined);
      this.log.info('Calificacion', `Envío #${this.idEnvio()} calificado`, { puntuacion: valor });
      this.toast.exito('¡Gracias por calificar!');
      this.calificado.emit(valor);
    } catch (e) {
      if (e instanceof ApiError && /ya fue calificado/i.test(e.message)) {
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
