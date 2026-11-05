import { HttpEventType, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API, apiEnvio } from '../../../../testing/fixtures';
import { API_BASE, configPrueba, provideFakesBase } from '../../../../testing/fakes';
import { apiInterceptor } from '../../http/api.interceptor';
import { ApiError } from '../../http/api-error';
import { EventoCarga } from '../../domain';
import * as http from './http-adapters';
import { aEnvio, aEstado, aEstadoAprobacion, aPostulante, aRol } from './mappers';

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

/** Espera a que la petición salga (las promesas se crean de forma asíncrona). */
async function esperar(ctrl: HttpTestingController, metodo: string, url: string) {
  await Promise.resolve();
  return ctrl.expectOne((r) => r.method === metodo && r.urlWithParams === url);
}

describe('Adaptadores HTTP', () => {
  let ctrl: HttpTestingController;
  afterEach(() => ctrl.verify());

  describe('HttpAuthAdapter', () => {
    beforeEach(() => (ctrl = preparar()));

    it('debería registrar con nombre, correo, password e id_rol numérico', async () => {
      const p = TestBed.inject(http.HttpAuthAdapter).registrar({
        nombre: 'Cli',
        correo: 'cli@t.co',
        password: 'Clave1234',
        rol: '3',
      });
      const req = await esperar(ctrl, 'POST', `${API_BASE}/auth/register`);
      expect(req.request.body).toEqual({
        nombre: 'Cli',
        correo: 'cli@t.co',
        password: 'Clave1234',
        id_rol: 3,
      });
      req.flush(API.registro, { status: 201, statusText: 'Created' });
      expect(await p).toEqual({ id: 1, correo: 'cli@t.co', nombre: 'Cli' });
    });

    it('debería iniciar sesión y mapear el rol', async () => {
      const p = TestBed.inject(http.HttpAuthAdapter).iniciarSesion('cli@t.co', 'x');
      const req = await esperar(ctrl, 'POST', `${API_BASE}/auth/login`);
      expect(req.request.body).toEqual({ correo: 'cli@t.co', password: 'x' });
      req.flush(API.login('tok'));
      expect(await p).toEqual({
        usuario: { id: 1, nombre: 'Cli', correo: 'cli@t.co', rol: '2' },
        token: 'tok',
      });
    });

    it('debería convertir un 400 en ApiError con el texto del backend', async () => {
      const p = TestBed.inject(http.HttpAuthAdapter).registrar({
        nombre: 'a',
        correo: 'b@c.co',
        password: 'Clave1234',
        rol: '2',
      });
      (await esperar(ctrl, 'POST', `${API_BASE}/auth/register`)).flush(API.errores.correo, {
        status: 400,
        statusText: 'Bad Request',
      });
      await expect(p).rejects.toMatchObject({
        status: 400,
        message: 'El correo ya está registrado',
      });
    });
  });

  describe('HttpQuoteAdapter', () => {
    it('debería enviar origen, destino e id_zona y mapear la respuesta', async () => {
      ctrl = preparar();
      const p = TestBed.inject(http.HttpQuoteAdapter).cotizar({
        origen: 'A',
        destino: 'B',
        idZona: 1,
      });
      const req = await esperar(ctrl, 'POST', `${API_BASE}/cotizar/cotizar`);
      expect(req.request.body).toEqual({ origen: 'A', destino: 'B', id_zona: 1 });
      req.flush(API.cotizar);
      expect(await p).toEqual({
        distanciaKm: 34.5,
        tarifaBase: 5000,
        tarifaTotal: 39500,
        moneda: 'COP',
      });
    });

    it('debería convertir un 404 de zona en ApiError', async () => {
      ctrl = preparar();
      const p = TestBed.inject(http.HttpQuoteAdapter).cotizar({
        origen: 'A',
        destino: 'B',
        idZona: 99,
      });
      (await esperar(ctrl, 'POST', `${API_BASE}/cotizar/cotizar`)).flush(
        { error: 'Zona no encontrada' },
        { status: 404, statusText: 'Not Found' },
      );
      await expect(p).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe('HttpShipmentsAdapter', () => {
    beforeEach(() => (ctrl = preparar()));

    it('debería crear con los campos exactos y conservar el PIN', async () => {
      const p = TestBed.inject(http.HttpShipmentsAdapter).crear({
        origen: 'Casco Urbano',
        destino: 'Silvania',
        tipoCarga: 'Documentos',
        idZona: 1,
      });
      const req = await esperar(ctrl, 'POST', `${API_BASE}/envios/crear`);
      expect(req.request.body).toEqual({
        origen: 'Casco Urbano',
        destino: 'Silvania',
        tipo_carga: 'Documentos',
        id_zona: 1,
      });
      req.flush(API.crear, { status: 201, statusText: 'Created' });
      const e = await p;
      expect(e).toMatchObject({
        id: 2,
        pin: '6175',
        tarifa: 39500,
        estado: 'Pendiente',
        idConductor: null,
        tipoCarga: 'Documentos',
      });
    });

    it('debería enviar la categoría solo cuando el cliente la elige', async () => {
      void TestBed.inject(http.HttpShipmentsAdapter).crear({
        origen: 'a',
        destino: 'b',
        tipoCarga: 'c',
        idZona: 1,
        categoria: 'Motocarro',
      });
      const req = await esperar(ctrl, 'POST', `${API_BASE}/envios/crear`);
      expect(req.request.body.categoria).toBe('Motocarro');
      req.flush(API.crear);
    });

    it('debería obtener la trazabilidad con historial cronológico y fechas', async () => {
      const p = TestBed.inject(http.HttpShipmentsAdapter).obtener(1);
      (await esperar(ctrl, 'GET', `${API_BASE}/envios/1`)).flush(API.trazabilidad);
      const e = await p;
      expect(e.historial.map((h) => h.estado)).toEqual(['Pendiente', 'Asignado', 'Entregado']);
      expect(e.fechaUltimoCambio?.toISOString()).toBe('2026-10-29T07:03:31.748Z');
      expect(e.pin).toBe('6647');
    });

    it('debería rechazar un id no numérico sin llamar a la API', async () => {
      await expect(
        TestBed.inject(http.HttpShipmentsAdapter).obtener(Number('abc')),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('debería convertir un 500 en ApiError', async () => {
      const p = TestBed.inject(http.HttpShipmentsAdapter).crear({
        origen: 'a',
        destino: 'b',
        tipoCarga: 'c',
        idZona: 1,
      });
      (await esperar(ctrl, 'POST', `${API_BASE}/envios/crear`)).flush(
        { error: 'Error interno del servidor' },
        { status: 500, statusText: 'Error' },
      );
      await expect(p).rejects.toMatchObject({ status: 500, message: 'Error interno del servidor' });
    });
  });

  describe('HttpDriverServiceAdapter', () => {
    beforeEach(() => (ctrl = preparar()));

    it('debería aceptar con id_envio (el conductor sale del token) y descartar el PIN', async () => {
      const p = TestBed.inject(http.HttpDriverServiceAdapter).aceptar(1);
      const req = await esperar(ctrl, 'POST', `${API_BASE}/envios/aceptar`);
      expect(req.request.body).toEqual({ id_envio: 1 });
      req.flush(API.aceptar);
      const e = await p;
      expect(e.estado).toBe('Asignado');
      expect(e.pin).toBeUndefined();
      expect(JSON.stringify(e)).not.toContain('6647');
    });

    it('debería descartar pin_seguridad al consultar un servicio', async () => {
      const p = TestBed.inject(http.HttpDriverServiceAdapter).obtener(1);
      (await esperar(ctrl, 'GET', `${API_BASE}/envios/1`)).flush(API.trazabilidad);
      expect((await p).pin).toBeUndefined();
    });

    it('debería propagar el 400 de servicio ya tomado', async () => {
      const p = TestBed.inject(http.HttpDriverServiceAdapter).aceptar(1);
      (await esperar(ctrl, 'POST', `${API_BASE}/envios/aceptar`)).flush(
        { error: 'Este envío ya fue tomado por otro conductor' },
        { status: 400, statusText: 'x' },
      );
      await expect(p).rejects.toMatchObject({ status: 400 });
    });

    it('debería consultar el servicio activo sin PIN, o null si no hay', async () => {
      const a = TestBed.inject(http.HttpDriverServiceAdapter);
      const p1 = a.activo();
      (await esperar(ctrl, 'GET', `${API_BASE}/conductores/envios/activo`)).flush({
        envio: apiEnvio({ estado: 'Asignado' }),
      });
      const e = await p1;
      expect(e?.estado).toBe('Asignado');
      expect(e?.pin).toBeUndefined();
      const p2 = a.activo();
      (await esperar(ctrl, 'GET', `${API_BASE}/conductores/envios/activo`)).flush({ envio: null });
      expect(await p2).toBeNull();
    });

    it('debería iniciar la ruta con POST /envios/:id/iniciar-ruta', async () => {
      const p = TestBed.inject(http.HttpDriverServiceAdapter).iniciarRuta(1);
      (await esperar(ctrl, 'POST', `${API_BASE}/envios/1/iniciar-ruta`)).flush({
        envio: apiEnvio({ estado: 'En Ruta' }),
      });
      expect((await p).estado).toBe('En Ruta');
    });

    it('debería rechazar ids inválidos sin llamar a la API', async () => {
      const a = TestBed.inject(http.HttpDriverServiceAdapter);
      await expect(a.aceptar(0)).rejects.toMatchObject({ status: 400 });
      await expect(a.iniciarRuta(-1)).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('HttpVehiclesAdapter', () => {
    it('debería registrar en /vehicles/register con placa y categoria', async () => {
      ctrl = preparar();
      const p = TestBed.inject(http.HttpVehiclesAdapter).registrar({
        placa: 'ABC12D',
        categoria: 'Moto Express',
      });
      const req = await esperar(ctrl, 'POST', `${API_BASE}/vehicles/register`);
      expect(req.request.body).toEqual({
        placa: 'ABC12D',
        categoria: 'Moto Express',
      });
      req.flush(
        { message: 'ok', vehicle: { id: 3, placa: 'ABC12D', categoria: 'Moto Express' } },
        { status: 201, statusText: 'Created' },
      );
      expect(await p).toEqual({ id: 3, placa: 'ABC12D', categoria: 'Moto Express' });
    });
  });

  describe('HttpDocumentsAdapter', () => {
    it('debería enviar multipart con archivo, tipo_documento (con tilde) y reportar progreso', async () => {
      ctrl = preparar();
      const eventos: EventoCarga[] = [];
      const archivo = new File(['x'], 'cedula.jpg', { type: 'image/jpeg' });
      TestBed.inject(http.HttpDocumentsAdapter)
        .subir(archivo, 'Cédula')
        .subscribe((e) => eventos.push(e));
      const req = ctrl.expectOne(`${API_BASE}/documentos/upload`);
      const form = req.request.body as FormData;
      expect(form.get('tipo_documento')).toBe('Cédula');
      expect(form.get('id_conductor')).toBeNull();
      expect((form.get('archivo') as File).name).toBe('cedula.jpg');
      expect(req.request.reportProgress).toBe(true);
      req.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });
      req.flush(
        {
          message: 'ok',
          documento: { id: 9, url_archivo: 'https://c/x.jpg', tipo_documento: 'Cédula' },
        },
        { status: 201, statusText: 'Created' },
      );
      expect(eventos).toEqual([
        { tipo: 'progreso', porcentaje: 50 },
        { tipo: 'completo', documento: { id: 9, tipo: 'Cédula', urlArchivo: 'https://c/x.jpg' } },
      ]);
    });
  });

  describe('HttpDeliveryAdapter y HttpRatingAdapter', () => {
    beforeEach(() => (ctrl = preparar()));

    it('debería validar la entrega con url_foto y pin_seguridad', async () => {
      const p = TestBed.inject(http.HttpDeliveryAdapter).validar(1, 'https://x/y.jpg', '1234');
      const req = await esperar(ctrl, 'POST', `${API_BASE}/envios/1/validar-entrega`);
      expect(req.request.body).toEqual({ url_foto: 'https://x/y.jpg', pin_seguridad: '1234' });
      req.flush(API.validar);
      expect(await p).toEqual({ id: 1, estado: 'Entregado', urlFoto: 'https://x/y.jpg' });
    });

    it('debería propagar PIN incorrecto como ApiError 400', async () => {
      const p = TestBed.inject(http.HttpDeliveryAdapter).validar(1, 'u', '0000');
      (await esperar(ctrl, 'POST', `${API_BASE}/envios/1/validar-entrega`)).flush(API.errores.pin, {
        status: 400,
        statusText: 'x',
      });
      await expect(p).rejects.toMatchObject({ status: 400, message: 'PIN incorrecto' });
    });

    it('debería calificar enviando rating entero', async () => {
      const p = TestBed.inject(http.HttpRatingAdapter).calificar(1, 4.4);
      const req = await esperar(ctrl, 'POST', `${API_BASE}/envios/1/calificar`);
      expect(req.request.body).toEqual({ rating: 4 });
      req.flush(API.calificar);
      expect(await p).toEqual({ id: 1, calificacion: 4.5 });
    });
  });

  describe('HttpApprovalAdapter', () => {
    it('debería enviar driverId y approved', async () => {
      ctrl = preparar();
      const p = TestBed.inject(http.HttpApprovalAdapter).decidir(1, true);
      const req = await esperar(ctrl, 'POST', `${API_BASE}/conductores/aprobar`);
      expect(req.request.body).toEqual({ driverId: 1, approved: true });
      req.flush(API.aprobar);
      expect(await p).toMatchObject({
        idConductor: 1,
        estadoAprobacion: 'Aprobado',
        documentos: [],
      });
    });

    it('debería enviar observation al rechazar', async () => {
      ctrl = preparar();
      void TestBed.inject(http.HttpApprovalAdapter).decidir(1, false, 'SOAT vencido');
      const req = await esperar(ctrl, 'POST', `${API_BASE}/conductores/aprobar`);
      expect(req.request.body).toEqual({
        driverId: 1,
        approved: false,
        observation: 'SOAT vencido',
      });
      req.flush({ driver: API.aprobar.driver });
    });
  });

  describe('HttpLogTransportAdapter', () => {
    it('debería enviar { eventos } sin pasar por los interceptores', async () => {
      ctrl = preparar();
      const ev = [{ nivel: 'INFO' as const, mensaje: 'm', contexto: 'c', fecha: 'f' }];
      const p = TestBed.inject(http.HttpLogTransportAdapter).enviar(ev);
      const req = await esperar(ctrl, 'POST', `${API_BASE}/logs/frontend`);
      expect(req.request.body).toEqual({ eventos: ev });
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({ recibidos: 1, descartados: 0 }, { status: 202, statusText: 'Accepted' });
      await p;
    });

    it('debería convertir un 429 en ApiError', async () => {
      ctrl = preparar();
      const p = TestBed.inject(http.HttpLogTransportAdapter).enviar([]);
      (await esperar(ctrl, 'POST', `${API_BASE}/logs/frontend`)).flush(
        {},
        { status: 429, statusText: 'x' },
      );
      await expect(p).rejects.toMatchObject({ status: 429 });
    });

    it('debería usar sendBeacon al salir', () => {
      ctrl = preparar();
      const beacon = vi.fn().mockReturnValue(true);
      Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
      expect(TestBed.inject(http.HttpLogTransportAdapter).enviarAlSalir([])).toBe(true);
      expect(beacon).toHaveBeenCalledWith(`${API_BASE}/logs/frontend`, expect.any(Blob));
    });
  });

  describe('resto de contratos', () => {
    beforeEach(() => (ctrl = preparar()));

    it('GET /conductores/me', async () => {
      const p = TestBed.inject(http.HttpDriverProfileAdapter).obtener();
      (await esperar(ctrl, 'GET', `${API_BASE}/conductores/me`)).flush({
        id_conductor: 3,
        estado_aprobacion: 'Aprobado',
        vehiculo: { id: 1, placa: 'ABC123', categoria: 'Camioneta' },
      });
      expect(await p).toEqual({
        idConductor: 3,
        estadoAprobacion: 'Aprobado',
        motivoRechazo: null,
        vehiculo: { id: 1, placa: 'ABC123', categoria: 'Camioneta' },
      });
    });

    it('GET /conductores/me sin vehículo', async () => {
      const p = TestBed.inject(http.HttpDriverProfileAdapter).obtener();
      (await esperar(ctrl, 'GET', `${API_BASE}/conductores/me`)).flush({
        id_conductor: 3,
        estado_aprobacion: 'Pendiente',
      });
      expect((await p).vehiculo).toBeUndefined();
    });

    it('GET /zonas', async () => {
      const p = TestBed.inject(http.HttpZonesAdapter).listar();
      (await esperar(ctrl, 'GET', `${API_BASE}/zonas`)).flush([
        { id_zona: 1, nombre_zona: 'Casco Urbano', tarifa_base: '5000.00' },
      ]);
      expect(await p).toEqual([{ id: 1, nombre: 'Casco Urbano', tarifaBase: 5000 }]);
    });

    it('GET /clientes/envios conserva el PIN y mapea el conductor', async () => {
      const a = TestBed.inject(http.HttpClientShipmentsAdapter);
      const p = a.listar();
      (await esperar(ctrl, 'GET', `${API_BASE}/clientes/envios`)).flush({
        envios: [
          apiEnvio({
            conductor: {
              nombre: 'Con',
              placa: 'ABC12D',
              vehiculo: 'Moto Express',
              calificacion_promedio: 4.8,
            },
          }),
        ],
      });
      const [e] = await p;
      expect(e.pin).toBe('6647');
      expect(e.conductor).toEqual({
        nombre: 'Con',
        vehiculo: 'Moto Express',
        placa: 'ABC12D',
        calificacionPromedio: 4.8,
      });
    });

    it('GET /conductores/envios/disponibles descarta el PIN', async () => {
      const p = TestBed.inject(http.HttpDriverBoardAdapter).disponibles();
      (await esperar(ctrl, 'GET', `${API_BASE}/conductores/envios/disponibles`)).flush({
        envios: [apiEnvio({ estado: 'Pendiente' })],
      });
      expect((await p)[0].pin).toBeUndefined();
    });

    it('GET /conductores/pendientes', async () => {
      const p = TestBed.inject(http.HttpDriverApplicantsAdapter).listarPendientes();
      (await esperar(ctrl, 'GET', `${API_BASE}/conductores/pendientes`)).flush([
        {
          id_conductor: 1,
          nombre: 'Con',
          correo: 'c@t.co',
          estado_aprobacion: 'Pendiente',
          documentos: [{ tipo_documento: 'SOAT', url_archivo: 'u' }],
        },
      ]);
      expect(await p).toEqual([
        {
          idConductor: 1,
          nombre: 'Con',
          correo: 'c@t.co',
          estadoAprobacion: 'Pendiente',
          motivoRechazo: null,
          documentos: [{ tipo: 'SOAT', urlArchivo: 'u' }],
        },
      ]);
    });

    it('POST /envios/:id/evidencia (multipart, campo archivo)', async () => {
      const p = TestBed.inject(http.HttpEvidenceAdapter).subir(
        1,
        new File(['x'], 'f.jpg', { type: 'image/jpeg' }),
      );
      const req = await esperar(ctrl, 'POST', `${API_BASE}/envios/1/evidencia`);
      expect((req.request.body as FormData).get('archivo')).toBeInstanceOf(File);
      req.flush({ url_foto: 'https://x/f.jpg' });
      expect(await p).toBe('https://x/f.jpg');
    });

    it('POST y GET /envios/:id/ubicacion', async () => {
      const a = TestBed.inject(http.HttpLocationAdapter);
      const p1 = a.enviar(1, { lat: 4.3, lon: -74.3, capturadoEn: '2026-10-29T10:00:00Z' });
      const r1 = await esperar(ctrl, 'POST', `${API_BASE}/envios/1/ubicacion`);
      expect(r1.request.body).toEqual({
        lat: 4.3,
        lon: -74.3,
        capturado_en: '2026-10-29T10:00:00Z',
      });
      r1.flush({});
      await p1;
      const p2 = a.ultima(1);
      (await esperar(ctrl, 'GET', `${API_BASE}/envios/1/ubicacion`)).flush({
        lat: 1,
        lon: 2,
        capturado_en: 'x',
      });
      expect(await p2).toEqual({ lat: 1, lon: 2, capturadoEn: 'x' });
      const p3 = a.ultima(1);
      (await esperar(ctrl, 'GET', `${API_BASE}/envios/1/ubicacion`)).flush(null);
      expect(await p3).toBeNull();
    });

    it('GET /admin/dashboard/metrics y /admin/auditoria con filtros', async () => {
      const a = TestBed.inject(http.HttpAdminMetricsAdapter);
      const p1 = a.metricas();
      (await esperar(ctrl, 'GET', `${API_BASE}/admin/dashboard/metrics`)).flush({
        enviosTotales: 1,
      });
      expect(await p1).toEqual({ enviosTotales: 1 });
      const p2 = a.auditoria({ pagina: 2, tamano: 10, texto: 'ana', accion: 'Envío creado' });
      (
        await esperar(
          ctrl,
          'GET',
          `${API_BASE}/admin/auditoria?pagina=2&tamano=10&texto=ana&accion=Env%C3%ADo%20creado`,
        )
      ).flush({
        items: [
          {
            id: 1,
            fecha: '2026-10-29T00:00:00Z',
            usuario: 'u',
            accion: 'a',
            entidad: 'e',
            detalle: 'd',
          },
        ],
        total: 1,
        pagina: 2,
        tamano: 10,
      });
      expect((await p2).items[0].fecha).toBeInstanceOf(Date);
    });
  });
});

describe('mappers', () => {
  it('debería mapear estados, roles y aprobación desconocidos a valores seguros', () => {
    expect(aEstado('Perdido')).toBe('Pendiente');
    expect(aEstado('Cancelado')).toBe('Cancelado');
    expect(aEstado('En Ruta')).toBe('En Ruta');
    expect(aRol(1)).toBe('1');
    expect(aRol('3')).toBe('3');
    expect(aRol('x')).toBe('2');
    expect(aEstadoAprobacion('Rechazado')).toBe('Rechazado');
    expect(aEstadoAprobacion('otro')).toBe('Pendiente');
  });

  it('debería tolerar historial ausente y tarifa como texto', () => {
    const e = aEnvio(
      {
        ...apiEnvio(),
        historial_estado: undefined,
        fecha_ultimo_cambio: undefined,
        tarifa: '39500.00',
        id_conductor: undefined,
      },
      true,
    );
    expect(e.historial).toEqual([]);
    expect(e.tarifa).toBe(39500);
    expect(e.idConductor).toBeNull();
    expect(e.fechaUltimoCambio).toBeUndefined();
  });

  it('debería mapear documentos de tipo desconocido a Cédula y vehículo desconocido a undefined', () => {
    const p = aPostulante({
      id_conductor: 1,
      nombre: 'a',
      correo: 'b',
      estado_aprobacion: 'x',
      documentos: [{ tipo_documento: 'Otro', url_archivo: 'u' }],
    });
    expect(p.documentos[0].tipo).toBe('Cédula');
    const e = aEnvio(apiEnvio({ conductor: { nombre: 'c', vehiculo: 'Bicicleta' } }), true);
    expect(e.conductor?.vehiculo).toBeUndefined();
  });
});
