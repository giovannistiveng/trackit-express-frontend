import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  InjectionToken,
  OnDestroy,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { aJpeg, nombreFoto } from '../util/imagen';
import { IconoComponent } from './icono.component';

/** Acceso a la cámara detrás de un token para poder probar sin hardware. */
export interface Camaras {
  getUserMedia(c: MediaStreamConstraints): Promise<MediaStream>;
  enumerateDevices(): Promise<MediaDeviceInfo[]>;
}

export const CAMARAS = new InjectionToken<Camaras | null>('CAMARAS', {
  providedIn: 'root',
  factory: () =>
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
      ? navigator.mediaDevices
      : null,
});

export type EstadoCamara = 'iniciando' | 'lista' | 'previa' | 'error';

/** Mensaje para cada error de getUserMedia. */
export function mensajeErrorCamara(
  e: unknown,
  seguro = typeof isSecureContext === 'boolean' ? isSecureContext : true,
): string {
  const nombre = (e as { name?: string })?.name;
  if (!seguro) return 'La cámara solo funciona en una conexión segura (https o localhost).';
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError')
    return 'No diste permiso para usar la cámara. Actívalo en la configuración del navegador.';
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError')
    return 'No encontramos una cámara en este dispositivo.';
  if (nombre === 'NotReadableError')
    return 'Otra aplicación está usando la cámara. Ciérrala e inténtalo de nuevo.';
  return 'No se pudo abrir la cámara.';
}

/**
 * Cámara en pantalla completa: vista en vivo, guía para encuadrar, captura, vista previa y
 * "Repetir" / "Usar foto". Usa la cámara trasera por defecto y permite cambiarla.
 * Entrega un JPEG comprimido (lado mayor 1600 px). Si no hay cámara, ofrece elegir una foto.
 */
@Component({
  selector: 'ti-camara',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  host: {
    class: 'fixed inset-0 z-50 flex flex-col bg-black text-white',
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-label]': 'titulo()',
    '(document:keydown.escape)': 'cerrar.emit()',
  },
  template: `
    <div class="flex items-center justify-between gap-3 px-4 py-3">
      <p class="font-semibold">{{ titulo() }}</p>
      <button
        type="button"
        class="grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"
        (click)="cerrar.emit()"
        aria-label="Cerrar la cámara"
      >
        <ti-icono nombre="x" />
      </button>
    </div>

    <div class="relative flex-1 overflow-hidden">
      <video
        #video
        class="absolute inset-0 size-full object-cover"
        [class.invisible]="estado() === 'previa'"
        [class]="frontal() ? '-scale-x-100' : ''"
        autoplay
        playsinline
        muted
      ></video>
      @if (estado() === 'previa' && previa()) {
        <img
          [src]="previa()"
          alt="Vista previa de la foto"
          class="absolute inset-0 size-full object-contain"
        />
      }
      @if (estado() === 'lista') {
        <div
          class="pointer-events-none absolute inset-0 grid place-items-center p-6"
          aria-hidden="true"
        >
          <div
            class="rounded-2xl border-2 border-white/90 shadow-[0_0_0_100vmax_rgb(0_0_0/0.35)]"
            [class]="
              guia() === 'documento'
                ? 'aspect-[1.586] w-[88%] max-w-xl'
                : 'aspect-square w-[70%] max-w-md'
            "
          ></div>
        </div>
        <p class="absolute inset-x-0 bottom-4 text-center text-sm text-white/85">{{ ayuda() }}</p>
      }
      @if (estado() === 'iniciando') {
        <div class="absolute inset-0 grid place-items-center">
          <ti-icono nombre="loader" class="size-10 animate-spin" />
        </div>
      }
      @if (estado() === 'error') {
        <div class="absolute inset-0 grid place-items-center p-6 text-center">
          <div class="max-w-sm">
            <ti-icono nombre="camera" class="mx-auto size-12 text-white/60" />
            <p class="mt-4 font-semibold" role="alert">{{ error() }}</p>
            <label class="btn-acento mt-6 cursor-pointer">
              <ti-icono nombre="image" />
              Elegir una foto
              <input
                type="file"
                accept="image/*"
                capture="environment"
                class="sr-only"
                (change)="alElegir($event)"
              />
            </label>
          </div>
        </div>
      }
    </div>

    <div
      class="flex items-center justify-around gap-4 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
    >
      @if (estado() === 'previa') {
        <button
          type="button"
          class="btn min-w-32 border border-white/40 text-white hover:bg-white/10"
          (click)="repetir()"
        >
          <ti-icono nombre="rotate-ccw" /> Repetir
        </button>
        <button type="button" class="btn-acento min-w-32" (click)="usar()">
          <ti-icono nombre="check" /> Usar foto
        </button>
      } @else {
        <span class="size-12"></span>
        <button
          type="button"
          class="disparador grid size-[4.5rem] place-items-center rounded-full border-4 border-white bg-white/20 transition active:scale-90 disabled:opacity-40"
          [disabled]="estado() !== 'lista'"
          (click)="capturar()"
          aria-label="Tomar foto"
        >
          <span class="size-14 rounded-full bg-white"></span>
        </button>
        @if (variasCamaras()) {
          <button
            type="button"
            class="grid size-12 place-items-center rounded-full bg-white/10 hover:bg-white/20"
            (click)="cambiarCamara()"
            aria-label="Cambiar de cámara"
          >
            <ti-icono nombre="switch-camera" />
          </button>
        } @else {
          <span class="size-12"></span>
        }
      }
    </div>
    <canvas class="hidden"></canvas>
  `,
})
export class CamaraComponent implements AfterViewInit, OnDestroy {
  readonly titulo = input('Tomar foto');
  readonly guia = input<'documento' | 'entrega'>('documento');
  readonly prefijo = input('foto');
  readonly foto = output<File>();
  readonly cerrar = output<void>();

