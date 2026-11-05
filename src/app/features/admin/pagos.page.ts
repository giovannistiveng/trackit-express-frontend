import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EstadoPago, Liquidacion, MetodoPago, PagoAdmin, Pagina } from '../../core/domain';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { AdminOperationsPort, LoggerPort } from '../../core/ports';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { FechaLocalPipe } from '../../shared/pipes/fecha-local.pipe';
import { EstadoCargaComponent, FaseCarga, faseDe } from '../../shared/ui/estado-carga.component';
import { IconoComponent } from '../../shared/ui/icono.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { ToastService } from '../../shared/ui/toast.service';

export const TEXTO_ESTADO_PAGO: Record<EstadoPago, string> = {
  pendiente: 'Esperando al cliente',
  aprobado: 'Pagado',
  rechazado: 'Rechazado',
  expirado: 'Vencido',
  por_cobrar: 'Por cobrar',
  cobrado: 'Cobrado',
  anulado: 'Anulado',
  reembolso_pendiente: 'Reembolso pendiente',
  reembolsado: 'Reembolsado',
};

function textoGeneradas(n: number): string {
  if (n === 0) return 'La semana ya estaba liquidada o no tuvo servicios.';
  return n === 1 ? '1 liquidación generada' : `${n} liquidaciones generadas`;
}

const CLASE_ESTADO: Partial<Record<EstadoPago, string>> = {
  aprobado: 'bg-exito-suave text-exito',
  cobrado: 'bg-exito-suave text-exito',
  reembolsado: 'bg-exito-suave text-exito',
  pendiente: 'bg-aviso-suave',
  por_cobrar: 'bg-aviso-suave',
  reembolso_pendiente: 'bg-alerta-suave text-alerta',
  rechazado: 'bg-alerta-suave text-alerta',
};

