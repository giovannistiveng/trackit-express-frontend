import {
  HttpBackend,
  HttpClient,
  HttpEventType,
  HttpResponse,
  HttpUploadProgressEvent,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, filter, firstValueFrom, map } from 'rxjs';
import {
  CategoriaVehiculo,
  ConductorPostulante,
  Cotizacion,
  Envio,
  EnvioAdmin,
  EstadisticasPublicas,
  EventoCarga,
  FiltroAuditoria,
  FiltroEnviosAdmin,
  MensajeContacto,
  MensajeContactoRecibido,
  MetricasAdmin,
  Notificacion,
  Pagina,
  PerfilConductor,
  PerfilUsuario,
  RegistroAuditoria,
  RegistroUsuario,
  ResumenConductor,
  Seguimiento,
  SolicitudCotizacion,
  TipoDocumento,
  Ubicacion,
  Usuario,
  Vehiculo,
  Zona,
  esIdValido,
} from '../../domain';
import {
  AccountPort,
  AdminMetricsPort,
  AdminOperationsPort,
  ApprovalPort,
  AuthPort,
  ClientShipmentsPort,
  DeliveryPort,
  DocumentsPort,
  DriverApplicantsPort,
  DriverBoardPort,
  DriverProfilePort,
  DriverServicePort,
  DriverStatsPort,
  EventoLog,
  EvidenceStoragePort,
  LocationTransportPort,
  LogTransportPort,
  NotificationsPort,
  NuevoEnvio,
  PublicSitePort,
  QuotePort,
  RatingPort,
  ShipmentsPort,
  TrackingPort,
  VehiclesPort,
  ZonesPort,
} from '../../ports';
import { ApiError } from '../../http/api-error';
import { apiUrl } from './api-url';
import {
  ApiConductor,
  ApiContacto,
  ApiEnvio,
  ApiEnvioAdmin,
  ApiNotificacion,
  ApiPerfil,
  ApiSeguimiento,
  ApiUsuarioLogin,
} from './backend.types';
import {
  aCategoria,
  aContacto,
  aEnvio,
  aEnvioAdmin,
  aEstadoAprobacion,
  aNotificacion,
  aPerfil,
  aPostulante,
  aSeguimiento,
  aUsuario,
} from './mappers';

interface ApiZona {
  id_zona: number;
  nombre_zona: string;
  tarifa_base: number | string;
}

function aZona(z: ApiZona): Zona {
  return { id: z.id_zona, nombre: z.nombre_zona, tarifaBase: Number(z.tarifa_base) };
}

function validarId(id: number): void {
  if (!esIdValido(id)) throw new ApiError(400, `Id de envío inválido: ${id}`);
}

interface RespuestaDocumento {
  documento: { id: number; url_archivo: string; tipo_documento: TipoDocumento };
}

// ---------------------------------------------------------------- Autenticación y catálogo

@Injectable({ providedIn: 'root' })
export class HttpAuthAdapter implements AuthPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async registrar(d: RegistroUsuario) {
    const r = await firstValueFrom(
      this.http.post<{ user: { id: number; correo: string; nombre: string } }>(
        this.url('/auth/register'),
        {
          nombre: d.nombre,
          correo: d.correo,
          password: d.password,
          id_rol: Number(d.rol),
        },
      ),
    );
    return r.user;
  }

  async iniciarSesion(
    correo: string,
    password: string,
  ): Promise<{ usuario: Usuario; token: string }> {
    const r = await firstValueFrom(
      this.http.post<{ user: ApiUsuarioLogin; token: string }>(this.url('/auth/login'), {
        correo,
        password,
      }),
    );
    return { usuario: aUsuario(r.user), token: r.token };
  }
}

@Injectable({ providedIn: 'root' })
export class HttpZonesAdapter implements ZonesPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async listar(): Promise<Zona[]> {
    return (await firstValueFrom(this.http.get<ApiZona[]>(this.url('/zonas')))).map(aZona);
  }
}

@Injectable({ providedIn: 'root' })
export class HttpQuoteAdapter implements QuotePort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async cotizar(s: SolicitudCotizacion): Promise<Cotizacion> {
    const r = await firstValueFrom(
      this.http.post<{
        distancia_km: number;
        tarifa_base: number;
        tarifa_total: number;
        duracion_estimada_min?: number;
        distancia_exacta?: boolean;
      }>(this.url('/cotizar/cotizar'), { origen: s.origen, destino: s.destino, id_zona: s.idZona }),
    );
    const c: Cotizacion = {
      distanciaKm: Number(r.distancia_km),
      tarifaBase: Number(r.tarifa_base),
      tarifaTotal: Number(r.tarifa_total),
      moneda: 'COP',
    };
    if (r.duracion_estimada_min !== undefined) c.duracionMin = r.duracion_estimada_min;
    if (r.distancia_exacta !== undefined) c.distanciaExacta = r.distancia_exacta;
    return c;
  }
}

