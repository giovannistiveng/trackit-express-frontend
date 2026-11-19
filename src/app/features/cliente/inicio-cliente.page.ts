import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import {
  Envio,
  SERVICIOS,
  TEXTO_ETAPA,
  TIPOS_SERVICIO,
  TipoServicio,
  esActivo,
} from '../../core/domain';
import { ClientShipmentsPort, EventosPort, LoggerPort } from '../../core/ports';
import { CopPipe } from '../../shared/pipes/cop.pipe';
import { IconoComponent } from '../../shared/ui/icono.component';

/** Saludo según la hora de Colombia. */
export function saludo(fecha = new Date()): string {
  const h = (fecha.getUTCHours() + 24 - 5) % 24;
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Inicio del cliente: qué pedir, lo que va en camino y lo último que pidió (para repetirlo). */
@Component({
  selector: 'ti-inicio-cliente',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconoComponent, CopPipe],
  template: `
    <div class="contenedor max-w-3xl">
      <p class="text-piedra">{{ saludoActual }}{{ nombre() ? ', ' + nombre() : '' }}</p>
      <h1 class="mt-1">¿Qué llevamos hoy?</h1>

      <ul class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Servicios">
        @for (s of servicios; track s.tipo; let i = $index) {
          <li [class.col-span-2]="i === 0" [class.sm:col-span-1]="i === 0">
            <a
              [id]="'servicio-' + s.tipo"
              routerLink="/cliente/nuevo-envio"
              [queryParams]="{ servicio: s.tipo }"
              [class]="claseTarjeta(i === 0)"
            >
              <span
                class="grid size-11 place-items-center rounded-xl"
                [class]="i === 0 ? 'bg-white/15' : 'bg-marca-suave text-marca'"
              >
                <ti-icono [nombre]="s.info.icono" class="size-6" />
              </span>
              <span class="mt-3 block">
                <span
                  class="block text-lg font-extrabold leading-tight"
                  style="font-stretch: 112%"
                  >{{ s.info.nombre }}</span
                >
                <span
                  class="mt-0.5 block text-sm leading-snug"
                  [class]="i === 0 ? 'text-white/80' : 'text-piedra'"
                  >{{ s.info.descripcion }}</span
                >
              </span>
            </a>
          </li>
        }
      </ul>

      @if (activos().length) {
        <section class="mt-8" aria-labelledby="titulo-curso">
          <h2 id="titulo-curso">En curso</h2>
          <ul class="mt-3 space-y-3">
            @for (e of activos(); track e.id) {
              <li>
                <a
                  [routerLink]="['/cliente/envios', e.id]"
                  class="flex items-center gap-3 rounded-2xl border border-linea bg-papel p-4 transition-colors hover:border-marca"
                >
                  <span
                    class="grid size-11 shrink-0 place-items-center rounded-xl bg-marca-suave text-marca"
                  >
                    <ti-icono [nombre]="infoDe(e.tipoServicio).icono" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block font-semibold">{{ textoEtapa(e) }}</span>
                    <span class="block truncate text-sm text-piedra"
                      >{{ infoDe(e.tipoServicio).nombre }} #{{ e.id }} hacia {{ e.destino }}</span
                    >
                  </span>
                  <ti-icono nombre="chevron-right" class="text-piedra" />
                </a>
              </li>
            }
          </ul>
        </section>
      }

      @if (recientes().length) {
        <section class="mt-8" aria-labelledby="titulo-recientes">
          <div class="flex items-baseline justify-between">
            <h2 id="titulo-recientes">Pide de nuevo</h2>
            <a routerLink="/cliente/envios" class="btn-texto text-sm">Ver todos</a>
          </div>
          <ul class="mt-3 divide-y divide-linea rounded-2xl border border-linea bg-papel">
            @for (e of recientes(); track e.id) {
              <li class="flex items-center gap-3 p-4">
                <ti-icono [nombre]="infoDe(e.tipoServicio).icono" class="text-piedra" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold"
                    >{{ e.origen }} → {{ e.destino }}</span
                  >
                  <span class="block text-sm text-piedra"
                    >{{ infoDe(e.tipoServicio).nombre }}, {{ e.tarifa | cop }}</span
                  >
                </span>
                <a
                  routerLink="/cliente/nuevo-envio"
                  [queryParams]="{ repetir: e.id }"
                  class="btn-secundario min-h-9 px-3 text-sm"
                  [attr.aria-label]="'Repetir el pedido ' + e.id"
                  >Repetir</a
                >
              </li>
            }
          </ul>
        </section>
      }

      <section class="mt-8 rounded-2xl bg-papel p-5" aria-labelledby="titulo-seguro">
        <h2 id="titulo-seguro" class="flex items-center gap-2 text-base">
          <ti-icono nombre="shield-check" class="text-marca" /> Así cuidamos tu carga
        </h2>
        <ul class="mt-3 space-y-2 text-sm text-piedra">
          <li>Conductores con documentos verificados uno por uno y vigentes.</li>
          <li>Quien entrega da un código al conductor: así se lleva el pedido correcto.</li>
          <li>Quien recibe da el PIN de entrega; sin PIN no se cierra el servicio.</li>
        </ul>
      </section>
    </div>
  `,
})
export class InicioClientePage implements OnInit {
  private readonly session = inject(SessionService);
  private readonly envios = inject(ClientShipmentsPort);
  private readonly eventos = inject(EventosPort);
  private readonly log = inject(LoggerPort);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly saludoActual = saludo();
  protected readonly servicios = TIPOS_SERVICIO.map((tipo) => ({ tipo, info: SERVICIOS[tipo] }));
  protected readonly nombre = computed(() => this.session.usuario()?.nombre.split(' ')[0] ?? '');
  private readonly lista = signal<Envio[]>([]);
  protected readonly activos = computed(() => this.lista().filter((e) => esActivo(e.estado)));
  protected readonly recientes = computed(() =>
    this.lista()
      .filter((e) => e.estado === 'Entregado')
      .slice(0, 3),
  );

  ngOnInit(): void {
    void this.cargar();
    this.eventos
      .cambiosEnvio()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.cargar());
  }

  async cargar(): Promise<void> {
    try {
      this.lista.set(await this.envios.listar());
    } catch (e) {
      // El inicio sigue sirviendo para pedir aunque el historial no cargue
      this.log.debug('Inicio', 'No se pudieron cargar los envíos', e);
    }
  }

  /** La primera tarjeta (el servicio más pedido) va destacada en el color de la marca. */
  protected claseTarjeta(destacada: boolean): string {
    const base =
      'group flex h-full min-h-32 flex-col justify-between rounded-2xl border p-4 transition-colors';
    return destacada
      ? `${base} border-marca bg-marca text-white hover:bg-marca-oscuro`
      : `${base} border-linea bg-papel hover:border-marca focus-visible:border-marca`;
  }

  protected infoDe(tipo: TipoServicio) {
    return SERVICIOS[tipo];
  }

  protected textoEtapa(e: Envio): string {
    return TEXTO_ETAPA[e.etapa].titulo;
  }
}
