import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CONDUCTOR, apiEnvio } from '../../../testing/fixtures';
import { API_BASE, configPrueba, provideConfig, vaciarPromesas } from '../../../testing/fakes';
import { FeatureFlags } from '../../../environments/environment.model';
import * as http from '../adapters/http/http-adapters';
import * as local from '../adapters/local/local-adapters';
import * as mock from '../adapters/mock/mock-adapters';
import {
  AdminMetricsPort,
  ClientShipmentsPort,
  DriverApplicantsPort,
  DriverBoardPort,
  DriverProfilePort,
  EvidenceStoragePort,
  LocationTransportPort,
  RouteStartPort,
  ZonesPort,
} from '../ports';
import { DemoModeService } from './demo-mode.service';
import { providePorts } from './ports.providers';

function inyectar(
  features: Partial<FeatureFlags> = {},
  cloudinary = { cloudName: '', uploadPreset: '' },
) {
  TestBed.configureTestingModule({
    providers: [
      providePorts(),
      provideConfig(configPrueba({ features, cloudinary })),
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
}

describe('providePorts: el flag decide el adaptador', () => {
  const casos: [abstract new () => unknown, keyof FeatureFlags, unknown, unknown][] = [
    [
      DriverProfilePort,
      'conductorMe',
      http.HttpDriverProfileAdapter,
      local.DemoDriverProfileAdapter,
    ],
    [ZonesPort, 'zonasEndpoint', http.HttpZonesAdapter, local.SeededZonesAdapter],
    [
      ClientShipmentsPort,
      'clienteEnviosEndpoint',
      http.HttpClientShipmentsAdapter,
      local.LocalShipmentsCache,
    ],
    [
      DriverBoardPort,
      'disponiblesEndpoint',
      http.HttpDriverBoardAdapter,
      local.ProbeDriverBoardAdapter,
    ],
    [RouteStartPort, 'iniciarRutaEndpoint', http.HttpRouteStartAdapter, mock.MockRouteStartAdapter],
    [
      DriverApplicantsPort,
      'pendientesEndpoint',
      http.HttpDriverApplicantsAdapter,
      mock.MockDriverApplicantsAdapter,
    ],
    [LocationTransportPort, 'ubicacion', http.HttpLocationAdapter, mock.MockLocationAdapter],
    [
      AdminMetricsPort,
      'adminDashboard',
      http.HttpAdminMetricsAdapter,
      mock.MockAdminMetricsAdapter,
    ],
  ];

  it.each(casos)('%o con %s apagado usa el alternativo', (puerto, flag, _real, alternativo) => {
    inyectar({ [flag]: false });
    expect(TestBed.inject(puerto as never)).toBeInstanceOf(alternativo as never);
  });

  it.each(casos)('%o con %s encendido usa HTTP', (puerto, flag, real) => {
    inyectar({ [flag]: true });
    expect(TestBed.inject(puerto as never)).toBeInstanceOf(real as never);
  });

  it('la evidencia elige endpoint propio, Cloudinary o simulado', () => {
    inyectar({ evidenciaUpload: true });
    expect(TestBed.inject(EvidenceStoragePort)).toBeInstanceOf(http.HttpEvidenceAdapter);
    TestBed.resetTestingModule();
    inyectar({}, { cloudName: 'demo', uploadPreset: 'p' });
    expect(TestBed.inject(EvidenceStoragePort)).toBeInstanceOf(http.CloudinaryEvidenceAdapter);
    TestBed.resetTestingModule();
    inyectar();
    expect(TestBed.inject(EvidenceStoragePort)).toBeInstanceOf(mock.MockEvidenceAdapter);
  });

  it('DemoModeService lista los flags apagados', () => {
    inyectar({ zonasEndpoint: true });
    const d = TestBed.inject(DemoModeService);
    expect(d.simulados().map((s) => s.flag)).not.toContain('zonasEndpoint');
    expect(d.simulados()).toHaveLength(11);
    expect(d.activo('zonasEndpoint')).toBe(true);
  });
});

/**
 * Suite de contrato: el adaptador HTTP y el simulado de cada puerto con brecha
 * deben comportarse igual (misma forma de datos).
 */
describe('contrato por puerto (HTTP y simulado)', () => {
  let ctrl: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideConfig(configPrueba()), provideHttpClient(), provideHttpClientTesting()],
    });
    ctrl = TestBed.inject(HttpTestingController);
  });
  afterEach(() => ctrl.verify());

  async function responder(url: string, cuerpo: object) {
    await vaciarPromesas(3);
    ctrl.expectOne(url).flush(cuerpo);
  }

  const contratoZonas = (zonas: { id: number; nombre: string; tarifaBase: number }[]) => {
    expect(zonas.length).toBeGreaterThan(0);
    for (const z of zonas) {
      expect(typeof z.id).toBe('number');
      expect(typeof z.nombre).toBe('string');
      expect(typeof z.tarifaBase).toBe('number');
    }
  };

  it('ZonesPort', async () => {
    contratoZonas(await TestBed.inject(mock.MockZonesAdapter).listar());
    const p = TestBed.inject(http.HttpZonesAdapter).listar();
    await responder(`${API_BASE}/zonas`, [
      { id_zona: 1, nombre_zona: 'Casco Urbano', tarifa_base: 5000 },
    ]);
    contratoZonas(await p);
  });

  it('DriverBoardPort: envíos Pendiente sin PIN', async () => {
    const contrato = (l: { estado: string; pin?: string }[]) =>
      l.forEach((e) => (expect(e.estado).toBe('Pendiente'), expect(e.pin).toBeUndefined()));
    contrato(await TestBed.inject(mock.MockDriverBoardAdapter).disponibles());
    const p = TestBed.inject(http.HttpDriverBoardAdapter).disponibles();
    await responder(`${API_BASE}/conductores/envios/disponibles`, {
      envios: [apiEnvio({ estado: 'Pendiente', id_conductor: null })],
    });
    contrato(await p);
  });

  it('DriverProfilePort: id numérico y estado válido', async () => {
    const contrato = (p: { idConductor: number | null; estadoAprobacion: string }) => {
      expect(typeof p.idConductor).toBe('number');
      expect(['Pendiente', 'Aprobado', 'Rechazado']).toContain(p.estadoAprobacion);
    };
    contrato(await TestBed.inject(mock.MockDriverProfileAdapter).obtener(CONDUCTOR));
    const p = TestBed.inject(http.HttpDriverProfileAdapter).obtener();
    await responder(`${API_BASE}/conductores/me`, {
      id_conductor: 1,
      estado_aprobacion: 'Aprobado',
    });
    contrato(await p);
  });

  it('DriverApplicantsPort: postulantes no aprobados con documentos', async () => {
    const contrato = (l: { estadoAprobacion: string; documentos: unknown[] }[]) =>
      l.forEach(
        (c) => (
          expect(c.estadoAprobacion).not.toBe('Aprobado'),
          expect(Array.isArray(c.documentos)).toBe(true)
        ),
      );
    contrato(await TestBed.inject(mock.MockDriverApplicantsAdapter).listarPendientes());
    const p = TestBed.inject(http.HttpDriverApplicantsAdapter).listarPendientes();
    await responder(`${API_BASE}/conductores/pendientes`, [
      { id_conductor: 2, nombre: 'a', correo: 'b', estado_aprobacion: 'Pendiente', documentos: [] },
    ]);
    contrato(await p);
  });

  it('RouteStartPort: devuelve el envío En Ruta', async () => {
    expect((await TestBed.inject(mock.MockRouteStartAdapter).iniciar(3)).estado).toBe('En Ruta');
    const p = TestBed.inject(http.HttpRouteStartAdapter).iniciar(3);
    await vaciarPromesas(3);
    ctrl
      .expectOne(`${API_BASE}/envios/3/iniciar-ruta`)
      .flush({ envio: apiEnvio({ id_envio: 3, estado: 'En Ruta' }) });
    expect((await p).estado).toBe('En Ruta');
  });

  it('LocationTransportPort: lo enviado se puede leer', async () => {
    const m = TestBed.inject(mock.MockLocationAdapter);
    expect(await m.ultima(1)).toBeNull();
    await m.enviar(1, { lat: 1, lon: 2, capturadoEn: 'x' });
    expect(await m.ultima(1)).toEqual({ lat: 1, lon: 2, capturadoEn: 'x' });
    m.fallar = true;
    await expect(m.enviar(1, { lat: 1, lon: 2, capturadoEn: 'y' })).rejects.toMatchObject({
      status: 0,
    });
  });

  it('AdminMetricsPort: auditoría paginada y filtrada', async () => {
    const m = TestBed.inject(mock.MockAdminMetricsAdapter);
    expect((await m.metricas()).porZona).toHaveLength(5);
    const p1 = await m.auditoria({ pagina: 1, tamano: 10 });
    expect(p1.items).toHaveLength(10);
    expect(p1.total).toBe(64);
    const f = await m.auditoria({ pagina: 1, tamano: 100, accion: 'Calificación', texto: 'ana' });
    expect(f.items.every((r) => r.accion === 'Calificación' && r.usuario.includes('ana'))).toBe(
      true,
    );
  });

  it('ClientShipmentsPort simulado: recuerda y lista', async () => {
    const m = TestBed.inject(mock.MockClientShipmentsAdapter);
    await m.recordar(1, 5);
    await m.recordar(1, 5);
    expect((await m.listar(1)).map((e) => e.id)).toEqual([5]);
    expect(await m.listar(2)).toEqual([]);
  });

  it('EvidenceStoragePort simulado: devuelve una URL', async () => {
    expect(
      await TestBed.inject(mock.MockEvidenceAdapter).subir(
        2,
        new File(['x'], 'a.png', { type: 'image/png' }),
      ),
    ).toMatch(/^https:\/\/.+envio-2-\d+\.png$/);
  });
});
