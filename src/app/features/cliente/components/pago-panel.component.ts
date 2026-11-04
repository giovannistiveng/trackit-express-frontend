import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PagoResumen } from '../../../core/domain';
import { ErrorMessageMapper } from '../../../core/http/error-message.mapper';
import { EventosPort, PaymentsPort } from '../../../core/ports';
import { CopPipe } from '../../../shared/pipes/cop.pipe';
import { IconoComponent } from '../../../shared/ui/icono.component';

/** Cada cuánto se consulta un cobro Nequi pendiente (el backend pregunta a Nequi). */
export const INTERVALO_PAGO_MS = 4_000;
/** Minutos que Nequi deja abierto el cobro en el celular del cliente. */
export const VIGENCIA_COBRO_MIN = 10;

export function celularValido(t: string): boolean {
  return /^3\d{9}$/.test(t.replace(/[\s-]/g, '').replace(/^\+?57/, ''));
}

/**
 * Estado del pago de un envío. Con Nequi muestra el cobro pendiente (y lo vigila hasta que el
 * cliente lo acepte), permite reintentar o cambiar a efectivo; con efectivo recuerda el monto.
 */
@Component({
  selector: 'ti-pago-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, CopPipe, IconoComponent],
  template: `
    @if (pago(); as p) {
      <section class="tarjeta p-5" aria-labelledby="titulo-pago" aria-live="polite">
        <h2 id="titulo-pago" class="flex items-center gap-2 text-base">
          <ti-icono
            [nombre]="p.metodo === 'nequi' ? 'smartphone' : 'banknote'"
            class="text-marca"
          />
          {{ p.metodo === 'nequi' ? 'Pago con Nequi' : 'Pago en efectivo' }}
          <span class="numeros ml-auto font-extrabold">{{ p.monto | cop }}</span>
        </h2>
        @switch (p.estado) {
          @case ('pendiente') {
            <div class="mt-3 rounded-xl bg-aviso-suave p-4 text-sm">
              <p class="flex items-center gap-2 font-semibold">
                <ti-icono nombre="loader" class="size-4 animate-spin" /> Esperando que aceptes el
                cobro
              </p>
              <ol class="mt-2 list-decimal space-y-1 pl-5">
                <li>Abre la app Nequi en el celular {{ p.telefono }}.</li>
                <li>Toca la notificación de cobro de <strong>TrackIt Express</strong>.</li>
                <li>Revisa el valor y acepta con tu clave.</li>
              </ol>
              @if (restante(); as r) {
                <p class="mt-2 text-xs text-piedra">El cobro vence en {{ r }}.</p>
              }
            </div>
            <p class="mt-2 text-xs text-piedra">
              Cuando lo aceptes, publicamos tu envío para los conductores.
            </p>
            @if (editable()) {
              <button
                type="button"
                class="btn-texto mt-2 text-sm"
                [disabled]="ocupado()"
                (click)="efectivo()"
              >
                Prefiero pagar en efectivo
              </button>
            }
          }
          @case ('aprobado') {
            <p
              class="mt-3 flex items-center gap-2 rounded-xl bg-exito-suave px-4 py-3 text-sm font-semibold text-exito"
            >
              <ti-icono nombre="circle-check" class="size-4" /> Pagado desde Nequi {{ p.telefono }}
            </p>
          }
          @case ('por_cobrar') {
            <p class="mt-3 text-sm text-piedra">
              Paga <strong class="text-tinta">{{ p.monto | cop }}</strong> en efectivo al conductor
              cuando reciba el paquete. Ten el valor exacto si puedes.
            </p>
          }
          @case ('cobrado') {
            <p
              class="mt-3 flex items-center gap-2 rounded-xl bg-exito-suave px-4 py-3 text-sm font-semibold text-exito"
            >
              <ti-icono nombre="circle-check" class="size-4" /> Pagado en efectivo al conductor
            </p>
          }
          @case ('anulado') {
            <p class="mt-3 text-sm text-piedra">
              El cobro se anuló porque el envío se canceló. No se cobró nada.
            </p>
          }
          @case ('reembolso_pendiente') {
            <p class="mt-3 rounded-xl bg-aviso-suave px-4 py-3 text-sm">
              Estamos devolviendo tu dinero a Nequi {{ p.telefono }}. Te avisaremos cuando quede
              listo.
            </p>
          }
          @case ('reembolsado') {
            <p
              class="mt-3 flex items-center gap-2 rounded-xl bg-exito-suave px-4 py-3 text-sm font-semibold text-exito"
            >
              <ti-icono nombre="rotate-ccw" class="size-4" /> Te devolvimos {{ p.monto | cop }} a
              Nequi {{ p.telefono }}
            </p>
          }
          @default {
            <!-- rechazado o expirado -->
            <div class="mt-3 rounded-xl bg-alerta-suave p-4 text-sm text-alerta" role="alert">
              <p class="font-semibold">
                {{
                  p.estado === 'expirado'
                    ? 'El cobro venció sin respuesta'
                    : 'El pago no se completó'
                }}
              </p>
              @if (p.mensaje) {
                <p class="mt-1">{{ p.mensaje }}</p>
              }
            </div>
            @if (editable()) {
              <p class="mt-3 text-sm text-piedra">
                Tu envío no se publica hasta que elijas cómo pagar.
              </p>
              <label for="tel-reintento" class="etiqueta mt-3">Celular Nequi</label>
              <input
                id="tel-reintento"
                class="campo"
                inputmode="numeric"
                autocomplete="tel-national"
                maxlength="13"
                [placeholder]="p.telefono ?? '300 123 4567'"
                [ngModel]="telefono()"
                (ngModelChange)="telefono.set($event)"
                [attr.aria-invalid]="telefonoInvalido()"
              />
              <p class="ayuda">Déjalo vacío para usar el mismo número.</p>
              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="btn-primario"
                  [disabled]="ocupado() || telefonoInvalido()"
                  (click)="reintentar()"
                >
                  <ti-icono nombre="refresh" /> Reintentar con Nequi
                </button>
                <button
                  type="button"
                  class="btn-secundario"
                  [disabled]="ocupado()"
                  (click)="efectivo()"
                >
                  <ti-icono nombre="banknote" /> Pagar en efectivo
                </button>
              </div>
            }
          }
        }
        @if (error()) {
          <p class="error-campo mt-2" role="alert">{{ error() }}</p>
        }
      </section>
    }
  `,
})
export class PagoPanelComponent implements OnDestroy {
  readonly idEnvio = input.required<number>();
  readonly pagoInicial = input<PagoResumen | null | undefined>(null);
  /** Solo se puede cambiar el pago mientras el envío está Pendiente. */
  readonly editable = input(true);
  readonly cambio = output<PagoResumen>();

