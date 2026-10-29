import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DocumentoConductor, TipoDocumento } from '../../../core/domain';
import { ErrorMessageMapper } from '../../../core/http/error-message.mapper';
import { DocumentsPort, LoggerPort } from '../../../core/ports';
import { CargaArchivoComponent } from '../../../shared/ui/carga-archivo.component';
import { Subscription } from 'rxjs';

export type EstadoDocumento = 'sin-cargar' | 'subiendo' | 'en-revision' | 'error';

const ETIQUETA: Record<EstadoDocumento, string> = {
  'sin-cargar': 'Sin cargar',
  subiendo: 'Subiendo',
  'en-revision': 'En revisión',
  error: 'Error',
};

/** CU-004: una tarjeta por documento (Cédula, SOAT, Licencia). */
@Component({
  selector: 'ti-documento-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CargaArchivoComponent],
  template: `
    <article
      class="rounded-xl border border-linea bg-papel p-4"
      [attr.aria-labelledby]="'doc-' + tipo()"
    >
      <div class="mb-3 flex items-center justify-between gap-2">
        <h3 [id]="'doc-' + tipo()">{{ tipo() }}</h3>
        <span
          class="rounded-full px-2.5 py-0.5 text-xs font-semibold"
          [class]="
            estado() === 'en-revision'
              ? 'bg-exito-suave text-exito'
              : estado() === 'error'
                ? 'bg-alerta-suave text-alerta'
                : 'bg-niebla text-piedra'
          "
        >
          {{ etiqueta[estado()] }}
        </span>
      </div>
      <ti-carga-archivo
        [deshabilitado]="estado() === 'subiendo' || deshabilitado()"
        [textoAccion]="
          estado() === 'en-revision' ? 'Reemplazar archivo' : 'Elige o arrastra el archivo'
        "
        (archivo)="subir($event)"
      />
      @if (estado() === 'subiendo') {
        <div
          class="mt-3"
          role="progressbar"
          [attr.aria-valuenow]="progreso()"
          aria-valuemin="0"
          aria-valuemax="100"
          [attr.aria-label]="'Subiendo ' + tipo()"
        >
          <div class="h-2 overflow-hidden rounded-full bg-niebla">
            <div class="h-full bg-marca transition-[width]" [style.width.%]="progreso()"></div>
          </div>
          <p class="numeros mt-1 text-sm text-piedra">{{ progreso() }} %</p>
        </div>
      }
      @if (estado() === 'en-revision') {
        <p class="mt-3 text-sm font-medium text-exito" role="status">
          Documento recibido, queda en revisión
        </p>
      }
      @if (error()) {
        <p class="error-campo mt-3" role="alert">{{ error() }}</p>
      }
    </article>
  `,
})
export class DocumentoCardComponent {
  readonly tipo = input.required<TipoDocumento>();
  readonly deshabilitado = input(false);
  readonly subido = output<DocumentoConductor>();

  private readonly docs = inject(DocumentsPort);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly log = inject(LoggerPort);
  private readonly carga = viewChild(CargaArchivoComponent);
  private sub: Subscription | null = null;

  protected readonly etiqueta = ETIQUETA;
  readonly estado = signal<EstadoDocumento>('sin-cargar');
  readonly progreso = signal(0);
  readonly error = signal('');
  readonly documento = signal<DocumentoConductor | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  subir(archivo: File): void {
    this.sub?.unsubscribe();
    this.estado.set('subiendo');
    this.progreso.set(0);
    this.error.set('');
    this.sub = this.docs.subir(archivo, this.tipo()).subscribe({
      next: (ev) => {
        if (ev.tipo === 'progreso') this.progreso.set(ev.porcentaje);
        else {
          this.documento.set(ev.documento);
          this.estado.set('en-revision');
          this.progreso.set(100);
          this.log.info('Documentos', `Documento ${this.tipo()} cargado`);
          this.subido.emit(ev.documento);
        }
      },
      error: (e: unknown) => {
        this.estado.set('error');
        this.error.set(this.mapper.traducir(e));
        this.carga()?.reiniciar();
      },
    });
  }
}
