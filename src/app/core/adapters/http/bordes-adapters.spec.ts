import {
  HttpErrorResponse,
  HttpEvent,
  HttpEventType,
  HttpRequest,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { apiEnvio } from '../../../../testing/fixtures';
import { API_BASE, configPrueba, provideFakesBase } from '../../../../testing/fakes';
import { apiInterceptor } from '../../http/api.interceptor';
import { ApiError } from '../../http/api-error';
import { EventoCarga } from '../../domain';
import * as http from './http-adapters';
import { apiUrl } from './api-url';
import { LocalForageAdapter, LocalStorageSessionAdapter } from '../local/browser-storage';
import { aEnvio, aSeguimientoPublico, aTarifaVehiculo, aUsuario } from './mappers';

function preparar() {
  TestBed.configureTestingModule({
    providers: [
      provideFakesBase(configPrueba()),
      provideHttpClient(withInterceptors([apiInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return TestBed.inject(HttpTestingController);
}

async function esperar(ctrl: HttpTestingController, metodo: string, url: string) {
  await Promise.resolve();
  return ctrl.expectOne((r) => r.method === metodo && r.urlWithParams === url);
}

describe('Adaptadores HTTP: casos de borde', () => {
  let ctrl: HttpTestingController;
  beforeEach(() => (ctrl = preparar()));
  afterEach(() => ctrl.verify());

  it('crear sin tipo de carga ni notas no los envía', async () => {
    const p = TestBed.inject(http.HttpShipmentsAdapter).crear({
      origen: 'A',
      destino: 'B',
      idZona: 1,
    });
    const req = await esperar(ctrl, 'POST', `${API_BASE}/envios/crear`);
    expect(req.request.body).toEqual({ origen: 'A', destino: 'B', id_zona: 1 });
    req.flush({ envio: apiEnvio() }, { status: 201, statusText: 'Created' });
    await p;
  });

  it('perfil del conductor con requisitos', async () => {
    const p = TestBed.inject(http.HttpDriverProfileAdapter).obtener();
    (await esperar(ctrl, 'GET', `${API_BASE}/conductores/me`)).flush({
      id_conductor: 1,
      estado_aprobacion: 'Pendiente',
      vehiculo: null,
      requisitos: { completo: false, pendientes: ['Falta SOAT'], items: [] },
    });
    expect((await p).requisitos?.pendientes).toEqual(['Falta SOAT']);
  });

  it('progreso de subida sin total conocido', () => {
    const eventos: EventoCarga[] = [];
    TestBed.inject(http.HttpDocumentsAdapter)
      .subir(new File(['x'], 'c.jpg', { type: 'image/jpeg' }), 'Cédula')
      .subscribe((e) => eventos.push(e));
    const req = ctrl.expectOne(`${API_BASE}/documentos/upload`);
    req.event({ type: HttpEventType.UploadProgress, loaded: 10 });
    req.flush({ documento: { id: 9, url_archivo: 'https://c/x.jpg', tipo_documento: 'Cédula' } });
    expect(eventos[0]).toEqual({ tipo: 'progreso', porcentaje: 0 });
  });

  it('auditoría sin filtros y zona sin cambiar "activa"', async () => {
    const a = TestBed.inject(http.HttpAdminMetricsAdapter).auditoria({ pagina: 1, tamano: 15 });
    (await esperar(ctrl, 'GET', `${API_BASE}/admin/auditoria?pagina=1&tamano=15`)).flush({
      items: [],
      total: 0,
      pagina: 1,
      tamano: 15,
    });
    await a;
    const z = TestBed.inject(http.HttpAdminOperationsAdapter).actualizarZona(9, {
      nombre: 'Pasca',
    });
    const rz = await esperar(ctrl, 'PUT', `${API_BASE}/admin/zonas/9`);
    expect(rz.request.body).toEqual({ nombre_zona: 'Pasca' });
    rz.flush({ zona: { id_zona: 9, nombre_zona: 'Pasca', tarifa_base: 0 } });
    await z;
  });
});

describe('mappers: casos de borde', () => {
  it('usuario con correo verificado, envío con fecha, efectivo y sin pago', () => {
    expect(
      aUsuario({ id: 1, nombre: 'A', correo: 'a@t.co', rol: '2', correo_verificado: true })
        .correoVerificado,
    ).toBe(true);
    const e = aEnvio(
      apiEnvio({ fecha_creacion: '2026-11-01T10:00:00Z', metodo_pago: 'efectivo', pago: null }),
      false,
    );
    expect(e.fechaCreacion).toBeInstanceOf(Date);
    expect(e.metodoPago).toBe('efectivo');
    expect(e.pago).toBeNull();
  });

  it('una categoría desconocida se toma como moto; el seguimiento público con mapa', () => {
    expect(
      aTarifaVehiculo({ categoria: 'Bicicleta', banderazo: 1, por_km: 1, por_minuto: 1, minimo: 1 })
        .categoria,
    ).toBe('Moto Express');
    const s = aSeguimientoPublico({
      codigo: 7,
      estado: 'En Ruta',
      origen: 'A',
      destino: 'B',
      destinatario: null,
      fecha_programada: null,
      ida_y_vuelta: false,
      historial: [],
      conductor: null,
      paradas: [],
      mapa: {
        id_envio: 7,
        estado: 'En Ruta',
        origen: { direccion: 'A', coords: null },
        destino: { direccion: 'B', coords: null },
        ultima_ubicacion: null,
        recorrido: [],
        en_vivo: false,
        distancia_restante_km: null,
        eta_minutos: null,
      },
    });
    expect(s.mapa?.idEnvio).toBe(7);
  });
});

describe('apiInterceptor: errores que no son HTTP', () => {
  const pasar = (req: HttpRequest<unknown>, error: unknown) =>
    TestBed.runInInjectionContext(() =>
      firstValueFrom(apiInterceptor(req, () => throwError(() => error))),
    );

  beforeEach(() =>
    TestBed.configureTestingModule({ providers: [provideFakesBase(configPrueba())] }),
  );

  it('conserva un ApiError, traduce un Error y un valor cualquiera', async () => {
    const req = new HttpRequest('POST', API_BASE, {});
    await expect(pasar(req, new ApiError(409, 'Conflicto'))).rejects.toMatchObject({ status: 409 });
    await expect(pasar(req, new Error('roto'))).rejects.toMatchObject({
      status: -1,
      message: 'roto',
    });
    await expect(pasar(req, 'raro')).rejects.toMatchObject({
      status: -1,
      message: 'Error desconocido',
    });
    await expect(
      pasar(req, new HttpErrorResponse({ status: 500, error: null })),
    ).rejects.toMatchObject({ status: 500 });
  });

  it('las peticiones fuera de la API pasan sin cambios', async () => {
    const req = new HttpRequest('GET', 'https://otro.co/x');
    const r = await TestBed.runInInjectionContext(() =>
      firstValueFrom(apiInterceptor(req, () => of({ type: 0 } as HttpEvent<unknown>))),
    );
    expect(r).toEqual({ type: 0 });
  });
});

describe('almacenamiento local, URL de la API y baliza', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({ providers: [provideFakesBase(configPrueba())] }),
  );

  it('los adaptadores del navegador se crean por inyección', async () => {
    const sesion = TestBed.inject(LocalStorageSessionAdapter);
    sesion.guardar('k', 'v');
    expect(sesion.leer('k')).toBe('v');
    sesion.borrar('k');
    const kv = TestBed.inject(LocalForageAdapter);
    expect(kv).toBeInstanceOf(LocalForageAdapter);
  });

  it('agrega la barra a una ruta sin ella', () => {
    const url = TestBed.runInInjectionContext(() => apiUrl());
    expect(url('envios')).toBe(`${API_BASE}/envios`);
  });

  it('sin sendBeacon no se puede enviar al salir', () => {
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true });
    expect(TestBed.inject(http.HttpLogTransportAdapter).enviarAlSalir([])).toBe(false);
  });
});
