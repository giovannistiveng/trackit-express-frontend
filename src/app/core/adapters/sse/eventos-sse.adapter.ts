import { Injectable, InjectionToken, OnDestroy, inject, signal } from '@angular/core';
import { Observable, Subject, filter, map } from 'rxjs';
import { MensajeEntrante, Notificacion } from '../../domain';
import { EventosPort, LoggerPort, RealtimePort } from '../../ports';
import { ApiMensaje, ApiNotificacion } from '../http/backend.types';
import { aMensaje, aNotificacion } from '../http/mappers';

type TipoEvento = 'notificacion' | 'chat' | 'envio' | 'pago';

interface EventoServidor {
  tipo: TipoEvento;
  datos: unknown;
}

/** Datos del evento "notificacion": el id puede faltar si el aviso no se guardó. */
type ApiNotificacionEnVivo = Omit<ApiNotificacion, 'id' | 'leida' | 'fecha'> & {
  id: number | null;
  fecha?: string;
};

/** Fábrica de EventSource (en las pruebas se reemplaza por una falsa). */
export type FabricaEventSource = (url: string) => EventSource;
export const FUENTE_EVENTOS = new InjectionToken<FabricaEventSource | null>('FUENTE_EVENTOS', {
  providedIn: 'root',
  factory: () => (typeof EventSource === 'function' ? (url: string) => new EventSource(url) : null),
});

/** Espera antes de reconectar: 2 s, 4 s, 8 s… hasta 60 s. */
export function esperaReconexion(intento: number): number {
  return Math.min(60_000, 2000 * 2 ** Math.max(0, intento));
}

const TIPOS: TipoEvento[] = ['notificacion', 'chat', 'envio', 'pago'];

/** Traduce un aviso en vivo; sin id (no se pudo guardar) usa uno negativo que no existe en el servidor. */
export function aNotificacionEnVivo(api: ApiNotificacionEnVivo, ahora = Date.now()): Notificacion {
  return aNotificacion({
    ...api,
    id: api.id ?? -ahora,
    leida: false,
    fecha: api.fecha ?? new Date(ahora).toISOString(),
  });
}

/**
 * Adaptador de EventosPort con Server-Sent Events. Como el ticket de conexión es de un solo uso,
 * al caerse la conexión se pide uno nuevo y se reconecta con espera creciente.
 */
@Injectable({ providedIn: 'root' })
export class EventosSseAdapter extends EventosPort implements OnDestroy {
  private readonly puerto = inject(RealtimePort);
  private readonly fabrica = inject(FUENTE_EVENTOS);
  private readonly log = inject(LoggerPort);

  readonly conectado = signal(false);
  private readonly sujeto = new Subject<EventoServidor>();
  private fuente: EventSource | null = null;
  private activo = false;
  private intentos = 0;
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  notificaciones(): Observable<Notificacion> {
    return this.de<ApiNotificacionEnVivo>('notificacion').pipe(map((n) => aNotificacionEnVivo(n)));
  }

  mensajes(): Observable<MensajeEntrante> {
    return this.de<{ id_envio: number; mensaje: ApiMensaje }>('chat').pipe(
      map((d) => ({ idEnvio: d.id_envio, mensaje: aMensaje(d.mensaje) })),
    );
  }

  cambiosEnvio(): Observable<number> {
    return this.de<{ id_envio: number }>('envio').pipe(map((d) => d.id_envio));
  }

  private de<T>(tipo: TipoEvento): Observable<T> {
    return this.sujeto.pipe(
      filter((e) => e.tipo === tipo),
      map((e) => e.datos as T),
    );
  }

  iniciar(): void {
    if (this.activo || !this.fabrica) return;
    this.activo = true;
    void this.abrir();
  }

  detener(): void {
    this.activo = false;
    this.intentos = 0;
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    this.fuente?.close();
    this.fuente = null;
    this.conectado.set(false);
  }

  ngOnDestroy(): void {
    this.detener();
  }

  private async abrir(): Promise<void> {
    if (!this.activo || !this.fabrica) return;
    try {
      const ticket = await this.puerto.ticket();
      if (!this.activo) return;
      const fuente = this.fabrica(this.puerto.urlEventos(ticket));
      this.fuente = fuente;
      fuente.addEventListener('conectado', () => {
        this.intentos = 0;
        this.conectado.set(true);
      });
      for (const tipo of TIPOS) {
        fuente.addEventListener(tipo, (ev) => {
          try {
            this.sujeto.next({ tipo, datos: JSON.parse((ev as MessageEvent<string>).data) });
          } catch {
            // Evento mal formado: se ignora
          }
        });
      }
      fuente.onerror = () => {
        // El ticket ya se usó: EventSource no puede reconectar solo
        fuente.close();
        if (this.fuente === fuente) this.reintentar();
      };
    } catch (e) {
      this.log.debug('Eventos', 'No se pudo abrir el canal de eventos', e);
      this.reintentar();
    }
  }

  private reintentar(): void {
    this.conectado.set(false);
    this.fuente = null;
    if (!this.activo) return;
    const espera = esperaReconexion(this.intentos++);
    this.temporizador = setTimeout(() => void this.abrir(), espera);
  }
}
