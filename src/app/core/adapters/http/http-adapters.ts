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
  Billetera,
  Coordenadas,
  Cotizacion,
  DatosZona,
  EstadoPago,
  Liquidacion,
  MensajeChat,
  MetodoPago,
  PagoAdmin,
  PagoResumen,
  Parada,
  SeguimientoPublico,
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
  SugerenciaDireccion,
  TarifaVehiculo,
  TarifasPublicas,
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
  ChatPort,
  ClientShipmentsPort,
  DeliveryPort,
  DocumentsPort,
  DriverApplicantsPort,
  DriverBoardPort,
  DriverProfilePort,
  DriverServicePort,
  DriverStatsPort,
  EdicionEnvio,
  EventoLog,
  EvidenceStoragePort,
  GeoPort,
  LocationTransportPort,
  LogTransportPort,
  NotificationsPort,
  NuevoEnvio,
  PaymentsPort,
  PublicSitePort,
  QuotePort,
  RatingPort,
  RealtimePort,
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
  ApiCotizacion,
  ApiLiquidacion,
  ApiMensaje,
  ApiPago,
  ApiParada,
  ApiSeguimiento,
  ApiSeguimientoPublico,
  ApiTarifaVehiculo,
  ApiUsuarioLogin,
  ApiZona,
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
  aCotizacion,
  aLiquidacion,
  aMensaje,
  aPago,
  aParada,
  aSeguimiento,
  aSeguimientoPublico,
  aTarifaVehiculo,
  aUsuario,
  aZona,
} from './mappers';

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

  async olvidePassword(correo: string): Promise<void> {
    await firstValueFrom(this.http.post(this.url('/auth/olvide-password'), { correo }));
  }

  async restablecerPassword(token: string, nueva: string): Promise<void> {
    await firstValueFrom(this.http.post(this.url('/auth/restablecer-password'), { token, nueva }));
  }

  async verificarCorreo(token: string): Promise<void> {
    await firstValueFrom(this.http.post(this.url('/auth/verificar-correo'), { token }));
  }

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
      this.http.post<ApiCotizacion>(this.url('/cotizar/cotizar'), cuerpoRuta(s)),
    );
    return aCotizacion(r);
  }
}

/** Cuerpo común de cotizar y crear: textos, coordenadas si las hay, zona solo si hace falta. */
function cuerpoRuta(s: SolicitudCotizacion): Record<string, unknown> {
  const cuerpo: Record<string, unknown> = { origen: s.origen, destino: s.destino };
  if (s.idZona) cuerpo['id_zona'] = s.idZona;
  if (s.categoria) cuerpo['categoria'] = s.categoria;
  if (s.origenCoords) cuerpo['origen_coords'] = s.origenCoords;
  if (s.destinoCoords) cuerpo['destino_coords'] = s.destinoCoords;
  if (s.paradas?.length) {
    cuerpo['paradas'] = s.paradas.map((p) => ({
      direccion: p.direccion,
      coords: p.coords,
      notas: p.notas || undefined,
    }));
  }
  if (s.idaYVuelta) cuerpo['ida_y_vuelta'] = true;
  if (s.fechaProgramada) cuerpo['fecha_programada'] = s.fechaProgramada.toISOString();
  return cuerpo;
}

@Injectable({ providedIn: 'root' })
export class HttpGeoAdapter implements GeoPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async buscar(texto: string): Promise<SugerenciaDireccion[]> {
    const q = texto.trim();
    if (q.length < 3) return [];
    const r = await firstValueFrom(
      this.http.get<{ resultados: SugerenciaDireccion[] }>(this.url('/geo/buscar'), {
        params: { q },
      }),
    );
    return r.resultados;
  }

  async inversa(p: Coordenadas): Promise<SugerenciaDireccion | null> {
    const r = await firstValueFrom(
      this.http.get<{ resultado: SugerenciaDireccion | null }>(this.url('/geo/inversa'), {
        params: { lat: String(p.lat), lon: String(p.lon) },
      }),
    );
    return r.resultado;
  }
}

// ---------------------------------------------------------------- Cliente

