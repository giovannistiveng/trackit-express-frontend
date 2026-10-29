import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Pagina, RegistroAuditoria } from '../../core/domain';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { AdminMetricsPort, LoggerPort } from '../../core/ports';
import { FechaLocalPipe, formatearFechaLocal } from '../../shared/pipes/fecha-local.pipe';
import { EstadoCargaComponent, FaseCarga } from '../../shared/ui/estado-carga.component';
import { aCsv, descargarArchivo } from '../../shared/util/csv';

export const TAMANO_PAGINA = 15;
/** Acciones que registra el backend en la tabla Auditoria. */
const ACCIONES = [
  'Inicio de sesión',
  'Envío creado',
  'Servicio aceptado',
  'Ruta iniciada',
  'Entrega validada',
  'Calificación',
  'Registro de usuario',
  'Vehículo registrado',
  'Documento cargado',
  'Conductor aprobado',
  'Conductor rechazado',
  'Envío cancelado',
  'Tarifa actualizada',
  'Perfil actualizado',
  'Contraseña cambiada',
  'Mensaje de contacto',
  'Contacto atendido',
];

/** E7-HU2 Auditoría: tabla paginada con filtros y exportación a CSV. */
@Component({
  selector: 'ti-auditoria',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, FechaLocalPipe, EstadoCargaComponent],
  template: `
    <div class="contenedor-ancho">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Auditoría</h1>
        </div>
        <button
          type="button"
          class="btn-secundario"
          [disabled]="exportando() || !pagina()?.total"
          (click)="exportar()"
        >
          {{ exportando() ? 'Exportando…' : 'Exportar CSV' }}
        </button>
      </div>

      <form
        class="mt-6 grid gap-3 sm:grid-cols-[1fr_14rem_auto]"
        (ngSubmit)="buscar()"
        role="search"
      >
        <div>
          <label for="texto" class="etiqueta">Buscar</label>
          <input
            id="texto"
            class="campo"
            name="texto"
            [(ngModel)]="texto"
            placeholder="Usuario, acción o detalle"
          />
        </div>
        <div>
          <label for="accion" class="etiqueta">Acción</label>
          <select
            id="accion"
            class="campo"
            name="accion"
            [(ngModel)]="accion"
            (ngModelChange)="buscar()"
          >
            <option value="">Todas</option>
            @for (a of acciones; track a) {
              <option [value]="a">{{ a }}</option>
            }
          </select>
        </div>
        <button type="submit" class="btn-primario sm:mt-6">Filtrar</button>
      </form>

      <div class="mt-6">
        <ti-estado-carga
          [fase]="fase()"
          textoVacio="Ningún registro coincide con el filtro."
          [textoError]="error()"
          (reintentar)="cargar()"
        >
          @if (pagina(); as p) {
            <div class="overflow-x-auto rounded-xl border border-linea bg-papel">
              <table class="w-full min-w-[44rem] text-left text-sm">
                <caption class="sr-only">
                  Registros de auditoría, página
                  {{
                    p.pagina
                  }}
                  de
                  {{
                    totalPaginas()
                  }}
                </caption>
                <thead class="border-b border-linea bg-niebla/60 text-piedra">
                  <tr>
                    <th scope="col" class="px-4 py-3 font-semibold">Fecha</th>
                    <th scope="col" class="px-4 py-3 font-semibold">Usuario</th>
                    <th scope="col" class="px-4 py-3 font-semibold">Acción</th>
                    <th scope="col" class="px-4 py-3 font-semibold">Entidad</th>
                    <th scope="col" class="px-4 py-3 font-semibold">Detalle</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-linea">
                  @for (r of p.items; track r.id) {
                    <tr>
                      <td class="numeros whitespace-nowrap px-4 py-2.5">
                        {{ r.fecha | fechaLocal }}
                      </td>
                      <td class="px-4 py-2.5">{{ r.usuario }}</td>
                      <td class="px-4 py-2.5 font-medium">{{ r.accion }}</td>
                      <td class="px-4 py-2.5">{{ r.entidad }}</td>
                      <td class="px-4 py-2.5 text-piedra">{{ r.detalle }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <nav
              class="mt-4 flex items-center justify-between gap-3 text-sm"
              aria-label="Paginación"
            >
              <span class="numeros text-piedra"
                >{{ p.total }} registros · página {{ p.pagina }} de {{ totalPaginas() }}</span
              >
              <div class="flex gap-2">
                <button
                  type="button"
                  class="btn-secundario"
                  [disabled]="p.pagina <= 1"
                  (click)="ir(p.pagina - 1)"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  class="btn-secundario"
                  [disabled]="p.pagina >= totalPaginas()"
                  (click)="ir(p.pagina + 1)"
                >
                  Siguiente
                </button>
              </div>
            </nav>
          }
        </ti-estado-carga>
      </div>
    </div>
  `,
})
export class AuditoriaPage implements OnInit {
  private readonly puerto = inject(AdminMetricsPort);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly log = inject(LoggerPort);
  protected readonly acciones = ACCIONES;

  protected texto = '';
  protected accion = '';
  private readonly numeroPagina = signal(1);
  protected readonly pagina = signal<Pagina<RegistroAuditoria> | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly exportando = signal(false);

  protected readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil((this.pagina()?.total ?? 0) / TAMANO_PAGINA)),
  );
  protected readonly fase = computed<FaseCarga>(() =>
    this.cargando()
      ? 'cargando'
      : this.error()
        ? 'error'
        : !this.pagina()?.items.length
          ? 'vacio'
          : 'listo',
  );

  ngOnInit(): void {
    void this.cargar();
  }

  buscar(): void {
    this.numeroPagina.set(1);
    void this.cargar();
  }

  ir(n: number): void {
    this.numeroPagina.set(n);
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      this.pagina.set(await this.puerto.auditoria(this.filtro(this.numeroPagina(), TAMANO_PAGINA)));
    } catch (e) {
      this.error.set(this.mapper.traducir(e));
    } finally {
      this.cargando.set(false);
    }
  }

  /** Exporta todos los registros del filtro actual (no solo la página visible). */
  async exportar(): Promise<void> {
    this.exportando.set(true);
    try {
      const total = this.pagina()?.total ?? 0;
      const todo = await this.puerto.auditoria(this.filtro(1, Math.max(total, 1)));
      const csv = aCsv(
        ['Fecha', 'Usuario', 'Acción', 'Entidad', 'Detalle'],
        todo.items.map((r) => [
          formatearFechaLocal(r.fecha),
          r.usuario,
          r.accion,
          r.entidad,
          r.detalle,
        ]),
      );
      descargarArchivo(`auditoria-trackit-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      this.log.info('Auditoria', `Exportación CSV (${todo.items.length} registros)`);
    } catch (e) {
      this.error.set(this.mapper.traducir(e));
    } finally {
      this.exportando.set(false);
    }
  }

  private filtro(pagina: number, tamano: number) {
    return {
      texto: this.texto.trim() || undefined,
      accion: this.accion || undefined,
      pagina,
      tamano,
    };
  }
}