  private readonly pagos = inject(PaymentsPort);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly eventos = inject(EventosPort);

  protected readonly pago = linkedSignal(() => this.pagoInicial() ?? null);
  protected readonly telefono = signal('');
  protected readonly ocupado = signal(false);
  protected readonly error = signal('');
  private readonly ahora = signal(Date.now());
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private reloj: ReturnType<typeof setInterval> | null = null;

  protected readonly telefonoInvalido = computed(() => {
    const t = this.telefono().trim();
    return t !== '' && !celularValido(t);
  });
  protected readonly restante = computed(() => {
    const p = this.pago();
    if (!p?.actualizado || p.estado !== 'pendiente') return null;
    const ms = p.actualizado.getTime() + VIGENCIA_COBRO_MIN * 60_000 - this.ahora();
    if (ms <= 0) return null;
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });

  constructor() {
    // Mientras el cobro esté pendiente se consulta; al cambiar de estado se avisa al padre
    effect(() => {
      const p = this.pago();
      untracked(() => this.programar(p?.estado === 'pendiente'));
    });
    const sub = this.eventos.notificaciones().subscribe((n) => {
      if (n.idEnvio === this.idEnvio() && n.tipo.startsWith('pago')) void this.consultar();
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  ngOnDestroy(): void {
    this.programar(false);
  }

  private programar(activo: boolean): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    if (activo) {
      this.temporizador = setTimeout(() => void this.consultar(), INTERVALO_PAGO_MS);
      this.reloj ??= setInterval(() => this.ahora.set(Date.now()), 1000);
    } else if (this.reloj) {
      clearInterval(this.reloj);
      this.reloj = null;
    }
  }

  async consultar(): Promise<void> {
    try {
      this.aplicar(await this.pagos.estado(this.idEnvio()));
    } catch {
      // Se reintenta en el siguiente ciclo
      this.programar(this.pago()?.estado === 'pendiente');
    }
  }

  async reintentar(): Promise<void> {
    await this.accion(() =>
      this.pagos.reintentar(this.idEnvio(), this.telefono().trim() || undefined),
    );
    this.telefono.set('');
  }

  async efectivo(): Promise<void> {
    await this.accion(() => this.pagos.pagarEnEfectivo(this.idEnvio()));
  }

  private async accion(fn: () => Promise<PagoResumen>): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      this.aplicar(await fn());
    } catch (e) {
      this.error.set(this.mapper.traducir(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  private aplicar(p: PagoResumen): void {
    const antes = this.pago();
    this.pago.set(p);
    if (!antes || antes.estado !== p.estado || antes.metodo !== p.metodo) this.cambio.emit(p);
  }
}