// ---------------------------------------------------------------- Cliente

@Injectable({ providedIn: 'root' })
export class HttpShipmentsAdapter implements ShipmentsPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async crear(e: NuevoEnvio): Promise<Envio> {
    const cuerpo: Record<string, unknown> = {
      origen: e.origen,
      destino: e.destino,
      tipo_carga: e.tipoCarga,
      id_zona: e.idZona,
    };
    if (e.categoria) cuerpo['categoria'] = e.categoria;
    if (e.notas?.trim()) cuerpo['notas'] = e.notas.trim();
    const r = await firstValueFrom(
      this.http.post<{ envio: ApiEnvio }>(this.url('/envios/crear'), cuerpo),
    );
    return aEnvio(r.envio, true);
  }

  async obtener(id: number): Promise<Envio> {
    validarId(id);
    const r = await firstValueFrom(this.http.get<{ envio: ApiEnvio }>(this.url(`/envios/${id}`)));
    return aEnvio(r.envio, true);
  }

  async cancelar(id: number, motivo?: string): Promise<Envio> {
    validarId(id);
    const cuerpo = motivo?.trim() ? { motivo: motivo.trim() } : {};
    const r = await firstValueFrom(
      this.http.post<{ envio: ApiEnvio }>(this.url(`/envios/${id}/cancelar`), cuerpo),
    );
    return aEnvio(r.envio, false);
  }
}

@Injectable({ providedIn: 'root' })
export class HttpTrackingAdapter implements TrackingPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async seguimiento(idEnvio: number): Promise<Seguimiento> {
    validarId(idEnvio);
    const r = await firstValueFrom(
      this.http.get<ApiSeguimiento>(this.url(`/envios/${idEnvio}/seguimiento`)),
    );
    return aSeguimiento(r);
  }
}

@Injectable({ providedIn: 'root' })
export class HttpClientShipmentsAdapter implements ClientShipmentsPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async listar(): Promise<Envio[]> {
    const r = await firstValueFrom(
      this.http.get<{ envios: ApiEnvio[] }>(this.url('/clientes/envios')),
    );
    return r.envios.map((e) => aEnvio(e, true));
  }
}

@Injectable({ providedIn: 'root' })
export class HttpRatingAdapter implements RatingPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async calificar(idEnvio: number, puntuacion: number, comentario?: string) {
    validarId(idEnvio);
    const cuerpo: Record<string, unknown> = { rating: Math.round(puntuacion) };
    if (comentario?.trim()) cuerpo['comentario'] = comentario.trim();
    const r = await firstValueFrom(
      this.http.post<{ envio: { id_envio: number; calificacion: number } }>(
        this.url(`/envios/${idEnvio}/calificar`),
        cuerpo,
      ),
    );
    return { id: r.envio.id_envio, calificacion: Number(r.envio.calificacion) };
  }
}

// ---------------------------------------------------------------- Conductor

@Injectable({ providedIn: 'root' })
export class HttpDriverProfileAdapter implements DriverProfilePort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async obtener(): Promise<PerfilConductor> {
    const r = await firstValueFrom(
      this.http.get<{
        id_conductor: number;
        estado_aprobacion: string;
        motivo_rechazo?: string | null;
        vehiculo?: { id: number; placa: string; categoria: string } | null;
      }>(this.url('/conductores/me')),
    );
    const categoria = aCategoria(r.vehiculo?.categoria);
    return {
      idConductor: r.id_conductor,
      estadoAprobacion: aEstadoAprobacion(r.estado_aprobacion),
      motivoRechazo: r.motivo_rechazo ?? null,
      vehiculo:
        r.vehiculo && categoria
          ? { id: r.vehiculo.id, placa: r.vehiculo.placa, categoria }
          : undefined,
    };
  }
}

@Injectable({ providedIn: 'root' })
export class HttpVehiclesAdapter implements VehiclesPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async registrar(d: { placa: string; categoria: CategoriaVehiculo }): Promise<Vehiculo> {
    const r = await firstValueFrom(
      this.http.post<{ vehicle: { id: number; placa: string; categoria: CategoriaVehiculo } }>(
        this.url('/vehicles/register'),
        { placa: d.placa, categoria: d.categoria },
      ),
    );
    return { id: r.vehicle.id, placa: r.vehicle.placa, categoria: r.vehicle.categoria };
  }
}

