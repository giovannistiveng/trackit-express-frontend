import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DocumentoConductor, EstadoRequisito, Requisito } from '../../../core/domain';
import { ErrorMessageMapper } from '../../../core/http/error-message.mapper';
import { DocumentsPort, LoggerPort } from '../../../core/ports';
import { CargaArchivoComponent } from '../../../shared/ui/carga-archivo.component';
import { IconoComponent, NombreIcono } from '../../../shared/ui/icono.component';
import { Subscription } from 'rxjs';

/** Estado local de la carga (mientras sube o si falló). */
export type EstadoCargaDocumento = 'reposo' | 'subiendo' | 'error';

const PRESENTACION: Record<EstadoRequisito, { texto: string; clase: string; icono: NombreIcono }> =
  {
    falta: { texto: 'Falta', clase: 'bg-niebla text-piedra', icono: 'upload' },
    pendiente: {
      texto: 'En revisión',
      clase: 'bg-aviso-suave text-placa-oscuro',
      icono: 'hourglass',
    },
    aprobado: { texto: 'Aprobado', clase: 'bg-exito-suave text-exito', icono: 'circle-check' },
    rechazado: { texto: 'Corregir', clase: 'bg-alerta-suave text-alerta', icono: 'circle-x' },
    vencido: { texto: 'Vencido', clase: 'bg-alerta-suave text-alerta', icono: 'triangle-alert' },
  };

/** Fecha de hoy (AAAA-MM-DD) en hora local, mínimo del campo de vencimiento. */
export function hoyIso(ahora = new Date()): string {
  const d = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 10);
}

/** CU-004: un requisito de verificación con su estado, motivo, vencimiento y carga del archivo. */
@Component({
  selector: 'ti-documento-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, CargaArchivoComponent, IconoComponent],
  template: `
    <article class="tarjeta p-4" [attr.aria-labelledby]="'doc-' + prefijo()">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 [id]="'doc-' + prefijo()" class="leading-tight">
            {{ requisito().nombre }}
            @if (!requisito().obligatorio) {
              <span class="text-sm font-normal text-piedra">(si aplica)</span>
            }
          </h3>
          <p class="mt-1 text-sm text-piedra">{{ requisito().ayuda }}</p>
        </div>
        <span class="insignia shrink-0" [class]="presentacion().clase">
          <ti-icono [nombre]="presentacion().icono" class="size-3.5" /> {{ presentacion().texto }}
        </span>
      </div>

      @if (requisito().documento; as d) {
        @if (requisito().estado === 'rechazado' && d.motivoRechazo) {
          <p class="mt-3 rounded-lg bg-alerta-suave px-3 py-2 text-sm text-alerta">
            <strong>Motivo:</strong> {{ d.motivoRechazo }}
          </p>
        }
        @if (d.fechaVencimiento) {
          <p class="mt-3 text-sm" [class.text-alerta]="(d.diasParaVencer ?? 99) <= 15">
            {{ textoVencimiento(d) }}
          </p>
        }
      }

      @if (abierto()) {
        <div class="mt-4 space-y-3">
          @if (requisito().vence) {
            <div>
              <label [for]="'vence-' + prefijo()" class="etiqueta">Fecha de vencimiento</label>
              <input
                [id]="'vence-' + prefijo()"
                type="date"
                class="campo max-w-52"
                [min]="hoy"
                [ngModel]="vencimiento()"
                (ngModelChange)="vencimiento.set($event)"
                [disabled]="estado() === 'subiendo'"
              />
              <p class="ayuda">Tal como aparece en el documento.</p>
            </div>
          }
          <ti-carga-archivo
            [tipos]="['image/jpeg', 'image/png', 'image/webp', 'application/pdf']"
            [conCamara]="true"
            [tituloCamara]="requisito().nombre"
            [guiaCamara]="requisito().tipo === 'Selfie' ? 'selfie' : 'documento'"
            [prefijoFoto]="prefijo()"
            [deshabilitado]="estado() === 'subiendo' || bloqueado()"
            [textoAccion]="
              requisito().documento ? 'Subir de nuevo' : 'Toma la foto o elige el archivo'
            "
            (archivo)="subir($event)"
          />
          @if (bloqueado()) {
            <p class="text-sm text-piedra">Primero indica la fecha de vencimiento.</p>
          }
        </div>
      } @else {
        <button type="button" class="btn-texto mt-2 text-sm" (click)="reemplazar.set(true)">
          <ti-icono nombre="upload" class="size-4" /> Reemplazar
        </button>
      }

      @if (estado() === 'subiendo') {
        <div
          class="mt-3"
          role="progressbar"
          [attr.aria-valuenow]="progreso()"
          aria-valuemin="0"
          aria-valuemax="100"
          [attr.aria-label]="'Subiendo ' + requisito().nombre"
        >
          <div class="h-2 overflow-hidden rounded-full bg-niebla">
            <div class="h-full bg-marca transition-[width]" [style.width.%]="progreso()"></div>
          </div>
          <p class="numeros mt-1 text-sm text-piedra">{{ progreso() }} %</p>
        </div>
      }
      @if (error()) {
        <p class="error-campo mt-3" role="alert">{{ error() }}</p>
      }
    </article>
  `,
})
export class DocumentoCardComponent {
  readonly requisito = input.required<Requisito>();
  readonly subido = output<DocumentoConductor>();