@Injectable({ providedIn: 'root' })
export class HttpShipmentsAdapter implements ShipmentsPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async editar(id: number, c: EdicionEnvio): Promise<Envio> {
    validarId(id);
    const cuerpo: Record<string, unknown> = {};
    if (c.tipoCarga !== undefined) cuerpo['tipo_carga'] = c.tipoCarga;
    if (c.notas !== undefined) cuerpo['notas'] = c.notas;
    if (c.destinatarioNombre !== undefined) cuerpo['destinatario_nombre'] = c.destinatarioNombre;
    if (c.destinatarioTelefono !== undefined)
      cuerpo['destinatario_telefono'] = c.destinatarioTelefono;
    const r = await firstValueFrom(
      this.http.patch<{ envio: ApiEnvio }>(this.url(`/envios/${id}`), cuerpo),
    );
    return aEnvio(r.envio, true);
  }

  async crear(e: NuevoEnvio): Promise<Envio> {
    const cuerpo: Record<string, unknown> = { ...cuerpoRuta(e), tipo_carga: e.tipoCarga };
    if (e.notas?.trim()) cuerpo['notas'] = e.notas.trim();
    if (e.metodoPago) cuerpo['metodo_pago'] = e.metodoPago;
    if (e.metodoPago === 'nequi') cuerpo['telefono_nequi'] = e.telefonoNequi;
    if (e.destinatarioNombre?.trim()) cuerpo['destinatario_nombre'] = e.destinatarioNombre.trim();
    if (e.destinatarioTelefono?.trim())
      cuerpo['destinatario_telefono'] = e.destinatarioTelefono.trim();
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

  async recoger(idEnvio: number, foto: File): Promise<Envio> {
    validarId(idEnvio);
    const datos = new FormData();
    datos.append('archivo', foto, foto.name);
    const r = await firstValueFrom(
      this.http.post<{ envio: ApiEnvio }>(this.url(`/envios/${idEnvio}/recogida`), datos),
    );
    return aEnvio(r.envio, false);
  }

  async completarParada(idEnvio: number, idParada: number): Promise<Parada[]> {
    validarId(idEnvio);
    const r = await firstValueFrom(
      this.http.post<{ paradas: ApiParada[] }>(
        this.url(`/envios/${idEnvio}/paradas/${idParada}/completar`),
        {},
      ),
    );
    return r.paradas.map(aParada);
  }

  async llegadaDestino(idEnvio: number): Promise<Envio> {
    validarId(idEnvio);
    const r = await firstValueFrom(
      this.http.post<{ envio: ApiEnvio }>(this.url(`/envios/${idEnvio}/llegada-destino`), {}),
    );
    return aEnvio(r.envio, false);
  }

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

  async validar(idEnvio: number, urlFoto: string, pin: string, efectivoRecibido?: boolean) {
    validarId(idEnvio);
    const r = await firstValueFrom(
      this.http.post<{ envio: { id_envio: number; url_foto: string } }>(
        this.url(`/envios/${idEnvio}/validar-entrega`),
        efectivoRecibido === undefined
          ? { url_foto: urlFoto, pin_seguridad: pin }
          : { url_foto: urlFoto, pin_seguridad: pin, efectivo_recibido: efectivoRecibido },
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

  async billetera(): Promise<Billetera> {
    const r = await firstValueFrom(
      this.http.get<{
        pendiente: {
          servicios: number;
          ganancia_nequi: number;
          cobrado_efectivo: number;
          comision_efectivo: number;
          saldo: number;
        };
        movimientos: {
          id_envio: number;
          fecha: string;
          metodo: string;
          tarifa: number;
          ganancia: number;
        }[];
        liquidaciones: ApiLiquidacion[];
      }>(this.url('/conductores/me/billetera')),
    );
    return {
      pendiente: {
        servicios: r.pendiente.servicios,
        gananciaNequi: r.pendiente.ganancia_nequi,
        cobradoEfectivo: r.pendiente.cobrado_efectivo,
        comisionEfectivo: r.pendiente.comision_efectivo,
        saldo: r.pendiente.saldo,
      },
      movimientos: r.movimientos.map((m) => ({
        idEnvio: m.id_envio,
        fecha: new Date(m.fecha),
        metodo: m.metodo === 'nequi' ? 'nequi' : 'efectivo',
        tarifa: m.tarifa,
        ganancia: m.ganancia,
      })),
      liquidaciones: r.liquidaciones.map(aLiquidacion),
    };
  }

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

  async reenviarVerificacion(): Promise<boolean> {
    const r = await firstValueFrom(
      this.http.post<{ enviado: boolean }>(this.url('/usuarios/me/verificacion'), {}),
    );
    return r.enviado;
  }

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

  async borrar(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(this.url(`/notificaciones/${id}`)));
  }

  async borrarLeidas(): Promise<number> {
    const r = await firstValueFrom(
      this.http.delete<{ borradas: number }>(this.url('/notificaciones')),
    );
    return r.borradas;
  }

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

  async seguimiento(token: string): Promise<SeguimientoPublico> {
    const r = await firstValueFrom(
      this.http.get<ApiSeguimientoPublico>(
        this.url(`/publico/seguimiento/${encodeURIComponent(token)}`),
      ),
    );
    return aSeguimientoPublico(r);
  }

  estadisticas(): Promise<EstadisticasPublicas> {
    return firstValueFrom(this.http.get<EstadisticasPublicas>(this.url('/publico/estadisticas')));
  }

  async zonas(): Promise<Zona[]> {
    return (await firstValueFrom(this.http.get<ApiZona[]>(this.url('/publico/zonas')))).map(aZona);
  }

  async tarifas(): Promise<TarifasPublicas> {
    const r = await firstValueFrom(
      this.http.get<{
        tarifas: ApiTarifaVehiculo[];
        recargo_nocturno: number;
        horario_nocturno: string;
      }>(this.url('/publico/tarifas')),
    );
    return {
      tarifas: r.tarifas.map(aTarifaVehiculo),
      recargoNocturno: r.recargo_nocturno,
      horarioNocturno: r.horario_nocturno,
    };
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

  async borrarMensaje(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(this.url(`/admin/contactos/${id}`)));
  }

  async borrarZona(idZona: number): Promise<'borrada' | 'archivada'> {
    const r = await firstValueFrom(
      this.http.delete<{ resultado: 'borrada' | 'archivada' }>(this.url(`/admin/zonas/${idZona}`)),
    );
    return r.resultado;
  }

  async pagos(f: {
    metodo?: MetodoPago;
    estado?: EstadoPago;
    pagina: number;
  }): Promise<Pagina<PagoAdmin>> {
    const params: Record<string, string> = { pagina: String(f.pagina), tamano: '20' };
    if (f.metodo) params['metodo'] = f.metodo;
    if (f.estado) params['estado'] = f.estado;
    const r = await firstValueFrom(
      this.http.get<
        Pagina<
          ApiPago & { id_envio: number; cliente_nombre: string; origen: string; destino: string }
        >
      >(this.url('/admin/pagos'), { params }),
    );
    return {
      ...r,
      items: r.items.map((p) => ({
        ...aPago(p),
        idEnvio: p.id_envio,
        cliente: p.cliente_nombre,
        origen: p.origen,
        destino: p.destino,
      })),
    };
  }

  async reembolsar(idEnvio: number): Promise<PagoResumen> {
    const r = await firstValueFrom(
      this.http.post<{ pago: ApiPago }>(this.url(`/admin/pagos/${idEnvio}/reembolso`), {}),
    );
    return aPago(r.pago);
  }

  async liquidaciones(f: {
    estado?: 'pendiente' | 'pagada';
    pagina: number;
  }): Promise<Pagina<Liquidacion>> {
    const params: Record<string, string> = { pagina: String(f.pagina), tamano: '20' };
    if (f.estado) params['estado'] = f.estado;
    const r = await firstValueFrom(
      this.http.get<Pagina<ApiLiquidacion>>(this.url('/admin/liquidaciones'), { params }),
    );
    return { ...r, items: r.items.map(aLiquidacion) };
  }

  async generarLiquidaciones(hasta?: string): Promise<Liquidacion[]> {
    const r = await firstValueFrom(
      this.http.post<{ liquidaciones: ApiLiquidacion[] }>(
        this.url('/admin/liquidaciones/generar'),
        hasta ? { hasta } : {},
      ),
    );
    return r.liquidaciones.map(aLiquidacion);
  }

  async pagarLiquidacion(id: number, referencia: string): Promise<Liquidacion> {
    const r = await firstValueFrom(
      this.http.post<{ liquidacion: ApiLiquidacion }>(
        this.url(`/admin/liquidaciones/${id}/pagar`),
        { referencia },
      ),
    );
    return aLiquidacion(r.liquidacion);
  }

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

  async zonas(): Promise<Zona[]> {
    return (await firstValueFrom(this.http.get<ApiZona[]>(this.url('/admin/zonas')))).map(aZona);
  }

  async crearZona(d: DatosZona): Promise<Zona> {
    const r = await firstValueFrom(
      this.http.post<{ zona: ApiZona }>(this.url('/admin/zonas'), cuerpoZona(d)),
    );
    return aZona(r.zona);
  }

  async actualizarZona(idZona: number, cambios: Partial<DatosZona>): Promise<Zona> {
    const r = await firstValueFrom(
      this.http.put<{ zona: ApiZona }>(this.url(`/admin/zonas/${idZona}`), cuerpoZona(cambios)),
    );
    return aZona(r.zona);
  }

  async tarifasVehiculo(): Promise<TarifaVehiculo[]> {
    const r = await firstValueFrom(
      this.http.get<{ tarifas: ApiTarifaVehiculo[] }>(this.url('/publico/tarifas')),
    );
    return r.tarifas.map(aTarifaVehiculo);
  }

  async actualizarTarifaVehiculo(t: TarifaVehiculo): Promise<TarifaVehiculo> {
    const r = await firstValueFrom(
      this.http.put<{ tarifa: ApiTarifaVehiculo }>(
        this.url(`/admin/tarifas/${encodeURIComponent(t.categoria)}`),
        { banderazo: t.banderazo, por_km: t.porKm, por_minuto: t.porMinuto, minimo: t.minimo },
      ),
    );
    return aTarifaVehiculo(r.tarifa);
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

/** Cuerpo de zona para el backend; solo los campos presentes. */
function cuerpoZona(d: Partial<DatosZona>): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (d.nombre !== undefined) c['nombre_zona'] = d.nombre;
  if (d.tarifaBase !== undefined) c['recargo'] = d.tarifaBase;
  if (d.centro !== undefined) c['centro'] = d.centro;
  if (d.radioKm !== undefined) c['radio_km'] = d.radioKm;
  if (d.activa !== undefined) c['activa'] = d.activa;
  if (d.descripcion !== undefined) c['descripcion'] = d.descripcion ?? '';
  return c;
}

// ---------------------------------------------------------------- Pagos, chat y tiempo real

@Injectable({ providedIn: 'root' })
export class HttpPaymentsAdapter implements PaymentsPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async estado(idEnvio: number): Promise<PagoResumen> {
    validarId(idEnvio);
    return aPago(await firstValueFrom(this.http.get<ApiPago>(this.url(`/envios/${idEnvio}/pago`))));
  }

  async reintentar(idEnvio: number, telefono?: string): Promise<PagoResumen> {
    validarId(idEnvio);
    const r = await firstValueFrom(
      this.http.post<{ pago: ApiPago }>(
        this.url(`/envios/${idEnvio}/pago/reintentar`),
        telefono ? { telefono } : {},
      ),
    );
    return aPago(r.pago);
  }

  async pagarEnEfectivo(idEnvio: number): Promise<PagoResumen> {
    validarId(idEnvio);
    const r = await firstValueFrom(
      this.http.post<{ pago: ApiPago }>(this.url(`/envios/${idEnvio}/pago/efectivo`), {}),
    );
    return aPago(r.pago);
  }
}

@Injectable({ providedIn: 'root' })
export class HttpChatAdapter implements ChatPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async mensajes(idEnvio: number): Promise<{ abierto: boolean; mensajes: MensajeChat[] }> {
    validarId(idEnvio);
    const r = await firstValueFrom(
      this.http.get<{ abierto: boolean; mensajes: ApiMensaje[] }>(
        this.url(`/envios/${idEnvio}/mensajes`),
      ),
    );
    return { abierto: r.abierto, mensajes: r.mensajes.map(aMensaje) };
  }

  async enviar(idEnvio: number, texto: string): Promise<MensajeChat> {
    validarId(idEnvio);
    return aMensaje(
      await firstValueFrom(
        this.http.post<ApiMensaje>(this.url(`/envios/${idEnvio}/mensajes`), { texto }),
      ),
    );
  }
}

@Injectable({ providedIn: 'root' })
export class HttpRealtimeAdapter implements RealtimePort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async ticket(): Promise<string> {
    return (
      await firstValueFrom(this.http.post<{ ticket: string }>(this.url('/eventos/ticket'), {}))
    ).ticket;
  }

  /** ngsw-bypass: el service worker de Angular no debe intervenir el flujo de eventos (SSE). */
  urlEventos(ticket: string): string {
    return `${this.url('/eventos')}?ticket=${encodeURIComponent(ticket)}&ngsw-bypass=true`;
  }

  async clavePush(): Promise<string | null> {
    return (
      await firstValueFrom(this.http.get<{ clave: string | null }>(this.url('/push/clave-publica')))
    ).clave;
  }

  async suscribirPush(datos: Parameters<RealtimePort['suscribirPush']>[0]): Promise<void> {
    await firstValueFrom(this.http.post(this.url('/push/suscripciones'), datos));
  }

  async desuscribirPush(endpoint: string): Promise<void> {
    await firstValueFrom(this.http.delete(this.url('/push/suscripciones'), { body: { endpoint } }));
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