@Injectable({ providedIn: 'root' })
export class HttpDocumentsAdapter implements DocumentsPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  subir(archivo: File, tipo: TipoDocumento): Observable<EventoCarga> {
    const form = new FormData();
    form.append('tipo_documento', tipo);
    form.append('archivo', archivo);
    return this.http
      .post<RespuestaDocumento>(this.url('/documentos/upload'), form, {
        reportProgress: true,
        observe: 'events',
      })
      .pipe(
        filter(
          (ev): ev is HttpUploadProgressEvent | HttpResponse<RespuestaDocumento> =>
            ev.type === HttpEventType.UploadProgress || ev.type === HttpEventType.Response,
        ),
        map((ev): EventoCarga => {
          if (ev.type === HttpEventType.UploadProgress) {
            return {
              tipo: 'progreso',
              porcentaje: ev.total ? Math.round((100 * ev.loaded) / ev.total) : 0,
            };
          }
          const doc = (ev.body as RespuestaDocumento).documento;
          return {
            tipo: 'completo',
            documento: { id: doc.id, tipo: doc.tipo_documento, urlArchivo: doc.url_archivo },
          };
        }),
      );
  }
}

@Injectable({ providedIn: 'root' })
export class HttpDriverBoardAdapter implements DriverBoardPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async disponibles(): Promise<Envio[]> {
    const r = await firstValueFrom(
      this.http.get<{ envios: ApiEnvio[] }>(this.url('/conductores/envios/disponibles')),
    );
    return r.envios.map((e) => aEnvio(e, false));
  }
}

/** Vista del conductor: descarta siempre pin_seguridad (RN_HIS_001). */
@Injectable({ providedIn: 'root' })
export class HttpDriverServiceAdapter implements DriverServicePort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async aceptar(idEnvio: number): Promise<Envio> {
    validarId(idEnvio);
    const r = await firstValueFrom(
      this.http.post<{ envio: ApiEnvio }>(this.url('/envios/aceptar'), { id_envio: idEnvio }),
    );
    return aEnvio(r.envio, false);
  }

  async obtener(idEnvio: number): Promise<Envio> {
    validarId(idEnvio);
    const r = await firstValueFrom(
      this.http.get<{ envio: ApiEnvio }>(this.url(`/envios/${idEnvio}`)),
    );
    return aEnvio(r.envio, false);
  }

  async activo(): Promise<Envio | null> {
    const r = await firstValueFrom(
      this.http.get<{ envio: ApiEnvio | null }>(this.url('/conductores/envios/activo')),
    );
    return r.envio ? aEnvio(r.envio, false) : null;
  }

  async iniciarRuta(idEnvio: number): Promise<Envio> {
    validarId(idEnvio);
    const r = await firstValueFrom(
      this.http.post<{ envio: ApiEnvio }>(this.url(`/envios/${idEnvio}/iniciar-ruta`), {}),
    );
    return aEnvio(r.envio, false);
  }
}

@Injectable({ providedIn: 'root' })
export class HttpEvidenceAdapter implements EvidenceStoragePort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async subir(idEnvio: number, foto: File): Promise<string> {
    validarId(idEnvio);
    const form = new FormData();
    form.append('archivo', foto);
    const r = await firstValueFrom(
      this.http.post<{ url_foto: string }>(this.url(`/envios/${idEnvio}/evidencia`), form),
    );
    return r.url_foto;
  }
}

@Injectable({ providedIn: 'root' })
export class HttpDeliveryAdapter implements DeliveryPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async validar(idEnvio: number, urlFoto: string, pin: string) {
    validarId(idEnvio);
    const r = await firstValueFrom(
      this.http.post<{ envio: { id_envio: number; url_foto: string } }>(
        this.url(`/envios/${idEnvio}/validar-entrega`),
        { url_foto: urlFoto, pin_seguridad: pin },
      ),
    );
    return { id: r.envio.id_envio, estado: 'Entregado' as const, urlFoto: r.envio.url_foto };
  }
}

@Injectable({ providedIn: 'root' })
export class HttpLocationAdapter implements LocationTransportPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async enviar(idEnvio: number, u: Ubicacion): Promise<void> {
    await firstValueFrom(
      this.http.post(this.url(`/envios/${idEnvio}/ubicacion`), {
        lat: u.lat,
        lon: u.lon,
        capturado_en: u.capturadoEn,
      }),
    );
  }

  async ultima(idEnvio: number): Promise<Ubicacion | null> {
    const r = await firstValueFrom(
      this.http.get<{ lat: number; lon: number; capturado_en: string } | null>(
        this.url(`/envios/${idEnvio}/ubicacion`),
      ),
    );
    return r ? { lat: r.lat, lon: r.lon, capturadoEn: r.capturado_en } : null;
  }
}