  private readonly camaras = inject(CAMARAS);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  protected readonly estado = signal<EstadoCamara>('iniciando');
  protected readonly error = signal('');
  protected readonly previa = signal<string | null>(null);
  protected readonly frontal = signal(false);
  protected readonly variasCamaras = signal(false);
  protected readonly ayuda = computed(() =>
    this.guia() === 'documento'
      ? 'Encuadra el documento completo dentro del recuadro, con buena luz.'
      : 'Toma el paquete entregado y, si puedes, la puerta o la fachada.',
  );
  private stream: MediaStream | null = null;
  private archivo: File | null = null;

  async ngAfterViewInit(): Promise<void> {
    await this.abrir();
    if (this.camaras && this.estado() === 'lista') {
      try {
        const dispositivos = await this.camaras.enumerateDevices();
        this.variasCamaras.set(dispositivos.filter((d) => d.kind === 'videoinput').length > 1);
      } catch {
        /* sin lista de dispositivos */
      }
    }
  }

  ngOnDestroy(): void {
    this.apagar();
    this.liberarPrevia();
  }

  async abrir(): Promise<void> {
    this.apagar();
    if (!this.camaras) {
      this.mostrarError(mensajeErrorCamara({ name: 'NotFoundError' }));
      return;
    }
    this.estado.set('iniciando');
    try {
      this.stream = await this.camaras.getUserMedia({
        video: {
          facingMode: { ideal: this.frontal() ? 'user' : 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      const v = this.video().nativeElement;
      v.srcObject = this.stream;
      try {
        await v.play?.();
      } catch {
        // Algunos navegadores (y jsdom) rechazan play() sin gesto; el video sigue mostrando la imagen.
      }
      this.estado.set('lista');
    } catch (e) {
      this.mostrarError(mensajeErrorCamara(e));
    }
  }

  async capturar(): Promise<void> {
    const v = this.video().nativeElement;
    const ancho = v.videoWidth || 1280;
    const alto = v.videoHeight || 720;
    try {
      this.archivo = await aJpeg(v, ancho, alto, nombreFoto(this.prefijo()));
      this.liberarPrevia();
      this.previa.set(URL.createObjectURL(this.archivo));
      this.estado.set('previa');
    } catch {
      this.mostrarError('No se pudo tomar la foto. Inténtalo de nuevo.');
    }
  }

  repetir(): void {
    this.liberarPrevia();
    this.archivo = null;
    this.estado.set(this.stream ? 'lista' : 'iniciando');
    if (!this.stream) void this.abrir();
  }

  usar(): void {
    if (!this.archivo) return;
    this.foto.emit(this.archivo);
    this.apagar();
  }

  async cambiarCamara(): Promise<void> {
    this.frontal.update((f) => !f);
    await this.abrir();
  }

  protected alElegir(ev: Event): void {
    const archivo = (ev.target as HTMLInputElement).files?.[0];
    if (archivo) this.foto.emit(archivo);
  }

  private mostrarError(texto: string): void {
    this.apagar();
    this.error.set(texto);
    this.estado.set('error');
  }

  private apagar(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private liberarPrevia(): void {
    const url = this.previa();
    if (url) URL.revokeObjectURL(url);
    this.previa.set(null);
  }
}