/** Administración: liquidaciones semanales a conductores y pagos de los envíos (Nequi y efectivo). */
@Component({
  selector: 'ti-pagos-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    CopPipe,
    FechaLocalPipe,
    EstadoCargaComponent,
    IconoComponent,
    ModalComponent,
  ],
  template: `
    <div class="contenedor-ancho max-w-6xl">
      <h1>Pagos</h1>
      <p class="mt-1 text-piedra">Liquidación semanal a los conductores y estado de cada cobro.</p>

      <div class="mt-6 flex gap-2 border-b border-linea" role="tablist">
        @for (t of pestanas; track t.id) {
          <button
            type="button"
            role="tab"
            class="-mb-px border-b-2 px-4 py-2 font-semibold"
            [class]="
              pestana() === t.id ? 'border-marca text-marca' : 'border-transparent text-piedra'
            "
            [attr.aria-selected]="pestana() === t.id"
            (click)="cambiar(t.id)"
          >
            {{ t.texto }}
          </button>
        }
      </div>

      @if (pestana() === 'liquidaciones') {
        <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
          <label class="flex items-center gap-2 text-sm font-semibold">
            Estado
            <select
              class="campo !w-auto"
              [ngModel]="filtroLiq()"
              (ngModelChange)="filtroLiq.set($event); cargarLiquidaciones()"
            >
              <option value="">Todas</option>
              <option value="pendiente">Pendientes</option>
              <option value="pagada">Pagadas</option>
            </select>
          </label>
          <button type="button" class="btn-primario" [disabled]="generando()" (click)="generar()">
            <ti-icono
              [nombre]="generando() ? 'loader' : 'calculator'"
              [class]="generando() ? 'animate-spin' : ''"
            />
            Liquidar la semana pasada
          </button>
        </div>
        <p class="ayuda">Se generan solas cada lunes; este botón solo adelanta el cálculo.</p>
        <ti-estado-carga
          class="mt-4 block"
          [fase]="faseLiq()"
          [textoError]="error()"
          textoVacio="No hay liquidaciones para mostrar."
          (reintentar)="cargarLiquidaciones()"
        >
          <div class="overflow-x-auto">
            <table class="w-full min-w-[44rem] text-left text-sm">
              <thead class="text-xs uppercase text-piedra">
                <tr>
                  <th class="py-2 pr-3">Conductor</th>
                  <th class="py-2 pr-3">Semana</th>
                  <th class="py-2 pr-3 text-right">Servicios</th>
                  <th class="py-2 pr-3 text-right">Ganancia (80 %)</th>
                  <th class="py-2 pr-3 text-right">Efectivo cobrado</th>
                  <th class="py-2 pr-3 text-right">Comisión efectivo</th>
                  <th class="py-2 pr-3 text-right">Saldo</th>
                  <th class="py-2"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-linea">
                @for (l of liquidaciones()?.items ?? []; track l.id) {
                  <tr>
                    <td class="py-3 pr-3 font-semibold">{{ l.conductor ?? '—' }}</td>
                    <td class="whitespace-nowrap py-3 pr-3">{{ semana(l.desde, l.hasta) }}</td>
                    <td class="numeros py-3 pr-3 text-right">{{ l.servicios }}</td>
                    <td class="numeros py-3 pr-3 text-right">{{ l.gananciaConductor | cop }}</td>
                    <td class="numeros py-3 pr-3 text-right">{{ l.cobradoEfectivo | cop }}</td>
                    <td class="numeros py-3 pr-3 text-right">{{ l.comisionEfectivo | cop }}</td>
                    <td
                      class="numeros py-3 pr-3 text-right font-bold"
                      [class]="l.saldo >= 0 ? 'text-exito' : 'text-alerta'"
                    >
                      {{ l.saldo < 0 ? '−' : '' }}{{ abs(l.saldo) | cop }}
                      <span class="block text-xs font-normal text-piedra">{{
                        l.saldo >= 0 ? 'pagar al conductor' : 'cobrar al conductor'
                      }}</span>
                    </td>
                    <td class="py-3 text-right">
                      @if (l.estado === 'pendiente') {
                        <button
                          type="button"
                          class="btn-secundario min-h-9 px-3 text-sm"
                          (click)="abrirPago(l)"
                        >
                          <ti-icono nombre="check" class="size-4" />
                          {{ l.saldo >= 0 ? 'Marcar pagada' : 'Marcar saldada' }}
                        </button>
                      } @else {
                        <span
                          class="insignia bg-exito-suave text-exito"
                          [title]="l.referencia ?? ''"
                        >
                          Pagada {{ l.pagadaEn ? (l.pagadaEn | fechaLocal) : '' }}
                        </span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </ti-estado-carga>
      } @else {
        <div class="mt-5 flex flex-wrap gap-3">
          <label class="flex items-center gap-2 text-sm font-semibold">
            Método
            <select
              class="campo !w-auto"
              [ngModel]="filtroMetodo()"
              (ngModelChange)="filtroMetodo.set($event); cargarPagos()"
            >
              <option value="">Todos</option>
              <option value="nequi">Nequi</option>
              <option value="efectivo">Efectivo</option>
            </select>
          </label>
          <label class="flex items-center gap-2 text-sm font-semibold">
            Estado
            <select
              class="campo !w-auto"
              [ngModel]="filtroEstado()"
              (ngModelChange)="filtroEstado.set($event); cargarPagos()"
            >
              <option value="">Todos</option>
              @for (e of estados; track e) {
                <option [value]="e">{{ textoEstado[e] }}</option>
              }
            </select>
          </label>
        </div>
        <ti-estado-carga
          class="mt-4 block"
          [fase]="fasePagos()"
          [textoError]="error()"
          textoVacio="No hay pagos con esos filtros."
          (reintentar)="cargarPagos()"
        >
          <ul class="space-y-2">
            @for (p of pagos()?.items ?? []; track p.idEnvio) {
              <li class="tarjeta flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div class="min-w-0">
                  <p class="font-semibold">Envío #{{ p.idEnvio }} · {{ p.cliente }}</p>
                  <p class="truncate text-piedra">{{ p.origen }} → {{ p.destino }}</p>
                  @if (p.mensaje) {
                    <p class="text-xs text-piedra">{{ p.mensaje }}</p>
                  }
                </div>
                <div class="flex items-center gap-3">
                  <span class="flex items-center gap-1 text-piedra">
                    <ti-icono
                      [nombre]="p.metodo === 'nequi' ? 'smartphone' : 'banknote'"
                      class="size-4"
                    />
                    {{ p.metodo === 'nequi' ? 'Nequi' : 'Efectivo' }} {{ p.telefono ?? '' }}
                  </span>
                  <strong class="numeros">{{ p.monto | cop }}</strong>
                  <span class="insignia" [class]="claseEstado(p.estado)">{{
                    textoEstado[p.estado]
                  }}</span>
                  @if (p.estado === 'reembolso_pendiente') {
                    <button
                      type="button"
                      class="btn-secundario min-h-9 px-3"
                      [disabled]="reembolsando() === p.idEnvio"
                      (click)="reembolsar(p)"
                    >
                      <ti-icono nombre="rotate-ccw" class="size-4" /> Reintentar reembolso
                    </button>
                  }
                </div>
              </li>
            }
          </ul>
        </ti-estado-carga>
      }
    </div>

    @if (pagando(); as l) {
      <ti-modal
        [titulo]="l.saldo >= 0 ? 'Registrar pago al conductor' : 'Registrar cobro al conductor'"
        (cerrar)="pagando.set(null)"
      >
        <p>
          {{ l.conductor }} · semana del {{ semana(l.desde, l.hasta) }}:
          <strong>{{ abs(l.saldo) | cop }}</strong>
          {{ l.saldo >= 0 ? 'a transferir.' : 'de comisión por cobrar.' }}
        </p>
        <label for="referencia" class="etiqueta mt-5">Referencia de la transferencia</label>
        <input
          id="referencia"
          class="campo"
          maxlength="100"
          placeholder="Ej.: Nequi M1234567"
          [ngModel]="referencia()"
          (ngModelChange)="referencia.set($event)"
        />
        <p class="ayuda">Queda en el historial del conductor y en la auditoría.</p>
        <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" class="btn-secundario" (click)="pagando.set(null)">Cancelar</button>
          <button
            type="button"
            class="btn-primario"
            [disabled]="referencia().trim().length < 3 || guardando()"
            (click)="confirmarPago(l)"
          >
            <ti-icono
              [nombre]="guardando() ? 'loader' : 'check'"
              [class]="guardando() ? 'animate-spin' : ''"
            />
            Confirmar
          </button>
        </div>
      </ti-modal>
    }
  `,
})
export class PagosAdminPage implements OnInit {
  private readonly ops = inject(AdminOperationsPort);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerPort);

  protected readonly pestanas = [
    { id: 'liquidaciones' as const, texto: 'Liquidaciones' },
    { id: 'pagos' as const, texto: 'Cobros de envíos' },
  ];
  protected readonly estados = Object.keys(TEXTO_ESTADO_PAGO) as EstadoPago[];
  protected readonly textoEstado = TEXTO_ESTADO_PAGO;
  protected readonly abs = Math.abs;

  protected readonly pestana = signal<'liquidaciones' | 'pagos'>('liquidaciones');
  protected readonly liquidaciones = signal<Pagina<Liquidacion> | null>(null);
  protected readonly pagos = signal<Pagina<PagoAdmin> | null>(null);
  protected readonly filtroLiq = signal<'' | 'pendiente' | 'pagada'>('pendiente');
  protected readonly filtroMetodo = signal<'' | MetodoPago>('');
  protected readonly filtroEstado = signal<'' | EstadoPago>('');
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly generando = signal(false);
  protected readonly pagando = signal<Liquidacion | null>(null);
  protected readonly referencia = signal('');
  protected readonly guardando = signal(false);
  protected readonly reembolsando = signal<number | null>(null);

  protected readonly faseLiq = computed<FaseCarga>(() => this.fase(this.liquidaciones()));
  protected readonly fasePagos = computed<FaseCarga>(() => this.fase(this.pagos()));

  private fase(p: Pagina<unknown> | null): FaseCarga {
    return faseDe({
      cargando: this.cargando(),
      error: this.error(),
      vacio: (p?.items.length ?? 0) === 0,
    });
  }

  ngOnInit(): void {
    void this.cargarLiquidaciones();
  }

  /** "26 oct – 1 nov" */
  protected semana(desde: string, hasta: string): string {
    const f = (x: string) =>
      new Date(`${x}T12:00:00`)
        .toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
        .replace('.', '');
    return `${f(desde)} – ${f(hasta)}`;
  }

  protected claseEstado(e: EstadoPago): string {
    return CLASE_ESTADO[e] ?? 'bg-niebla';
  }

  protected cambiar(p: 'liquidaciones' | 'pagos'): void {
    this.pestana.set(p);
    void (p === 'pagos' ? this.cargarPagos() : this.cargarLiquidaciones());
  }

  async cargarLiquidaciones(): Promise<void> {
    await this.cargar(async () =>
      this.liquidaciones.set(
        await this.ops.liquidaciones({ estado: this.filtroLiq() || undefined, pagina: 1 }),
      ),
    );
  }

  async cargarPagos(): Promise<void> {
    await this.cargar(async () =>
      this.pagos.set(
        await this.ops.pagos({
          metodo: this.filtroMetodo() || undefined,
          estado: this.filtroEstado() || undefined,
          pagina: 1,
        }),
      ),
    );
  }

  private async cargar(fn: () => Promise<void>): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      await fn();
    } catch (e) {
      this.error.set(this.mapper.traducir(e));
    } finally {
      this.cargando.set(false);
    }
  }

  async generar(): Promise<void> {
    if (this.generando()) return;
    this.generando.set(true);
    try {
      const nuevas = await this.ops.generarLiquidaciones();
      this.toast.exito(textoGeneradas(nuevas.length));
      this.log.info('Admin', 'Liquidaciones generadas', { cantidad: nuevas.length });
      await this.cargarLiquidaciones();
    } catch (e) {
      this.toast.error(this.mapper.traducir(e));
    } finally {
      this.generando.set(false);
    }
  }

  protected abrirPago(l: Liquidacion): void {
    this.referencia.set('');
    this.pagando.set(l);
  }

  async confirmarPago(l: Liquidacion): Promise<void> {
    if (this.guardando()) return;
    this.guardando.set(true);
    try {
      const actualizada = await this.ops.pagarLiquidacion(l.id, this.referencia().trim());
      this.liquidaciones.update((p) =>
        p
          ? {
              ...p,
              items: p.items.map((x) =>
                x.id === l.id ? { ...x, ...actualizada, conductor: x.conductor } : x,
              ),
            }
          : p,
      );
      this.pagando.set(null);
      this.toast.exito('Liquidación registrada como pagada');
    } catch (e) {
      this.toast.error(this.mapper.traducir(e));
    } finally {
      this.guardando.set(false);
    }
  }

  async reembolsar(p: PagoAdmin): Promise<void> {
    this.reembolsando.set(p.idEnvio);
    try {
      const r = await this.ops.reembolsar(p.idEnvio);
      this.toast.mostrar(
        r.estado === 'reembolsado' ? 'Reembolso realizado' : 'Nequi aún no confirma el reembolso',
      );
      await this.cargarPagos();
    } catch (e) {
      this.toast.error(this.mapper.traducir(e));
    } finally {
      this.reembolsando.set(null);
    }
  }
}
