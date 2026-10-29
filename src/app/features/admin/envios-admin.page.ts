import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ESTADOS_ENVIO,
  EnvioAdmin,
  EstadoEnvio,
  Pagina,
  Zona,
  puedeCancelarAdmin,
} from '../../core/domain';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { AdminOperationsPort, LoggerPort, ZonesPort } from '../../core/ports';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { FechaLocalPipe } from '../../shared/pipes/fecha-local.pipe';
import { EstadoBadgeComponent } from '../../shared/ui/estado-badge.component';
import { EstadoCargaComponent, FaseCarga } from '../../shared/ui/estado-carga.component';
import { IconoComponent } from '../../shared/ui/icono.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { ToastService } from '../../shared/ui/toast.service';

export const TAMANO_PAGINA_ENVIOS = 12;

/** Administración: todos los envíos con filtros y cancelación con motivo. */
@Component({
  selector: 'ti-envios-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    CopPipe,
    FechaLocalPipe,
    EstadoBadgeComponent,
    EstadoCargaComponent,
    IconoComponent,
    ModalComponent,
  ],
  template: `
    <div class="contenedor-ancho">
      <h1>Envíos</h1>
      <p class="mt-1 text-piedra">Busca por número, dirección, cliente o conductor.</p>

      <form
        class="tarjeta mt-6 grid gap-3 p-4 sm:grid-cols-[1fr_11rem_11rem_auto] sm:items-end"
        (ngSubmit)="buscar()"
        role="search"
      >
        <div>
          <label for="texto" class="etiqueta">Buscar</label>
          <div class="relative">
            <ti-icono
              nombre="search"
              class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-piedra"
            />
            <input
              id="texto"
              name="texto"
              class="campo pl-9"
              [(ngModel)]="texto"
              placeholder="#12, Silvania, Laura…"
            />
          </div>
        </div>
        <div>
          <label for="estado" class="etiqueta">Estado</label>
          <select
            id="estado"
            name="estado"
            class="campo"
            [(ngModel)]="estado"
            (ngModelChange)="buscar()"
          >
            <option value="">Todos</option>
            @for (e of estados; track e) {
              <option [value]="e">{{ e }}</option>
            }
          </select>
        </div>
        <div>
          <label for="zona" class="etiqueta">Zona</label>
          <select
            id="zona"
            name="zona"
            class="campo"
            [(ngModel)]="idZona"
            (ngModelChange)="buscar()"
          >
            <option [ngValue]="0">Todas</option>
            @for (z of zonas(); track z.id) {
              <option [ngValue]="z.id">{{ z.nombre }}</option>
            }
          </select>
        </div>
        <button type="submit" class="btn-primario">
          <ti-icono nombre="filter" class="size-4" /> Filtrar
        </button>
      </form>

      <div class="mt-6">
        <ti-estado-carga
          [fase]="fase()"
          [textoError]="error()"
          textoVacio="Ningún envío coincide con la búsqueda."
          (reintentar)="cargar()"
        >
          <div class="tarjeta overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full min-w-[56rem] text-left text-sm">
                <thead class="bg-crema text-xs uppercase tracking-wide text-piedra">
                  <tr>
                    <th scope="col" class="px-4 py-3">Envío</th>
                    <th scope="col" class="px-4 py-3">Ruta</th>
                    <th scope="col" class="px-4 py-3">Cliente</th>
                    <th scope="col" class="px-4 py-3">Conductor</th>
                    <th scope="col" class="px-4 py-3">Estado</th>
                    <th scope="col" class="px-4 py-3 text-right">Tarifa</th>
                    <th scope="col" class="px-4 py-3"><span class="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-linea">
                  @for (e of pagina()?.items ?? []; track e.id) {
                    <tr class="transition-colors hover:bg-crema/60">
                      <td class="px-4 py-3">
                        <p class="font-bold">#{{ e.id }}</p>
                        <p class="text-xs text-piedra">
                          {{ e.fechaCreacion | fechaLocal: 'fecha' }}
                        </p>
                      </td>
                      <td class="max-w-64 px-4 py-3">
                        <p class="truncate font-medium">{{ e.origen }} → {{ e.destino }}</p>
                        <p class="text-xs text-piedra">{{ e.zona }} · {{ e.tipoCarga }}</p>
                      </td>
                      <td class="px-4 py-3">
                        <p class="font-medium">{{ e.cliente.nombre }}</p>
                        <p class="text-xs text-piedra">{{ e.cliente.correo }}</p>
                      </td>
                      <td class="px-4 py-3">{{ e.conductorNombre ?? '—' }}</td>
                      <td class="px-4 py-3"><ti-estado-badge [estado]="e.estado" /></td>
                      <td class="numeros px-4 py-3 text-right font-semibold">
                        {{ e.tarifa | cop }}
                      </td>
                      <td class="px-4 py-3 text-right">
                        @if (puedeCancelar(e)) {
                          <button
                            type="button"
                            class="btn min-h-9 px-3 text-sm text-alerta hover:bg-alerta-suave"
                            (click)="aCancelar.set(e)"
                            [attr.aria-label]="'Cancelar el envío ' + e.id"
                          >
                            <ti-icono nombre="ban" class="size-4" /> Cancelar
                          </button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div
              class="flex items-center justify-between gap-3 border-t border-linea px-4 py-3 text-sm"
            >
              <p class="text-piedra">
                {{ pagina()?.total ?? 0 }} envíos · página {{ numeroPagina() }} de
                {{ totalPaginas() }}
              </p>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="btn-secundario min-h-9 px-3"
                  [disabled]="numeroPagina() <= 1"
                  (click)="irA(numeroPagina() - 1)"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  class="btn-secundario min-h-9 px-3"
                  [disabled]="numeroPagina() >= totalPaginas()"
                  (click)="irA(numeroPagina() + 1)"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        </ti-estado-carga>
      </div>
    </div>

    @if (aCancelar(); as e) {
      <ti-modal [titulo]="'Cancelar el envío #' + e.id" (cerrar)="cerrarModal()">
        <p class="text-piedra">
          {{ e.origen }} → {{ e.destino }}. Se avisará al cliente{{
            e.conductorNombre ? ' y al conductor' : ''
          }}
          con el motivo.
        </p>
        <label for="motivo" class="etiqueta mt-5">Motivo</label>
        <textarea
          id="motivo"
          rows="3"
          maxlength="255"
          class="campo"
          [(ngModel)]="motivo"
          [attr.aria-invalid]="motivoInvalido()"
        ></textarea>
        @if (motivoInvalido()) {
          <p class="error-campo">Escribe el motivo (mínimo 3 caracteres).</p>
        }
        @if (errorCancelar()) {
          <p class="error-campo" role="alert">{{ errorCancelar() }}</p>
        }
        <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" class="btn-secundario" (click)="cerrarModal()">Volver</button>
          <button type="button" class="btn-peligro" [disabled]="cancelando()" (click)="cancelar(e)">
            {{ cancelando() ? 'Cancelando…' : 'Cancelar envío' }}
          </button>
        </div>
      </ti-modal>
    }
  `,
})
export class EnviosAdminPage implements OnInit {
  private readonly ops = inject(AdminOperationsPort);
  private readonly zonasPort = inject(ZonesPort);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerPort);

  protected readonly estados = ESTADOS_ENVIO;
  protected texto = '';
  protected estado: EstadoEnvio | '' = '';
  protected idZona = 0;
  protected motivo = '';
  protected readonly zonas = signal<Zona[]>([]);
  protected readonly pagina = signal<Pagina<EnvioAdmin> | null>(null);
  protected readonly numeroPagina = signal(1);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly aCancelar = signal<EnvioAdmin | null>(null);
  protected readonly cancelando = signal(false);
  protected readonly errorCancelar = signal('');
  protected readonly intentoCancelar = signal(false);

  protected readonly fase = computed<FaseCarga>(() =>
    this.cargando()
      ? 'cargando'
      : this.error()
        ? 'error'
        : (this.pagina()?.items.length ?? 0) === 0
          ? 'vacio'
          : 'listo',
  );
  protected readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil((this.pagina()?.total ?? 0) / TAMANO_PAGINA_ENVIOS)),
  );
  protected readonly puedeCancelar = puedeCancelarAdmin;

  ngOnInit(): void {
    void this.cargar();
    this.zonasPort.listar().then(
      (z) => this.zonas.set(z),
      () => undefined,
    );
  }

  buscar(): void {
    this.numeroPagina.set(1);
    void this.cargar();
  }

  irA(n: number): void {
    this.numeroPagina.set(n);
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      this.pagina.set(
        await this.ops.envios({
          texto: this.texto || undefined,
          estado: this.estado || undefined,
          idZona: this.idZona || undefined,
          pagina: this.numeroPagina(),
          tamano: TAMANO_PAGINA_ENVIOS,
        }),
      );
    } catch (e) {
      this.error.set(this.mapper.traducir(e));
    } finally {
      this.cargando.set(false);
    }
  }

  protected motivoInvalido(): boolean {
    return this.intentoCancelar() && this.motivo.trim().length < 3;
  }

  protected cerrarModal(): void {
    this.aCancelar.set(null);
    this.motivo = '';
    this.errorCancelar.set('');
    this.intentoCancelar.set(false);
  }

  async cancelar(e: EnvioAdmin): Promise<void> {
    this.intentoCancelar.set(true);
    if (this.motivo.trim().length < 3 || this.cancelando()) return;
    this.cancelando.set(true);
    this.errorCancelar.set('');
    try {
      await this.ops.cancelar(e.id, this.motivo.trim());
      this.log.info('Admin', `Envío #${e.id} cancelado`);
      this.toast.mostrar(`Envío #${e.id} cancelado`);
      this.cerrarModal();
      await this.cargar();
    } catch (err) {
      this.errorCancelar.set(this.mapper.traducir(err));
    } finally {
      this.cancelando.set(false);
    }
  }
}
