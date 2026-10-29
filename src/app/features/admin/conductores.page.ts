import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConductorPostulante, DocumentoConductor } from '../../core/domain';
import { ApiError } from '../../core/http/api-error';
import { ErrorMessageMapper } from '../../core/http/error-message.mapper';
import { ApprovalPort, DriverApplicantsPort, LoggerPort } from '../../core/ports';
import { EstadoCargaComponent, FaseCarga } from '../../shared/ui/estado-carga.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { ToastService } from '../../shared/ui/toast.service';

interface Decision {
  conductor: ConductorPostulante;
  aprobar: boolean;
}

export function esPdf(url: string): boolean {
  return /\.pdf($|[?#])/i.test(url);
}

/** CU-011 Gestión de aprobación de conductores. */
@Component({
  selector: 'ti-conductores',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, EstadoCargaComponent, ModalComponent],
  template: `
    <div class="contenedor-ancho">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Conductores por aprobar</h1>
          <p class="mt-1 text-piedra">Revisa cédula, SOAT y licencia antes de decidir.</p>
        </div>
        <button type="button" class="btn-secundario" [disabled]="cargando()" (click)="cargar()">
          Refrescar
        </button>
      </div>

      <div class="mt-6">
        <ti-estado-carga
          [fase]="fase()"
          textoVacio="No hay conductores esperando aprobación."
          [textoError]="error()"
          (reintentar)="cargar()"
        >
          <div class="overflow-x-auto rounded-xl border border-linea bg-papel">
            <table class="w-full min-w-[40rem] text-left text-sm">
              <caption class="sr-only">
                Conductores postulantes
              </caption>
              <thead class="border-b border-linea bg-niebla/60 text-piedra">
                <tr>
                  <th scope="col" class="px-4 py-3 font-semibold">Conductor</th>
                  <th scope="col" class="px-4 py-3 font-semibold">Estado</th>
                  <th scope="col" class="px-4 py-3 font-semibold">Documentos</th>
                  <th scope="col" class="px-4 py-3 text-right font-semibold">Decisión</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-linea">
                @for (c of postulantes(); track c.idConductor) {
                  <tr>
                    <td class="px-4 py-3">
                      <p class="font-semibold">{{ c.nombre }}</p>
                      <p class="text-piedra">{{ c.correo }}</p>
                    </td>
                    <td class="px-4 py-3">
                      <span
                        class="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        [class]="
                          c.estadoAprobacion === 'Rechazado'
                            ? 'bg-alerta-suave text-alerta'
                            : 'bg-aviso-suave text-placa-oscuro'
                        "
                        >{{ c.estadoAprobacion }}</span
                      >
                      @if (c.motivoRechazo) {
                        <p class="mt-1 max-w-48 text-xs text-piedra">
                          Motivo: {{ c.motivoRechazo }}
                        </p>
                      }
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex flex-wrap gap-2">
                        @for (d of c.documentos; track d.tipo) {
                          <button
                            type="button"
                            class="flex min-h-11 items-center gap-2 rounded-lg border border-linea px-2 py-1 hover:border-marca"
                            (click)="visor.set({ conductor: c, documento: d })"
                            [attr.aria-label]="'Ver ' + d.tipo + ' de ' + c.nombre"
                          >
                            @if (pdf(d.urlArchivo)) {
                              <span aria-hidden="true">📄</span>
                            } @else {
                              <img
                                [src]="d.urlArchivo"
                                alt=""
                                class="size-8 rounded object-cover"
                                loading="lazy"
                              />
                            }
                            <span class="font-medium">{{ d.tipo }}</span>
                          </button>
                        } @empty {
                          <span class="text-piedra">Sin documentos</span>
                        }
                      </div>
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex justify-end gap-2">
                        <button type="button" class="btn-secundario" (click)="abrir(c, false)">
                          Rechazar
                        </button>
                        <button type="button" class="btn-primario" (click)="abrir(c, true)">
                          Aprobar
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </ti-estado-carga>
      </div>
    </div>

    @if (visor(); as v) {
      <ti-modal [titulo]="v.documento.tipo + ' · ' + v.conductor.nombre" (cerrar)="visor.set(null)">
        @if (pdf(v.documento.urlArchivo)) {
          <a [href]="v.documento.urlArchivo" target="_blank" rel="noopener" class="btn-primario"
            >Abrir el PDF en otra pestaña</a
          >
        } @else {
          <img
            [src]="v.documento.urlArchivo"
            [alt]="v.documento.tipo + ' de ' + v.conductor.nombre"
            class="max-h-[60vh] w-full rounded-lg object-contain"
          />
          <a [href]="v.documento.urlArchivo" target="_blank" rel="noopener" class="btn-texto mt-3"
            >Abrir en tamaño completo</a
          >
        }
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
          <p>Podrá tomar servicios desde su próximo inicio de sesión.</p>
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
  protected readonly visor = signal<{
    conductor: ConductorPostulante;
    documento: DocumentoConductor;
  } | null>(null);
  protected readonly decision = signal<Decision | null>(null);
  protected readonly enviando = signal(false);
  protected readonly errorDecision = signal('');
  protected readonly intento = signal(false);
  protected motivo = '';

  protected readonly fase = computed<FaseCarga>(() =>
    this.cargando()
      ? 'cargando'
      : this.error()
        ? 'error'
        : this.postulantes().length === 0
          ? 'vacio'
          : 'listo',
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