// ---------------------------------------------------------------- Administración

@Injectable({ providedIn: 'root' })
export class HttpDriverApplicantsAdapter implements DriverApplicantsPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async listarPendientes(): Promise<ConductorPostulante[]> {
    const r = await firstValueFrom(
      this.http.get<ApiConductor[]>(this.url('/conductores/pendientes')),
    );
    return r.map(aPostulante);
  }
}

@Injectable({ providedIn: 'root' })
export class HttpApprovalAdapter implements ApprovalPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async decidir(
    idConductor: number,
    aprobado: boolean,
    motivo?: string,
  ): Promise<ConductorPostulante> {
    const cuerpo: Record<string, unknown> = { driverId: idConductor, approved: aprobado };
    if (!aprobado && motivo) cuerpo['observation'] = motivo;
    const r = await firstValueFrom(
      this.http.post<{ driver: ApiConductor }>(this.url('/conductores/aprobar'), cuerpo),
    );
    return aPostulante(r.driver);
  }
}

@Injectable({ providedIn: 'root' })
export class HttpAdminMetricsAdapter implements AdminMetricsPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  metricas(): Promise<MetricasAdmin> {
    return firstValueFrom(this.http.get<MetricasAdmin>(this.url('/admin/dashboard/metrics')));
  }

  async auditoria(f: FiltroAuditoria): Promise<Pagina<RegistroAuditoria>> {
    const params: Record<string, string> = { pagina: String(f.pagina), tamano: String(f.tamano) };
    if (f.texto) params['texto'] = f.texto;
    if (f.accion) params['accion'] = f.accion;
    const r = await firstValueFrom(
      this.http.get<Pagina<Omit<RegistroAuditoria, 'fecha'> & { fecha: string }>>(
        this.url('/admin/auditoria'),
        { params },
      ),
    );
    return { ...r, items: r.items.map((i) => ({ ...i, fecha: new Date(i.fecha) })) };
  }
}

// ---------------------------------------------------------------- Conductor: resumen e historial

@Injectable({ providedIn: 'root' })
export class HttpDriverStatsAdapter implements DriverStatsPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async resumen(): Promise<ResumenConductor> {
    const r = await firstValueFrom(
      this.http.get<{
        completados: number;
        ingresos_total: number;
        ingresos_mes: number;
        calificacion_promedio: number | null;
        total_calificaciones: number;
        servicio_activo: number | null;
      }>(this.url('/conductores/me/resumen')),
    );
    return {
      completados: r.completados,
      ingresosTotal: r.ingresos_total,
      ingresosMes: r.ingresos_mes,
      calificacionPromedio: r.calificacion_promedio,
      totalCalificaciones: r.total_calificaciones,
      servicioActivo: r.servicio_activo,
    };
  }

  async historial(): Promise<Envio[]> {
    const r = await firstValueFrom(
      this.http.get<{ envios: ApiEnvio[] }>(this.url('/conductores/envios/historial')),
    );
    return r.envios.map((e) => aEnvio(e, false));
  }
}

// ---------------------------------------------------------------- Cuenta y notificaciones

@Injectable({ providedIn: 'root' })
export class HttpAccountAdapter implements AccountPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async perfil(): Promise<PerfilUsuario> {
    return aPerfil(await firstValueFrom(this.http.get<ApiPerfil>(this.url('/usuarios/me'))));
  }

  async actualizar(datos: { nombre: string; telefono: string }): Promise<PerfilUsuario> {
    const r = await firstValueFrom(
      this.http.patch<{ usuario: ApiPerfil }>(this.url('/usuarios/me'), {
        nombre: datos.nombre,
        telefono: datos.telefono,
      }),
    );
    return aPerfil(r.usuario);
  }

  async cambiarPassword(actual: string, nueva: string): Promise<void> {
    await firstValueFrom(this.http.post(this.url('/usuarios/me/password'), { actual, nueva }));
  }
}

