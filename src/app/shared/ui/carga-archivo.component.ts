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
import { comprimirImagen } from '../util/imagen';
import { CamaraComponent } from './camara.component';
import { IconoComponent } from './icono.component';

let contador = 0;

export const MENSAJES_ARCHIVO: Record<ErrorArchivo, string> = {
  tipo: 'Ese formato no está permitido. Usa JPG, PNG, WebP o PDF.',
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
  imports: [CamaraComponent, IconoComponent],
  template: `
    <label
      [for]="idInput"
      class="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors"
      [class.border-marca]="arrastrando()"
      [class.bg-marca-suave]="arrastrando()"
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
        <ti-icono nombre="file-text" class="size-8 text-marca" />
      } @else {
        <span class="grid size-12 place-items-center rounded-full bg-marca-suave text-marca">
          <ti-icono nombre="upload" class="size-6" />
        </span>
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
    @if (conCamara()) {
      <button
        type="button"
        class="btn-secundario mt-2 w-full"
        [disabled]="deshabilitado()"
        (click)="camaraAbierta.set(true)"
      >
        <ti-icono nombre="camera" class="text-marca" />
        Tomar foto con la cámara
      </button>
    }
    @if (error()) {
      <p [id]="idError" class="error-campo" role="alert">{{ error() }}</p>
    }
    @if (camaraAbierta()) {
      <ti-camara
        [titulo]="tituloCamara()"
        [guia]="guiaCamara()"
        [prefijo]="prefijoFoto()"
        (foto)="alFotografiar($event)"
        (cerrar)="camaraAbierta.set(false)"
      />
    }
  `,
})
export class CargaArchivoComponent implements OnDestroy {
  readonly tipos = input<readonly string[]>(['image/jpeg', 'image/png', 'application/pdf']);
  readonly maxBytes = input(MAX_ARCHIVO_BYTES);
  readonly textoAccion = input('Elige o arrastra un archivo');
  readonly ayuda = input('JPG, PNG o PDF, hasta 5 MB');
  readonly capturar = input(false);
  /** Muestra el botón "Tomar foto con la cámara" (cámara en vivo dentro de la app). */
  readonly conCamara = input(false);
  readonly tituloCamara = input('Tomar foto');
  readonly guiaCamara = input<'documento' | 'entrega'>('documento');
  readonly prefijoFoto = input('foto');
  readonly deshabilitado = input(false);
  readonly archivo = output<File>();
  readonly rechazado = output<ErrorArchivo>();

  protected readonly idInput = `archivo-${++contador}`;
  protected readonly idError = `${this.idInput}-error`;
  protected readonly arrastrando = signal(false);
  protected readonly error = signal('');
  protected readonly nombre = signal('');
  protected readonly camaraAbierta = signal(false);
  private readonly urlPrevia = signal<string | null>(null);
  protected readonly vistaPrevia = computed(() => this.urlPrevia());

  ngOnDestroy(): void {
    this.liberar();
  }

  /**
   * Procesa un archivo (público para pruebas). Las fotos pesadas se comprimen antes de validar
   * el tamaño, así una foto de 8 MB tomada con el celular no se rechaza.
   */
  async procesar(original: File | null | undefined): Promise<void> {
    const archivo = original ? await comprimirImagen(original) : original;
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
    const archivo = entrada.files?.[0];
    entrada.value = '';
    void this.procesar(archivo);
  }

  protected alSoltar(ev: DragEvent): void {
    ev.preventDefault();
    this.arrastrando.set(false);
    if (!this.deshabilitado()) void this.procesar(ev.dataTransfer?.files?.[0]);
  }

  protected alFotografiar(foto: File): void {
    this.camaraAbierta.set(false);
    void this.procesar(foto);
  }

  private liberar(): void {
    const url = this.urlPrevia();
    if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
    this.urlPrevia.set(null);
  }
}
