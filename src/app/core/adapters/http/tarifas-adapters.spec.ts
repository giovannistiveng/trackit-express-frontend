import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { apiEnvio } from '../../../../testing/fixtures';
import { API_BASE, configPrueba, provideFakesBase } from '../../../../testing/fakes';
import { apiInterceptor } from '../../http/api.interceptor';
import * as http from './http-adapters';
import { aCotizacion, aEnvio, aZona } from './mappers';

let ctrl: HttpTestingController;

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideFakesBase(configPrueba()),
      provideHttpClient(withInterceptors([apiInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  ctrl = TestBed.inject(HttpTestingController);
});
afterEach(() => ctrl.verify());

async function req(metodo: string, url: string) {
  await Promise.resolve();
  await Promise.resolve();
  return ctrl.expectOne((r) => r.method === metodo && r.urlWithParams === `${API_BASE}${url}`);
}

const DESGLOSE = {
  categoria: 'Motocarro',
  banderazo: 4000,
  distancia: 4750,
  tiempo: 800,
  recargo_zona: 2000,
  recargo_nocturno: 0,
  minimo_aplicado: false,
  total: 11600,
};
const FUSA = { lat: 4.3369, lon: -74.3638 };

describe('mappers de tarifas y zonas', () => {
  it('aCotizacion trae zona, desglose, opciones y coordenadas', () => {
    const c = aCotizacion({
      distancia_km: 5,
      tarifa_base: 2000,
      tarifa_total: 11600,
      duracion_estimada_min: 10,
      distancia_exacta: true,
      categoria: 'Motocarro',
      zona: { id_zona: 4, nombre_zona: 'Silvania' },
      zona_origen: { id_zona: 1, nombre_zona: 'Casco Urbano' },
      desglose: DESGLOSE,
      opciones: [
        { categoria: 'Moto Express', tarifa_total: 8000, minimo_aplicado: false },
        { categoria: 'Bicicleta', tarifa_total: 1, minimo_aplicado: false },
      ],
      recargo_nocturno_activo: true,
      origen_coords: FUSA,
      destino_coords: null,
    });
    expect(c).toMatchObject({
      categoria: 'Motocarro',
      zona: { id: 4, nombre: 'Silvania' },
      zonaOrigen: { id: 1, nombre: 'Casco Urbano' },
      desglose: { recargoZona: 2000, minimoAplicado: false, total: 11600 },
      opciones: [{ categoria: 'Moto Express', tarifaTotal: 8000 }],
      nocturno: true,
      origenCoords: FUSA,
      destinoCoords: null,
    });
    expect(
      aCotizacion({ distancia_km: 1, tarifa_base: 0, tarifa_total: 4500, zona_origen: null }),
    ).toEqual({
      distanciaKm: 1,
      tarifaBase: 0,
      tarifaTotal: 4500,
      moneda: 'COP',
      zonaOrigen: null,
    });
  });

  it('aZona usa el recargo y los datos del mapa; aEnvio trae duración y desglose', () => {
    expect(
      aZona({
        id_zona: 1,
        nombre_zona: 'Centro',
        tarifa_base: '0',
        recargo: '500',
        centro: FUSA,
        radio_km: '3.5',
        activa: false,
        descripcion: 'x',
      }),
    ).toEqual({
      id: 1,
      nombre: 'Centro',
      tarifaBase: 500,
      centro: FUSA,
      radioKm: 3.5,
      activa: false,
      descripcion: 'x',
    });
    expect(aZona({ id_zona: 2, nombre_zona: 'Vieja', tarifa_base: 5000 })).toEqual({
      id: 2,
      nombre: 'Vieja',
      tarifaBase: 5000,
    });
    const e = aEnvio(
      apiEnvio({ duracion_min: 12, desglose: { ...DESGLOSE, categoria: 'raro' } }),
      true,
    );
    expect(e.duracionMin).toBe(12);
    expect(e.desglose?.categoria).toBe('Moto Express');
  });
});

describe('adaptadores de cotización, geocodificación y tarifas', () => {
  it('cotizar envía coordenadas y categoría, y la zona solo si viene', async () => {
    const q = TestBed.inject(http.HttpQuoteAdapter);
    const p = q.cotizar({
      origen: 'a',
      destino: 'b',
      idZona: null,
      categoria: 'Camioneta',
      origenCoords: FUSA,
      destinoCoords: FUSA,
    });
    const r = await req('POST', '/cotizar/cotizar');
    expect(r.request.body).toEqual({
      origen: 'a',
      destino: 'b',
      categoria: 'Camioneta',
      origen_coords: FUSA,
      destino_coords: FUSA,
    });
    r.flush({ distancia_km: 1, tarifa_base: 0, tarifa_total: 18000 });
    expect((await p).tarifaTotal).toBe(18000);
  });

  it('crear incluye coordenadas, zona y notas', async () => {
    const s = TestBed.inject(http.HttpShipmentsAdapter);
    const p = s.crear({
      origen: 'a',
      destino: 'b',
      idZona: 3,
      tipoCarga: 'Paquete',
      notas: ' x ',
      origenCoords: FUSA,
    });
    const r = await req('POST', '/envios/crear');
    expect(r.request.body).toEqual({
      origen: 'a',
      destino: 'b',
      id_zona: 3,
      origen_coords: FUSA,
      tipo_carga: 'Paquete',
      notas: 'x',
    });
    r.flush({ envio: apiEnvio() });
    await p;
  });

  it('busca direcciones y hace la búsqueda inversa', async () => {
    const g = TestBed.inject(http.HttpGeoAdapter);
    expect(await g.buscar(' a ')).toEqual([]);
    const p = g.buscar(' Parque central ');
    (await req('GET', '/geo/buscar?q=Parque%20central')).flush({
      resultados: [{ nombre: 'Parque', detalle: 'Parque, Fusa', coords: FUSA }],
    });
    expect((await p)[0].nombre).toBe('Parque');
    const i = g.inversa(FUSA);
    (await req('GET', '/geo/inversa?lat=4.3369&lon=-74.3638')).flush({ resultado: null });
    expect(await i).toBeNull();
  });

  it('tarifas públicas', async () => {
    const s = TestBed.inject(http.HttpPublicSiteAdapter);
    const p = s.tarifas();
    (await req('GET', '/publico/tarifas')).flush({
      tarifas: [
        { categoria: 'Moto Express', banderazo: '2000', por_km: 700, por_minuto: 50, minimo: 4500 },
      ],
      recargo_nocturno: 0.2,
      horario_nocturno: '20:00 a 5:59',
    });
    expect(await p).toEqual({
      tarifas: [
        { categoria: 'Moto Express', banderazo: 2000, porKm: 700, porMinuto: 50, minimo: 4500 },
      ],
      recargoNocturno: 0.2,
      horarioNocturno: '20:00 a 5:59',
    });
  });

  it('admin: zonas, crear, editar, tarifas por vehículo', async () => {
    const a = TestBed.inject(http.HttpAdminOperationsAdapter);
    const z = a.zonas();
    (await req('GET', '/admin/zonas')).flush([
      { id_zona: 1, nombre_zona: 'Centro', tarifa_base: 0, activa: true },
    ]);
    expect((await z)[0].activa).toBe(true);
    const c = a.crearZona({
      nombre: 'Chinauta',
      tarifaBase: 2500,
      centro: FUSA,
      radioKm: 4,
      descripcion: null,
      activa: true,
    });
    const rc = await req('POST', '/admin/zonas');
    expect(rc.request.body).toEqual({
      nombre_zona: 'Chinauta',
      recargo: 2500,
      centro: FUSA,
      radio_km: 4,
      activa: true,
      descripcion: '',
    });
    rc.flush({ zona: { id_zona: 9, nombre_zona: 'Chinauta', tarifa_base: 2500 } });
    expect((await c).id).toBe(9);
    const u = a.actualizarZona(9, { activa: false });
    const ru = await req('PUT', '/admin/zonas/9');
    expect(ru.request.body).toEqual({ activa: false });
    ru.flush({ zona: { id_zona: 9, nombre_zona: 'Chinauta', tarifa_base: 2500, activa: false } });
    expect((await u).activa).toBe(false);
    const t = a.tarifasVehiculo();
    (await req('GET', '/publico/tarifas')).flush({
      tarifas: [{ categoria: 'Camioneta', banderazo: 1, por_km: 2, por_minuto: 3, minimo: 4 }],
    });
    expect((await t)[0].porMinuto).toBe(3);
    const g = a.actualizarTarifaVehiculo({
      categoria: 'Moto Express',
      banderazo: 2200,
      porKm: 700,
      porMinuto: 50,
      minimo: 4500,
    });
    const rg = await req('PUT', '/admin/tarifas/Moto%20Express');
    expect(rg.request.body).toEqual({ banderazo: 2200, por_km: 700, por_minuto: 50, minimo: 4500 });
    rg.flush({
      tarifa: {
        categoria: 'Moto Express',
        banderazo: 2200,
        por_km: 700,
        por_minuto: 50,
        minimo: 4500,
      },
    });
    expect((await g).banderazo).toBe(2200);
  });
});
