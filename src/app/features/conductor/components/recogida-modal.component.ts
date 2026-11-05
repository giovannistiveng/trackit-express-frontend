import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { Envio } from '../../../core/domain';
import { ErrorMessageMapper } from '../../../core/http/error-message.mapper';
import { DriverServicePort, LoggerPort } from '../../../core/ports';
import { CargaArchivoComponent } from '../../../shared/ui/carga-archivo.component';
import { IconoComponent } from '../../../shared/ui/icono.component';
import { ModalComponent } from '../../../shared/ui/modal.component';

/** Foto del paquete al recogerlo: queda como constancia para el cliente y la ruta inicia. */
@Component({
  selector: 'ti-recogida-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, CargaArchivoComponent, IconoComponent],
  template: `
    <ti-modal titulo="Recoger el paquete" [cerrable]="!enviando()" (cerrar)="cerrar.emit()">
      <p class="text-sm text-piedra">
        Toma una foto donde se vea el paquete completo y en buen estado. El cliente la verá como
        constancia de la recogida.
      </p>
      <div class="mt-4">
        <ti-carga-archivo
          [tipos]="['image/jpeg', 'image/png', 'image/webp']"
          [conCamara]="true"
          tituloCamara="Foto del paquete"
          guiaCamara="entrega"
          [prefijoFoto]="'recogida-' + idEnvio()"
          textoAccion="Toma o elige la foto del paquete"
          ayuda="JPG, PNG o WebP, hasta 5 MB"
          [deshabilitado]="enviando()"
          (archivo)="foto.set($event)"
        />
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
        [disabled]="!foto() || enviando()"
        (click)="confirmar()"
      >
        <ti-icono
          [nombre]="enviando() ? 'loader' : 'navigation'"
          [class]="enviando() ? 'animate-spin' : ''"
        />
        {{ enviando() ? 'Subiendo foto…' : 'Confirmar recogida e iniciar ruta' }}
      </button>
    </ti-modal>
  `,
})
export class RecogidaModalComponent {
  readonly idEnvio = input.required<number>();
  readonly cerrar = output<void>();
  readonly recogido = output<Envio>();

  private readonly servicios = inject(DriverServicePort);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly log = inject(LoggerPort);

  readonly foto = signal<File | null>(null);
  protected readonly enviando = signal(false);
  protected readonly error = signal('');

  async confirmar(): Promise<void> {
    const foto = this.foto();
    if (!foto || this.enviando()) return;
    this.enviando.set(true);
    this.error.set('');
    try {
      const e = await this.servicios.recoger(this.idEnvio(), foto);
      this.log.info('Servicio', `Paquete recogido #${this.idEnvio()}`);
      this.recogido.emit(e);
    } catch (e) {
      this.error.set(this.mapper.traducir(e));
    } finally {
      this.enviando.set(false);
    }
  }
}
