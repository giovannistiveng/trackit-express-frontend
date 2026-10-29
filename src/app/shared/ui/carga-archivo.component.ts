import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { ErrorArchivo, MAX_ARCHIVO_BYTES, validarArchivo } from '../../core/domain';

let contador = 0;

export const MENSAJES_ARCHIVO: Record<ErrorArchivo, string> = {
  tipo: 'Ese formato no está permitido. Usa JPG, PNG o PDF.',
  tamano: 'El archivo pesa más de 5 MB. Elige uno más liviano.',
  vacio: 'Elige un archivo.',
};

/**
 * Selector de archivo con arrastrar y soltar, validación en el cliente y vista previa.
 * Solo emite archivos válidos; los inválidos producen un mensaje y no se emiten.
 */
@Component({
  selector: 'ti-carga-archivo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label
      [for]="idInput"
      class="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors"
      [class.border-monte]="arrastrando()"
      [class.bg-monte-suave]="arrastrando()"
      [class.border-linea]="!arrastrando()"
      (dragover)="$event.preventDefault(); arrastrando.set(true)"
      (dragleave)="arrastrando.set(false)"
      (drop)="alSoltar($event)"
    >
      @if (vistaPrevia()) {
        <img
          [src]="vistaPrevia()"
          alt="Vista previa del archivo elegido"
          class="max-h-40 rounded-lg object-contain"
        />
      } @else if (nombre()) {
        <span class="text-3xl" aria-hidden="true">📄</span>
      } @else {
        <span class="text-3xl" aria-hidden="true">⇪</span>
      }
      <span class="font-semibold">{{ nombre() || textoAccion() }}</span>
      <span class="text-sm text-piedra">{{ ayuda() }}</span>
    </label>
    <input
      [id]="idInput"
      type="file"
      class="sr-only"
      [accept]="tipos().join(',')"
      [attr.capture]="capturar() ? 'environment' : null"
      [disabled]="deshabilitado()"
      [attr.aria-describedby]="error() ? idError : null"
      (change)="alElegir($event)"
    />
    @if (error()) {
      <p [id]="idError" class="error-campo" role="alert">{{ error() }}</p>
    }
  `,
})
export class CargaArchivoComponent implements OnDestroy {
  readonly tipos = input<readonly string[]>(['image/jpeg', 'image/png', 'application/pdf']);
  readonly maxBytes = input(MAX_ARCHIVO_BYTES);
  readonly textoAccion = input('Elige o arrastra un archivo');
  readonly ayuda = input('JPG, PNG o PDF, hasta 5 MB');
  readonly capturar = input(false);
  readonly deshabilitado = input(false);
  readonly archivo = output<File>();
  readonly rechazado = output<ErrorArchivo>();

  protected readonly idInput = `archivo-${++contador}`;
  protected readonly idError = `${this.idInput}-error`;
  protected readonly arrastrando = signal(false);
  protected readonly error = signal('');
  protected readonly nombre = signal('');
  private readonly urlPrevia = signal<string | null>(null);
  protected readonly vistaPrevia = computed(() => this.urlPrevia());

  ngOnDestroy(): void {
    this.liberar();
  }

  /** Procesa un archivo (público para pruebas). */
  procesar(archivo: File | null | undefined): void {
    const problema = validarArchivo(archivo, this.tipos(), this.maxBytes());
    if (problema || !archivo) {
      this.error.set(MENSAJES_ARCHIVO[problema ?? 'vacio']);
      this.rechazado.emit(problema ?? 'vacio');
      return;
    }
    this.error.set('');
    this.nombre.set(archivo.name);
    this.liberar();
    if (archivo.type.startsWith('image/') && typeof URL.createObjectURL === 'function') {
      this.urlPrevia.set(URL.createObjectURL(archivo));
    }
    this.archivo.emit(archivo);
  }

  reiniciar(): void {
    this.liberar();
    this.nombre.set('');
    this.error.set('');
  }

  protected alElegir(ev: Event): void {
    const entrada = ev.target as HTMLInputElement;
    this.procesar(entrada.files?.[0]);
    entrada.value = '';
  }

  protected alSoltar(ev: DragEvent): void {
    ev.preventDefault();
    this.arrastrando.set(false);
    if (!this.deshabilitado()) this.procesar(ev.dataTransfer?.files?.[0]);
  }

  private liberar(): void {
    const url = this.urlPrevia();
    if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
    this.urlPrevia.set(null);
  }
}
