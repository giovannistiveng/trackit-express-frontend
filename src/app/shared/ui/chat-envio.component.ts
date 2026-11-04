import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
  Injector,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MensajeChat } from '../../core/domain';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { ChatPort, EventosPort } from '../../core/ports';
import { IconoComponent } from './icono.component';

export const LARGO_MAXIMO_MENSAJE = 500;
/** Sin canal en vivo, se revisa el chat con esta frecuencia. */
export const INTERVALO_CHAT_MS = 10_000;

const RAPIDAS: Record<'cliente' | 'conductor', string[]> = {
  cliente: ['¿Cuánto te falta?', 'Ya voy a salir', 'Estoy en la portería', 'Gracias 🙌'],
  conductor: ['Ya llegué', 'Voy en camino', 'Estoy afuera', '¿Me confirmas la dirección?'],
};

/** Chat del envío entre el cliente y el conductor. Recibe mensajes al instante por SSE. */
@Component({
  selector: 'ti-chat-envio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IconoComponent],
  template: `
    <section class="tarjeta flex flex-col p-0" aria-labelledby="titulo-chat">
      <header class="flex items-center gap-2 border-b border-linea px-4 py-3">
        <ti-icono nombre="message-circle" class="text-marca" />
        <h2 id="titulo-chat" class="text-base">Chat con {{ otro() }}</h2>
        @if (!abierto() && cargado()) {
          <span class="ml-auto text-xs text-piedra">Cerrado</span>
        }
      </header>
      <div
        #lista
        class="flex max-h-80 min-h-40 flex-col gap-2 overflow-y-auto px-4 py-3"
        role="log"
        aria-live="polite"
        aria-label="Mensajes"
      >
        @for (m of mensajes(); track m.id) {
          <div class="flex flex-col" [class]="m.mio ? 'items-end' : 'items-start'">
            <p
              class="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm"
              [class]="m.mio ? 'rounded-br-sm bg-marca text-white' : 'rounded-bl-sm bg-crema'"
            >
              {{ m.texto }}
            </p>
            <span class="mt-0.5 flex items-center gap-1 text-[11px] text-piedra">
              {{ hora(m.fecha) }}
              @if (m.mio) {
                <ti-icono
                  [nombre]="m.leido ? 'check-check' : 'check'"
                  class="size-3.5"
                  [class]="m.leido ? 'text-marca' : ''"
                  [etiqueta]="m.leido ? 'Leído' : 'Enviado'"
                />
              }
            </span>
          </div>
        } @empty {
          <p class="m-auto text-center text-sm text-piedra">
            {{ cargado() ? 'Aún no hay mensajes.' : 'Cargando…' }}
          </p>
        }
      </div>
      @if (abierto()) {
        <div class="border-t border-linea p-3">
          <div class="mb-2 flex gap-2 overflow-x-auto pb-1">
            @for (r of rapidas(); track r) {
              <button
                type="button"
                class="shrink-0 rounded-full border border-linea px-3 py-1 text-xs font-semibold hover:border-marca"
                [disabled]="enviando()"
                (click)="enviar(r)"
              >
                {{ r }}
              </button>
            }
          </div>
          <form class="flex gap-2" (ngSubmit)="enviar()">
            <label [for]="'chat-' + idEnvio()" class="sr-only">Escribe un mensaje</label>
            <input
              [id]="'chat-' + idEnvio()"
              class="campo"
              name="texto"
              autocomplete="off"
              [maxlength]="maximo"
              placeholder="Escribe un mensaje"
              [ngModel]="texto()"
              (ngModelChange)="texto.set($event)"
            />
            <button
              type="submit"
              class="btn-primario shrink-0 px-4"
              [disabled]="enviando() || !texto().trim()"
              aria-label="Enviar"
            >
              <ti-icono
                [nombre]="enviando() ? 'loader' : 'send'"
                [class]="enviando() ? 'animate-spin' : ''"
              />
            </button>
          </form>
          @if (error()) {
            <p class="error-campo" role="alert">{{ error() }}</p>
          }
        </div>
      } @else if (cargado()) {
        <p class="border-t border-linea px-4 py-3 text-xs text-piedra">
          El chat está abierto mientras el servicio está asignado o en ruta.
        </p>
      }
    </section>
  `,
})
export class ChatEnvioComponent implements OnInit {
  readonly idEnvio = input.required<number>();
  readonly rol = input<'cliente' | 'conductor'>('cliente');
  readonly otro = input('el conductor');

  private readonly chat = inject(ChatPort);
  private readonly eventos = inject(EventosPort);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly injector = inject(Injector);
  private readonly lista = viewChild<ElementRef<HTMLElement>>('lista');

  protected readonly maximo = LARGO_MAXIMO_MENSAJE;
  protected readonly mensajes = signal<MensajeChat[]>([]);
  protected readonly abierto = signal(false);
  protected readonly cargado = signal(false);
  protected readonly texto = signal('');
  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  protected readonly rapidas = computed(() => RAPIDAS[this.rol()]);
  private temporizador: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const sub = this.eventos.mensajes().subscribe((d) => {
      if (d.idEnvio !== this.idEnvio()) return;
      this.agregar(d.mensaje);
      // Marcar como leído en el servidor
      void this.cargar();
    });
    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      if (this.temporizador) clearInterval(this.temporizador);
    });
  }

  ngOnInit(): void {
    void this.cargar();
    this.temporizador = setInterval(() => {
      if (!this.eventos.conectado()) void this.cargar();
    }, INTERVALO_CHAT_MS);
  }

  protected hora(f: Date): string {
    return f.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  }

  async cargar(): Promise<void> {
    try {
      const r = await this.chat.mensajes(this.idEnvio());
      // Se conservan los que llegaron por el canal mientras la consulta estaba en camino
      const ids = new Set(r.mensajes.map((m) => m.id));
      const lista = [...r.mensajes, ...this.mensajes().filter((m) => !ids.has(m.id))].sort(
        (a, b) => a.fecha.getTime() - b.fecha.getTime(),
      );
      const nuevos = lista.length !== this.mensajes().length;
      this.mensajes.set(lista);
      this.abierto.set(r.abierto);
      if (nuevos) this.bajar();
    } catch {
      // Se reintenta en el siguiente ciclo
    } finally {
      this.cargado.set(true);
    }
  }

  async enviar(texto = this.texto()): Promise<void> {
    const t = texto.trim();
    if (!t || this.enviando()) return;
    this.enviando.set(true);
    this.error.set('');
    try {
      const m = await this.chat.enviar(this.idEnvio(), t.slice(0, LARGO_MAXIMO_MENSAJE));
      this.agregar(m);
      if (texto === this.texto()) this.texto.set('');
    } catch (e) {
      this.error.set(this.mapper.traducir(e));
    } finally {
      this.enviando.set(false);
    }
  }

  private agregar(m: MensajeChat): void {
    if (this.mensajes().some((x) => x.id === m.id)) return;
    this.mensajes.update((l) => [...l, m]);
    this.bajar();
  }

  private bajar(): void {
    afterNextRender(
      () => {
        const el = this.lista()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      },
      { injector: this.injector },
    );
  }
}
