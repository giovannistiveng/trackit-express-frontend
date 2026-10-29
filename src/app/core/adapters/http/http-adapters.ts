import { HttpBackend, HttpClient, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, filter, firstValueFrom, map } from 'rxjs';
import {
  CategoriaVehiculo,
  ConductorPostulante,
  Cotizacion,
  Envio,
  EventoCarga,
  FiltroAuditoria,
  MetricasAdmin,
  Pagina,
  PerfilConductor,
  RegistroAuditoria,
  RegistroUsuario,
  SolicitudCotizacion,
  TipoDocumento,
  Ubicacion,
  Usuario,
  Vehiculo,
  Zona,
  esIdValido,
} from '../../domain';
import {
  AdminMetricsPort,
  ApprovalPort,
  AuthPort,
  ClientShipmentsPort,
  DeliveryPort,
  DocumentsPort,
  DriverApplicantsPort,
  DriverBoardPort,
  DriverProfilePort,
  DriverServicePort,
  EventoLog,
  EvidenceStoragePort,
  LocationTransportPort,
  LogTransportPort,
  NuevoEnvio,
  QuotePort,
  RatingPort,
  RouteStartPort,
  ShipmentsPort,
  VehiclesPort,
  ZonesPort,
} from '../../ports';
import { APP_CONFIG } from '../../config/app-config';
import { ApiError } from '../../http/api-error';
import { apiUrl } from './api-url';
import { ApiConductor, ApiEnvio, ApiUsuarioLogin } from './backend.types';
import { aEnvio, aEstadoAprobacion, aPostulante, aUsuario } from './mappers';

function validarId(id: number): void {
  if (!esIdValido(id)) throw new ApiError(400, `Id de envío inválido: ${id}`);
}

// ---------------------------------------------------------------- Endpoints existentes

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
export class HttpQuoteAdapter implements QuotePort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();
  private readonly flags = inject(APP_CONFIG).features;

  async cotizar(s: SolicitudCotizacion): Promise<Cotizacion> {
    const cuerpo: Record<string, unknown> = {
      origen: s.origen,
      destino: s.destino,
      id_zona: s.idZona,
    };
    if (this.flags.categoriaEnvio && s.categoria) cuerpo['categoria'] = s.categoria;
    const r = await firstValueFrom(
      this.http.post<{ distancia_km: number; tarifa_base: number; tarifa_total: number }>(
        this.url('/cotizar/cotizar'),
        cuerpo,
      ),
    );
    return {
      distanciaKm: Number(r.distancia_km),
      tarifaBase: Number(r.tarifa_base),
      tarifaTotal: Number(r.tarifa_total),
      moneda: 'COP',
    };
  }
}

@Injectable({ providedIn: 'root' })
export class HttpShipmentsAdapter implements ShipmentsPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();
  private readonly flags = inject(APP_CONFIG).features;

  async crear(e: NuevoEnvio): Promise<Envio> {
    const cuerpo: Record<string, unknown> = {
      origen: e.origen,
      destino: e.destino,
      tipo_carga: e.tipoCarga,
      id_cliente: e.idCliente,
      id_zona: e.idZona,
    };
    if (this.flags.categoriaEnvio && e.categoria) cuerpo['categoria'] = e.categoria;
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
}

/** Vista del conductor: descarta siempre pin_seguridad (RN_HIS_001). */
@Injectable({ providedIn: 'root' })
export class HttpDriverServiceAdapter implements DriverServicePort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async aceptar(idEnvio: number, idConductor: number): Promise<Envio> {
    validarId(idEnvio);
    const r = await firstValueFrom(
      this.http.post<{ envio: ApiEnvio }>(this.url('/envios/aceptar'), {
        id_envio: idEnvio,
        id_conductor: idConductor,
      }),
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
}

@Injectable({ providedIn: 'root' })
export class HttpVehiclesAdapter implements VehiclesPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async registrar(d: {
    placa: string;
    categoria: CategoriaVehiculo;
    idConductor: number;
  }): Promise<Vehiculo> {
    const r = await firstValueFrom(
      this.http.post<{ vehicle: { id: number; placa: string; categoria: CategoriaVehiculo } }>(
        this.url('/vehicles/register'),
        {
          placa: d.placa,
          categoria: d.categoria,
          id_conductor: d.idConductor,
        },
      ),
    );
    return { id: r.vehicle.id, placa: r.vehicle.placa, categoria: r.vehicle.categoria };
  }
}

@Injectable({ providedIn: 'root' })
export class HttpDocumentsAdapter implements DocumentsPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  subir(archivo: File, tipo: TipoDocumento, idConductor: number): Observable<EventoCarga> {
    const form = new FormData();
    form.append('archivo', archivo);
    form.append('tipo_documento', tipo);
    form.append('id_conductor', String(idConductor));
    return this.http
      .post<{ documento: { id: number; url_archivo: string; tipo_documento: TipoDocumento } }>(
        this.url('/documentos/upload'),
        form,
        {
          reportProgress: true,
          observe: 'events',
        },
      )
      .pipe(
        filter(
          (ev) => ev.type === HttpEventType.UploadProgress || ev.type === HttpEventType.Response,
        ),
        map((ev): EventoCarga => {
          if (ev.type === HttpEventType.UploadProgress) {
            return {
              tipo: 'progreso',
              porcentaje: ev.total ? Math.round((100 * ev.loaded) / ev.total) : 0,
            };
          }
          const doc = (
            ev as {
              body: {
                documento: { id: number; url_archivo: string; tipo_documento: TipoDocumento };
              };
            }
          ).body.documento;
          return {
            tipo: 'completo',
            documento: { id: doc.id, tipo: doc.tipo_documento, urlArchivo: doc.url_archivo },
          };
        }),
      );
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
        {
          url_foto: urlFoto,
          pin_seguridad: pin,
        },
      ),
    );
    return { id: r.envio.id_envio, estado: 'Entregado' as const, urlFoto: r.envio.url_foto };
  }
}