  private readonly docs = inject(DocumentsPort);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly log = inject(LoggerPort);
  private readonly carga = viewChild(CargaArchivoComponent);
  private sub: Subscription | null = null;

  protected readonly hoy = hoyIso();
  readonly estado = signal<EstadoCargaDocumento>('reposo');
  readonly progreso = signal(0);
  readonly error = signal('');
  readonly vencimiento = signal('');
  /** Con un documento aprobado o en revisión, la carga se oculta hasta pedir reemplazarlo. */
  protected readonly reemplazar = signal(false);

  /** "Cédula" → "cedula" para ids y el nombre del archivo de la foto. */
  protected readonly prefijo = computed(() =>
    this.requisito().tipo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-'),
  );
  protected readonly presentacion = computed(() =>
    this.estado() === 'subiendo'
      ? { texto: 'Subiendo', clase: 'bg-marca-suave text-marca', icono: 'loader' as NombreIcono }
      : PRESENTACION[this.requisito().estado],
  );
  protected readonly abierto = computed(
    () => this.reemplazar() || ['falta', 'rechazado', 'vencido'].includes(this.requisito().estado),
  );
  protected readonly bloqueado = computed(() => this.requisito().vence && !this.vencimiento());

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected textoVencimiento(d: DocumentoConductor): string {
    const dias = d.diasParaVencer;
    const fecha = new Date(`${d.fechaVencimiento}T12:00:00`).toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    if (dias === null || dias === undefined) return `Vence el ${fecha}`;
    if (dias < 0) return `Venció el ${fecha}`;
    if (dias === 0) return `Vence hoy (${fecha})`;
    if (dias > 15) return `Vence el ${fecha}`;
    const unidad = dias === 1 ? 'día' : 'días';
    return `Vence en ${dias} ${unidad} (${fecha})`;
  }

  subir(archivo: File): void {
    if (this.bloqueado()) return;
    this.sub?.unsubscribe();
    this.estado.set('subiendo');
    this.progreso.set(0);
    this.error.set('');
    const tipo = this.requisito().tipo;
    this.sub = this.docs
      .subir(archivo, tipo, this.requisito().vence ? this.vencimiento() : undefined)
      .subscribe({
        next: (ev) => {
          if (ev.tipo === 'progreso') this.progreso.set(ev.porcentaje);
          else {
            this.estado.set('reposo');
            this.reemplazar.set(false);
            this.progreso.set(100);
            this.log.info('Documentos', `Documento ${tipo} cargado`);
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
