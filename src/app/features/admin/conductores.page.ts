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
  ConductorPostulante,
  DocumentoConductor,
  EstadoAprobacion,
  EstadoRequisito,
  Requisito,
} from '../../core/domain';

interface Revision {
  conductor: ConductorPostulante;
  requisito: Requisito;
  documento: DocumentoConductor;
}
import { IconoComponent } from '../../shared/ui/icono.component';
import { PlacaComponent } from '../../shared/ui/placa.component';
import { ApiError } from '../../core/http/api-error';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { ApprovalPort, DriverApplicantsPort, LoggerPort } from '../../core/ports';
import { EstadoCargaComponent, FaseCarga, faseDe } from '../../shared/ui/estado-carga.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { ToastService } from '../../shared/ui/toast.service';

interface Decision {
  conductor: ConductorPostulante;
  aprobar: boolean;
}

const ETIQUETA_REQUISITO: Record<EstadoRequisito, string> = {
  falta: 'Falta',
  pendiente: 'Por revisar',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  vencido: 'Vencido',
};

export function esPdf(url: string): boolean {
  return /\.pdf($|[?#])/i.test(url);
}

/** CU-011 Verificación de conductores: revisión documento por documento y aprobación. */
@Component({
  selector: 'ti-conductores',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, EstadoCargaComponent, ModalComponent, IconoComponent, PlacaComponent],
  template: `
    <div class="contenedor-ancho">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Verificación de conductores</h1>
          <p class="mt-1 text-piedra">
            Revisa cada documento contra la fuente oficial. Solo se puede aprobar a quien tenga todo
            al día.
          </p>
        </div>
        <button type="button" class="btn-secundario" [disabled]="cargando()" (click)="cargar()">
          <ti-icono nombre="refresh" class="size-4" /> Refrescar
        </button>
      </div>

      <div class="mt-6">
        <ti-estado-carga
          [fase]="fase()"
          textoVacio="No hay conductores ni documentos esperando revisión."
          [textoError]="error()"
          (reintentar)="cargar()"
        >
          <ul class="space-y-5">
            @for (c of postulantes(); track c.idConductor) {
              <li class="tarjeta overflow-hidden">
                <div
                  class="flex flex-wrap items-start justify-between gap-4 border-b border-linea p-5"
                >
                  <div class="min-w-0">
                    <p class="text-lg font-bold">{{ c.nombre }}</p>
                    <p class="text-sm text-piedra">{{ c.correo }}</p>
                    <div class="mt-2 flex flex-wrap items-center gap-2">
                      <span class="insignia" [class]="claseEstado(c.estadoAprobacion)">{{
                        c.estadoAprobacion
                      }}</span>
                      @if (c.vehiculo; as v) {
                        <ti-placa [valor]="v.placa" etiqueta="Placa" tamano="pequeno" />
                        <span class="text-sm">{{ v.categoria }}</span>
                      } @else {
                        <span class="text-sm text-alerta">Sin vehículo registrado</span>
                      }
                    </div>
                    @if (c.motivoRechazo) {
                      <p class="mt-2 text-sm text-piedra">Motivo: {{ c.motivoRechazo }}</p>
                    }
                  </div>
                  @if (avance(c); as a) {
                    <p class="numeros text-right text-sm">
                      <strong class="text-2xl">{{ a.listos }}/{{ a.total }}</strong
                      ><br />requisitos aprobados
                    </p>
                  }
                </div>

                <ul class="divide-y divide-linea">
                  @for (r of requisitosDe(c); track r.tipo) {
                    <li class="flex flex-wrap items-center gap-3 px-5 py-3">
                      @if (r.documento; as d) {
                        <button
                          type="button"
                          class="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-linea hover:border-marca"
                          (click)="abrirRevision(c, r, d)"
                          [attr.aria-label]="'Revisar ' + r.nombre + ' de ' + c.nombre"
                        >
                          @if (pdf(d.urlArchivo)) {
                            <ti-icono nombre="file-text" class="text-piedra" />
                          } @else {
                            <img
                              [src]="d.urlArchivo"
                              alt=""
                              class="size-full object-cover"
                              loading="lazy"
                            />
                          }
                        </button>
                      } @else {
                        <span
                          class="grid size-12 shrink-0 place-items-center rounded-lg border border-dashed border-linea text-piedra"
                          ><ti-icono nombre="minus"
                        /></span>
                      }
                      <div class="min-w-0 flex-1">
                        <p class="font-semibold">
                          {{ r.nombre }}
                          @if (!r.obligatorio) {
                            <span class="text-sm font-normal text-piedra">(si aplica)</span>
                          }
                        </p>
                        <p class="text-sm text-piedra">
                          {{ textoRequisito(r) }}
                        </p>
                      </div>
                      @if (r.verificar; as v) {
                        <a class="btn-texto text-sm" [href]="v.url" target="_blank" rel="noopener">
                          {{ v.fuente }} <ti-icono nombre="external-link" class="size-3.5" />
                        </a>
                      }
                      <span class="insignia" [class]="claseRequisito(r.estado)">{{
                        etiquetaRequisito(r.estado)
                      }}</span>
                      @if (r.documento && r.estado === 'pendiente') {
                        <button
                          type="button"
                          class="btn-secundario min-h-9 px-3 text-sm"
                          (click)="abrirRevision(c, r, r.documento)"
                        >
                          Revisar
                        </button>
                      }
                    </li>
                  }
                </ul>

                @if (c.consultas?.length) {
                  <p
                    class="flex flex-wrap gap-x-4 gap-y-1 border-t border-linea bg-crema px-5 py-3 text-sm"
                  >
                    <span class="text-piedra">Consulta también con la cédula:</span>
                    @for (q of c.consultas; track q.url) {
                      <a
                        class="btn-texto min-h-0 text-sm"
                        [href]="q.url"
                        target="_blank"
                        rel="noopener"
                        >{{ q.fuente }} <ti-icono nombre="external-link" class="size-3.5"
                      /></a>
                    }
                  </p>
                }

                <div
                  class="flex flex-wrap items-center justify-end gap-3 border-t border-linea p-4"
                >
                  @if (
                    c.requisitos && !c.requisitos.completo && c.estadoAprobacion !== 'Aprobado'
                  ) {
                    <p class="mr-auto text-sm text-piedra">
                      Falta: {{ c.requisitos.pendientes.join('; ') }}
                    </p>
                  }
                  @if (c.estadoAprobacion !== 'Aprobado') {
                    <button type="button" class="btn-secundario" (click)="abrir(c, false)">
                      Rechazar
                    </button>
                    <button
                      type="button"
                      class="btn-primario"
                      [disabled]="!!c.requisitos && !c.requisitos.completo"
                      (click)="abrir(c, true)"
                    >
                      Aprobar conductor
                    </button>
                  }
                </div>
              </li>
            }
          </ul>
        </ti-estado-carga>
      </div>
    </div>

    @if (revision(); as v) {
      <ti-modal
        [titulo]="v.requisito.nombre + ': ' + v.conductor.nombre"
        [cerrable]="!enviando()"
        (cerrar)="revision.set(null)"
      >
        @let d = v.documento;
        @if (pdf(d.urlArchivo)) {
          <a [href]="d.urlArchivo" target="_blank" rel="noopener" class="btn-primario"
            >Abrir el PDF en otra pestaña</a
          >
        } @else {
          <img
            [src]="d.urlArchivo"
            [alt]="v.requisito.nombre + ' de ' + v.conductor.nombre"
            class="max-h-[55vh] w-full rounded-lg bg-niebla object-contain"
          />
          <a [href]="d.urlArchivo" target="_blank" rel="noopener" class="btn-texto mt-2 text-sm"
            >Abrir en tamaño completo</a
          >
        }
        @if (v.requisito.verificar; as f) {
          <p class="mt-3 rounded-xl bg-crema p-3 text-sm">
            Compara los datos con
            <a
              class="font-semibold text-marca underline"
              [href]="f.url"
              target="_blank"
              rel="noopener"
              >{{ f.fuente }}</a
            >.
          </p>
        }
        @if (v.requisito.vence) {
          <div class="mt-4">
            <label for="rev-vence" class="etiqueta">Fecha de vencimiento</label>
            <input id="rev-vence" type="date" class="campo max-w-52" [(ngModel)]="fechaRevision" />
            <p class="ayuda">Corrígela si no coincide con el documento.</p>
          </div>
        }
        <div class="mt-4">
          <label for="rev-motivo" class="etiqueta">Motivo si lo rechazas</label>
          <input
            id="rev-motivo"
            class="campo"
            maxlength="255"
            [(ngModel)]="motivoRevision"
            placeholder="Ej.: la foto está borrosa"
          />
        </div>
        @if (errorDecision()) {
          <p class="error-campo mt-3" role="alert">{{ errorDecision() }}</p>
        }
        <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            class="btn-peligro"
            [disabled]="enviando()"
            (click)="revisar(v, false)"
          >
            Rechazar documento
          </button>
          <button
            type="button"
            class="btn-primario"
            [disabled]="enviando()"
            (click)="revisar(v, true)"
          >
            Aprobar documento
          </button>
        </div>
      </ti-modal>
    }

    @if (decision(); as d) {
      <ti-modal
        [titulo]="
          d.aprobar ? 'Aprobar a ' + d.conductor.nombre : 'Rechazar a ' + d.conductor.nombre
        "
        [cerrable]="!enviando()"
        (cerrar)="decision.set(null)"
      >
        @if (d.aprobar) {
          <p>
            Todos sus documentos están aprobados y vigentes. Podrá tomar servicios de inmediato.
          </p>
        } @else {
          <label for="motivo" class="etiqueta">Motivo del rechazo</label>
          <textarea
            id="motivo"
            class="campo min-h-24"
            maxlength="255"
            [(ngModel)]="motivo"
            [attr.aria-invalid]="motivoInvalido()"
            aria-describedby="motivo-ayuda"
          ></textarea>
          <p id="motivo-ayuda" class="ayuda">
            {{ motivo.trim().length }}/255. El conductor lo verá en su perfil.
          </p>
          @if (motivoInvalido()) {
            <p class="error-campo">Escribe el motivo del rechazo.</p>
          }
        }
        @if (errorDecision()) {
          <p class="error-campo mt-3" role="alert">{{ errorDecision() }}</p>
        }
        <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            class="btn-secundario"
            [disabled]="enviando()"
            (click)="decision.set(null)"
          >
            Cancelar
          </button>
          <button
            type="button"
            [class]="d.aprobar ? 'btn-primario' : 'btn-peligro'"
            [disabled]="enviando()"
            (click)="confirmar(d)"
          >
            {{ enviando() ? 'Guardando…' : d.aprobar ? 'Aprobar' : 'Rechazar' }}
          </button>
        </div>
      </ti-modal>
    }
  `,
})
export class ConductoresPage implements OnInit {
  private readonly postulantesPort = inject(DriverApplicantsPort);
  private readonly aprobacion = inject(ApprovalPort);
  private readonly mapper = inject(ErrorMessageMapper);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerPort);

  protected readonly postulantes = signal<ConductorPostulante[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly revision = signal<Revision | null>(null);
  protected fechaRevision = '';
  protected motivoRevision = '';
  protected readonly decision = signal<Decision | null>(null);
  protected readonly enviando = signal(false);
  protected readonly errorDecision = signal('');
  protected readonly intento = signal(false);
  protected motivo = '';

  protected readonly fase = computed<FaseCarga>(() =>
    faseDe({
      cargando: this.cargando(),
      error: this.error(),
      vacio: this.postulantes().length === 0,
    }),
  );

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      this.postulantes.set(await this.postulantesPort.listarPendientes());
    } catch (e) {
      this.error.set(this.mapper.traducir(e));
    } finally {
      this.cargando.set(false);
    }
  }

  protected pdf(url: string): boolean {
    return esPdf(url);
  }

  /** Requisitos del conductor; con un backend anterior se arman con sus documentos. */
  protected requisitosDe(c: ConductorPostulante): Requisito[] {
    if (c.requisitos) return c.requisitos.items;
    return c.documentos.map((d) => ({
      tipo: d.tipo,
      nombre: d.tipo,
      ayuda: '',
      obligatorio: true,
      vence: false,
      estado: 'pendiente' as const,
      verificar: null,
      documento: d,
    }));
  }

  protected avance(c: ConductorPostulante): { listos: number; total: number } | null {
    const obligatorios = c.requisitos?.items.filter((r) => r.obligatorio) ?? [];
    if (!obligatorios.length) return null;
    return {
      listos: obligatorios.filter((r) => r.estado === 'aprobado').length,
      total: obligatorios.length,
    };
  }

  protected etiquetaRequisito(e: EstadoRequisito): string {
    return ETIQUETA_REQUISITO[e];
  }

  protected claseRequisito(e: EstadoRequisito): string {
    if (e === 'aprobado') return 'bg-exito-suave text-exito';
    if (e === 'pendiente') return 'bg-aviso-suave text-placa-oscuro';
    if (e === 'falta') return 'bg-niebla text-piedra';
    return 'bg-alerta-suave text-alerta';
  }

  protected claseEstado(e: EstadoAprobacion): string {
    if (e === 'Aprobado') return 'bg-exito-suave text-exito';
    if (e === 'Rechazado' || e === 'Suspendido') return 'bg-alerta-suave text-alerta';
    return 'bg-aviso-suave text-placa-oscuro';
  }

  protected textoRequisito(r: Requisito): string {
    const d = r.documento;
    if (!d) return r.obligatorio ? 'No lo ha subido.' : 'No aplica o no lo ha subido.';
    if (r.estado === 'rechazado' && d.motivoRechazo) return `Rechazado: ${d.motivoRechazo}`;
    if (d.fechaVencimiento) {
      const dias = d.diasParaVencer ?? 0;
      if (dias < 0) return `Venció el ${d.fechaVencimiento}`;
      const pronto = dias <= 15 ? ` (en ${dias} días)` : '';
      return `Vence el ${d.fechaVencimiento}${pronto}`;
    }
    return d.fechaSubida ? `Subido el ${d.fechaSubida.toLocaleDateString('es-CO')}` : 'Subido';
  }

  abrirRevision(
    conductor: ConductorPostulante,
    requisito: Requisito,
    documento: DocumentoConductor,
  ): void {
    this.fechaRevision = documento.fechaVencimiento ?? '';
    this.motivoRevision = '';
    this.errorDecision.set('');
    this.revision.set({ conductor, requisito, documento });
  }

  async revisar(v: Revision, aprobado: boolean): Promise<void> {
    if (this.enviando()) return;
    if (!aprobado && this.motivoRevision.trim().length < 3) {
      this.errorDecision.set('Escribe el motivo para que el conductor sepa qué corregir.');
      return;
    }
    this.enviando.set(true);
    this.errorDecision.set('');
    try {
      // Un documento subido siempre tiene id
      await this.aprobacion.revisarDocumento(v.documento.id as number, aprobado, {
        motivo: this.motivoRevision,
        fechaVencimiento: v.requisito.vence ? this.fechaRevision || undefined : undefined,
      });
      this.toast.exito(
        aprobado ? `${v.requisito.nombre} aprobado` : `${v.requisito.nombre} rechazado`,
      );
      this.revision.set(null);
      await this.cargar();
    } catch (e) {
      this.errorDecision.set(this.mapper.traducir(e));
    } finally {
      this.enviando.set(false);
    }
  }

  protected motivoInvalido(): boolean {
    const m = this.motivo.trim();
    return this.intento() && (m.length < 1 || m.length > 255);
  }

  abrir(conductor: ConductorPostulante, aprobar: boolean): void {
    this.motivo = '';
    this.intento.set(false);
    this.errorDecision.set('');
    this.decision.set({ conductor, aprobar });
  }

  async confirmar(d: Decision): Promise<void> {
    this.intento.set(true);
    const motivo = this.motivo.trim();
    if (!d.aprobar && (motivo.length < 1 || motivo.length > 255)) return;
    if (this.enviando()) return;
    this.enviando.set(true);
    this.errorDecision.set('');
    try {
      const r = await this.aprobacion.decidir(
        d.conductor.idConductor,
        d.aprobar,
        d.aprobar ? undefined : motivo,
      );
      this.log.info('Aprobacion', `Conductor ${d.conductor.idConductor} ${r.estadoAprobacion}`);
      if (r.estadoAprobacion === 'Aprobado')
        this.postulantes.update((l) => l.filter((p) => p.idConductor !== d.conductor.idConductor));
      else
        this.postulantes.update((l) =>
          l.map((p) =>
            p.idConductor === d.conductor.idConductor
              ? { ...p, estadoAprobacion: r.estadoAprobacion }
              : p,
          ),
        );
      this.toast.exito(
        d.aprobar
          ? `${d.conductor.nombre} quedó aprobado`
          : `${d.conductor.nombre} quedó rechazado`,
      );
      this.decision.set(null);
    } catch (e) {
      if (e instanceof ApiError && /ya ha sido aprobado/i.test(e.message)) {
        this.toast.mostrar('Este conductor ya estaba aprobado.');
        this.decision.set(null);
        await this.cargar();
      } else if (e instanceof ApiError && e.status === 404) {
        this.errorDecision.set('Ese conductor ya no existe en el sistema. Refresca la lista.');
      } else {
        this.errorDecision.set(this.mapper.traducir(e));
      }
    } finally {
      this.enviando.set(false);
    }
  }
}