@Injectable({ providedIn: 'root' })
export class HttpNotificationsAdapter implements NotificationsPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async listar(soloNoLeidas = false): Promise<{ noLeidas: number; items: Notificacion[] }> {
    const params: Record<string, string> = { limite: '30' };
    if (soloNoLeidas) params['no_leidas'] = 'true';
    const r = await firstValueFrom(
      this.http.get<{ no_leidas: number; items: ApiNotificacion[] }>(this.url('/notificaciones'), {
        params,
      }),
    );
    return { noLeidas: r.no_leidas, items: r.items.map(aNotificacion) };
  }

  async noLeidas(): Promise<number> {
    const r = await firstValueFrom(
      this.http.get<{ no_leidas: number }>(this.url('/notificaciones/no-leidas')),
    );
    return r.no_leidas;
  }

  async leer(id: number): Promise<void> {
    await firstValueFrom(this.http.post(this.url(`/notificaciones/${id}/leer`), {}));
  }

  async leerTodas(): Promise<void> {
    await firstValueFrom(this.http.post(this.url('/notificaciones/leer-todas'), {}));
  }
}

// ---------------------------------------------------------------- Sitio público

@Injectable({ providedIn: 'root' })
export class HttpPublicSiteAdapter implements PublicSitePort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  estadisticas(): Promise<EstadisticasPublicas> {
    return firstValueFrom(this.http.get<EstadisticasPublicas>(this.url('/publico/estadisticas')));
  }

  async zonas(): Promise<Zona[]> {
    return (await firstValueFrom(this.http.get<ApiZona[]>(this.url('/publico/zonas')))).map(aZona);
  }

  async contactar(m: MensajeContacto): Promise<void> {
    const cuerpo: Record<string, string> = {
      nombre: m.nombre,
      correo: m.correo,
      asunto: m.asunto,
      mensaje: m.mensaje,
    };
    if (m.telefono?.trim()) cuerpo['telefono'] = m.telefono.trim();
    await firstValueFrom(this.http.post(this.url('/contacto'), cuerpo));
  }
}

// ---------------------------------------------------------------- Operación del administrador

@Injectable({ providedIn: 'root' })
export class HttpAdminOperationsAdapter implements AdminOperationsPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async envios(f: FiltroEnviosAdmin): Promise<Pagina<EnvioAdmin>> {
    const params: Record<string, string> = { pagina: String(f.pagina), tamano: String(f.tamano) };
    if (f.estado) params['estado'] = f.estado;
    if (f.idZona) params['id_zona'] = String(f.idZona);
    if (f.texto?.trim()) params['texto'] = f.texto.trim();
    const r = await firstValueFrom(
      this.http.get<Pagina<ApiEnvioAdmin>>(this.url('/admin/envios'), { params }),
    );
    return { ...r, items: r.items.map(aEnvioAdmin) };
  }

  async cancelar(idEnvio: number, motivo: string): Promise<Envio> {
    validarId(idEnvio);
    const r = await firstValueFrom(
      this.http.post<{ envio: ApiEnvio }>(this.url(`/envios/${idEnvio}/cancelar`), { motivo }),
    );
    return aEnvio(r.envio, false);
  }

  async actualizarTarifa(idZona: number, tarifaBase: number): Promise<Zona> {
    const r = await firstValueFrom(
      this.http.put<{ zona: ApiZona }>(this.url(`/admin/zonas/${idZona}`), {
        tarifa_base: tarifaBase,
      }),
    );
    return aZona(r.zona);
  }

  async mensajes(pendientes: boolean, pagina: number): Promise<Pagina<MensajeContactoRecibido>> {
    const params: Record<string, string> = { pagina: String(pagina), tamano: '20' };
    if (pendientes) params['pendientes'] = 'true';
    const r = await firstValueFrom(
      this.http.get<Pagina<ApiContacto>>(this.url('/admin/contactos'), { params }),
    );
    return { ...r, items: r.items.map(aContacto) };
  }

  async atenderMensaje(id: number): Promise<void> {
    await firstValueFrom(this.http.post(this.url(`/admin/contactos/${id}/atender`), {}));
  }
}

// ---------------------------------------------------------------- Logs

/** Logs: usa HttpBackend para saltarse los interceptores (sin token, sin log de sí mismo). */
@Injectable({ providedIn: 'root' })
export class HttpLogTransportAdapter implements LogTransportPort {
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly url = apiUrl();

  async enviar(eventos: EventoLog[]): Promise<void> {
    try {
      await firstValueFrom(this.http.post(this.url('/logs/frontend'), { eventos }));
    } catch (e) {
      const status = (e as { status?: number }).status ?? 0;
      throw new ApiError(status, 'No se pudieron enviar los logs');
    }
  }

  enviarAlSalir(eventos: EventoLog[]): boolean {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function')
      return false;
    const blob = new Blob([JSON.stringify({ eventos })], { type: 'application/json' });
    return navigator.sendBeacon(this.url('/logs/frontend'), blob);
  }
}