@Injectable({ providedIn: 'root' })
export class HttpRatingAdapter implements RatingPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async calificar(idEnvio: number, puntuacion: number) {
    validarId(idEnvio);
    const rating = Math.round(puntuacion);
    const r = await firstValueFrom(
      this.http.post<{ envio: { id_envio: number; calificacion: number } }>(
        this.url(`/envios/${idEnvio}/calificar`),
        { rating },
      ),
    );
    return { id: r.envio.id_envio, calificacion: Number(r.envio.calificacion) };
  }
}

@Injectable({ providedIn: 'root' })
export class HttpApprovalAdapter implements ApprovalPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();
  private readonly flags = inject(APP_CONFIG).features;

  async decidir(
    idConductor: number,
    aprobado: boolean,
    motivo?: string,
  ): Promise<ConductorPostulante> {
    const cuerpo: Record<string, unknown> = { driverId: idConductor, approved: aprobado };
    if (!aprobado && motivo && this.flags.motivoRechazo) cuerpo['observation'] = motivo;
    const r = await firstValueFrom(
      this.http.post<{ driver: ApiConductor }>(this.url('/conductores/aprobar'), cuerpo),
    );
    return aPostulante(r.driver);
  }
}

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

// ---------------------------------------------------------------- Contratos propuestos (brechas)

/** Brecha 1: GET /api/conductores/me */
@Injectable({ providedIn: 'root' })
export class HttpDriverProfileAdapter implements DriverProfilePort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async obtener(): Promise<PerfilConductor> {
    const r = await firstValueFrom(
      this.http.get<{
        id_conductor: number;
        estado_aprobacion: string;
        vehiculo?: { id: number; placa: string; categoria: CategoriaVehiculo };
      }>(this.url('/conductores/me')),
    );
    return {
      idConductor: r.id_conductor,
      estadoAprobacion: aEstadoAprobacion(r.estado_aprobacion),
      vehiculo: r.vehiculo
        ? { id: r.vehiculo.id, placa: r.vehiculo.placa, categoria: r.vehiculo.categoria }
        : undefined,
    };
  }
}

/** Brecha 2: GET /api/zonas */
@Injectable({ providedIn: 'root' })
export class HttpZonesAdapter implements ZonesPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async listar(): Promise<Zona[]> {
    const r = await firstValueFrom(
      this.http.get<{ id_zona: number; nombre_zona: string; tarifa_base: number | string }[]>(
        this.url('/zonas'),
      ),
    );
    return r.map((z) => ({
      id: z.id_zona,
      nombre: z.nombre_zona,
      tarifaBase: Number(z.tarifa_base),
    }));
  }
}

/** Brecha 3: GET /api/clientes/envios */
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

  async recordar(): Promise<void> {
    // El backend ya conoce los envíos del cliente.
  }
}

/** Brecha 4: GET /api/conductores/envios/disponibles */
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

/** Brecha 5: POST /api/envios/:id/iniciar-ruta */
@Injectable({ providedIn: 'root' })
export class HttpRouteStartAdapter implements RouteStartPort {
  private readonly http = inject(HttpClient);
  private readonly url = apiUrl();

  async iniciar(idEnvio: number): Promise<Envio> {
    validarId(idEnvio);
    const r = await firstValueFrom(
      this.http.post<{ envio: ApiEnvio }>(this.url(`/envios/${idEnvio}/iniciar-ruta`), {}),
    );
    return aEnvio(r.envio, false);
  }
}

/** Brecha 6: GET /api/conductores/pendientes */
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

/** Brecha 7: POST /api/envios/:id/evidencia (multipart, campo archivo) */
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

/** Alternativa real a la brecha 7: subida directa a Cloudinary con upload preset sin firma. */
@Injectable({ providedIn: 'root' })
export class CloudinaryEvidenceAdapter implements EvidenceStoragePort {
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly cfg = inject(APP_CONFIG).cloudinary;

  async subir(idEnvio: number, foto: File): Promise<string> {
    const form = new FormData();
    form.append('file', foto);
    form.append('upload_preset', this.cfg.uploadPreset);
    form.append('folder', 'trackit/evidencias');
    form.append('public_id', `envio-${idEnvio}-${Date.now()}`);
    try {
      const r = await firstValueFrom(
        this.http.post<{ secure_url: string }>(
          `https://api.cloudinary.com/v1_1/${this.cfg.cloudName}/image/upload`,
          form,
        ),
      );
      return r.secure_url;
    } catch (e) {
      throw new ApiError(
        (e as { status?: number }).status ?? 0,
        'No se pudo subir la foto a Cloudinary',
      );
    }
  }
}

/** Brecha 8: POST/GET /api/envios/:id/ubicacion */
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

/** Brecha 11: GET /api/admin/dashboard/metrics y /api/admin/auditoria */
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
