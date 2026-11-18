import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, toArray } from 'rxjs';
import { apiEnvio } from '../../../../testing/fixtures';
import { API_BASE, configPrueba, provideFakesBase } from '../../../../testing/fakes';
import { apiInterceptor } from '../../http/api.interceptor';
import * as http from './http-adapters';
import {
  aCotizacion,
  aDesglose,
  aDetalle,
  aDetalleApi,
  aDocumento,
  aEnvio,
  aEstadoAprobacion,
  aPostulante,
  aRequisitos,
  aSeguimientoPublico,
  aTipoServicio,
} from './mappers';

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

describe('mapeadores de acarreos', () => {
  it('detalle del servicio: ida y vuelta entre snake_case y camelCase, sin vacíos', () => {
    expect(aDetalle(null)).toBeNull();
    expect(aDetalle(undefined)).toBeNull();
    const api = {
      bultos: 4,
      peso_kg: 120,
      fragil: true,
      contacto_origen_nombre: 'Don Luis',
      contacto_origen_telefono: '3001112233',
      objetos: 'Nevera',
      pisos_origen: 2,
      pisos_destino: 3,
      ascensor_origen: false,
      ascensor_destino: true,
      ayudantes: 1,
      lista: 'Arroz',
      presupuesto: 50000,
      insumo: 'Abono',
      acceso_destapado: true,
    };
    const dominio = aDetalle(api)!;
    expect(dominio).toEqual({
      bultos: 4,
      pesoKg: 120,
      fragil: true,
      contactoOrigenNombre: 'Don Luis',
      contactoOrigenTelefono: '3001112233',
      objetos: 'Nevera',
      pisosOrigen: 2,
      pisosDestino: 3,
      ascensorOrigen: false,
      ascensorDestino: true,
      ayudantes: 1,
      lista: 'Arroz',
      presupuesto: 50000,
      insumo: 'Abono',
      accesoDestapado: true,
    });
    expect(aDetalleApi(dominio)).toEqual(api);
    expect(aDetalleApi({ lista: '   ', objetos: ' Cama ' })).toEqual({ objetos: 'Cama' });
    expect(aTipoServicio('mercado')).toBe('mercado');
    expect(aTipoServicio(undefined)).toBe('paquete');
  });

  it('documento y requisitos con estado, vencimiento y fuente', () => {
    expect(aDocumento({ tipo_documento: 'Raro', url_archivo: 'u' })).toEqual({
      tipo: 'Cédula',
      urlArchivo: 'u',
    });
    const d = aDocumento({
      id: 3,
      tipo_documento: 'SOAT',
      url_archivo: 'u',
      estado: 'Raro',
      motivo_rechazo: null,
      fecha_vencimiento: '2027-01-01',
      dias_para_vencer: 40,
      fecha_subida: '2026-11-01T10:00:00Z',
    });
    expect(d.estado).toBe('Pendiente');
    expect(d.fechaSubida).toBeInstanceOf(Date);
    expect(d.diasParaVencer).toBe(40);
    expect(
      aDocumento({ tipo_documento: 'SOAT', url_archivo: 'u', estado: 'Rechazado' }).estado,
    ).toBe('Rechazado');
    const r = aRequisitos({
      completo: false,
      pendientes: ['Falta SOAT'],
      items: [
        {
          tipo: 'SOAT',
          nombre: 'SOAT',
          ayuda: 'Vigente',
          obligatorio: true,
          vence: true,
          estado: 'vencido',
          verificar: { fuente: 'RUNT', url: 'https://runt' },
          documento: { tipo_documento: 'SOAT', url_archivo: 'u' },
        },
        {
          tipo: 'Antecedentes',
          nombre: 'Antecedentes',
          ayuda: '',
          obligatorio: true,
          vence: false,
          estado: 'raro',
          verificar: null,
          documento: null,
        },
      ],
    });
    expect(r.items[0].estado).toBe('vencido');
    expect(r.items[0].documento?.urlArchivo).toBe('u');
    expect(r.items[1].estado).toBe('falta');
    expect(r.items[1].documento).toBeNull();
  });

  it('postulante con vehículo, requisitos y consultas; Suspendido se respeta', () => {
    const p = aPostulante({
      id_conductor: 1,
      nombre: 'Ana',
      correo: 'a@t.co',
      estado_aprobacion: 'Suspendido',
      vehiculo: { placa: 'ABC12D', categoria: 'Furgoneta' },
      requisitos: { completo: true, pendientes: [], items: [] },
      consultas: [{ fuente: 'SIMIT', url: 'https://simit' }],
    });
    expect(p.estadoAprobacion).toBe('Suspendido');
    expect(p.vehiculo).toEqual({ placa: 'ABC12D', categoria: 'Furgoneta' });
    expect(p.requisitos?.completo).toBe(true);
    expect(p.consultas).toHaveLength(1);
    expect(
      aPostulante({
        id_conductor: 2,
        nombre: 'B',
        correo: 'b@t.co',
        estado_aprobacion: 'x',
        vehiculo: { placa: 'X', categoria: 'Avión' },
      }).vehiculo,
    ).toBeNull();
    expect(aEstadoAprobacion('Aprobado')).toBe('Aprobado');
  });

  it('envío con servicio, etapa, códigos, llegadas, bultos y compra', () => {
    const base = apiEnvio({
      estado: 'Asignado',
      tipo_servicio: 'mercado',
      detalle_servicio: { lista: 'Pan' },
      etapa: 'en_recogida',
      pide_codigo_recogida: true,
      codigo_recogida: '4821',
      llegada_recogida_en: '2026-11-01T10:00:00Z',
      llegada_destino_en: '2026-11-01T11:00:00Z',
      bultos_recogidos: 3,
      valor_compra: '45000',
    });
    const cliente = aEnvio(base, true);
    expect(cliente.tipoServicio).toBe('mercado');
    expect(cliente.detalle).toEqual({ lista: 'Pan' });
    expect(cliente.etapa).toBe('en_recogida');
    expect(cliente.pideCodigoRecogida).toBe(true);
    expect(cliente.codigoRecogida).toBe('4821');
    expect(cliente.llegadaRecogidaEn).toBeInstanceOf(Date);
    expect(cliente.llegadaDestinoEn).toBeInstanceOf(Date);
    expect(cliente.bultosRecogidos).toBe(3);
    expect(cliente.valorCompra).toBe(45000);
    // El conductor nunca recibe el código ni el PIN
    expect(aEnvio(base, false).codigoRecogida).toBeUndefined();
    // Sin etapa del backend se deduce del estado
    expect(aEnvio(apiEnvio({ estado: 'En Ruta', etapa: undefined }), true).etapa).toBe('en_camino');
  });

  it('desglose y cotización con extras, recargo de acceso y vehículo mínimo', () => {
    const d = aDesglose({
      categoria: 'Furgoneta',
      banderazo: 1,
      distancia: 2,
      tiempo: 3,
      recargo_zona: 4,
      recargo_nocturno: 0,
      extras: [{ concepto: '2 ayudantes', valor: 50000 }],
      recargo_acceso: 1500,
      minimo_aplicado: false,
      total: 10,
    });
    expect(d.extras).toEqual([{ concepto: '2 ayudantes', valor: 50000 }]);
    expect(d.recargoAcceso).toBe(1500);
    const sin = aDesglose({
      categoria: 'x',
      banderazo: 1,
      distancia: 2,
      tiempo: 3,
      recargo_zona: 4,
      recargo_nocturno: 0,
      minimo_aplicado: true,
      total: 10,
    });
    expect(sin.extras).toEqual([]);
    expect(sin.recargoAcceso).toBe(0);
    const c = aCotizacion({
      distancia_km: 3,
      tarifa_base: 0,
      tarifa_total: 9000,
      tipo_servicio: 'trasteo',
      vehiculo_minimo: 'Furgoneta',
    });
    expect(c.tipoServicio).toBe('trasteo');
    expect(c.vehiculoMinimo).toBe('Furgoneta');
    expect(
      aCotizacion({ distancia_km: 3, tarifa_base: 0, tarifa_total: 1, vehiculo_minimo: 'x' })
        .vehiculoMinimo,
    ).toBeUndefined();
  });

  it('seguimiento público con etapa y servicio (o deducidos)', () => {
    const base = {
      codigo: 1,
      estado: 'Entregado',
      origen: 'A',
      destino: 'B',
      destinatario: null,
      fecha_programada: null,
      ida_y_vuelta: false,
      historial: [],
      conductor: null,
      paradas: [],
      mapa: null,
    };
    expect(aSeguimientoPublico(base)).toMatchObject({
      etapa: 'entregado',
      tipoServicio: 'paquete',
    });
    expect(
      aSeguimientoPublico({ ...base, etapa: 'en_destino', tipo_servicio: 'insumos' }),
    ).toMatchObject({ etapa: 'en_destino', tipoServicio: 'insumos' });
  });
});

describe('adaptadores HTTP de acarreos', () => {
  it('cotizar envía el servicio y el detalle en snake_case', async () => {
    const p = TestBed.inject(http.HttpQuoteAdapter).cotizar({
      origen: 'A',
      destino: 'B',
      tipoServicio: 'trasteo',
      detalle: { objetos: 'Cama', ayudantes: 2 },
    });
    const r = await req('POST', '/cotizar/cotizar');
    expect(r.request.body).toMatchObject({
      tipo_servicio: 'trasteo',
      detalle_servicio: { objetos: 'Cama', ayudantes: 2 },
    });
    r.flush({ distancia_km: 1, tarifa_base: 0, tarifa_total: 1 });
    await p;
  });

  it('pide la ruta por calles con los puntos redondeados', async () => {
    const p = TestBed.inject(http.HttpGeoAdapter).ruta([
      { lat: 4.1234567, lon: -74.1 },
      { lat: 4.2, lon: -74.2 },
    ]);
    const r = await req('GET', '/geo/ruta?puntos=4.12346,-74.10000;4.20000,-74.20000');
    r.flush({ km: 3, minutos: 8, puntos: [], exacta: true });
    expect((await p).km).toBe(3);
  });

  it('llegada a recoger y recogida con código, bultos y compra', async () => {
    const s = TestBed.inject(http.HttpDriverServiceAdapter);
    const p1 = s.llegadaRecogida(5);
    const r1 = await req('POST', '/envios/5/llegada-recogida');
    r1.flush({ envio: apiEnvio({ id_envio: 5, etapa: 'en_recogida' }) });
    expect((await p1).etapa).toBe('en_recogida');

    const foto = new File(['x'], 'f.jpg', { type: 'image/jpeg' });
    const p2 = s.recoger(5, foto, { codigo: '4821', bultos: 3, valorCompra: 45000 });
    const r2 = await req('POST', '/envios/5/recogida');
    const form = r2.request.body as FormData;
    expect(form.get('codigo_recogida')).toBe('4821');
    expect(form.get('bultos')).toBe('3');
    expect(form.get('valor_compra')).toBe('45000');
    r2.flush({ envio: apiEnvio({ id_envio: 5 }) });
    await p2;

    const p3 = s.recoger(5, foto);
    const r3 = await req('POST', '/envios/5/recogida');
    expect((r3.request.body as FormData).get('codigo_recogida')).toBeNull();
    r3.flush({ envio: apiEnvio({ id_envio: 5 }) });
    await p3;
  });

  it('revisa un documento: motivo solo al rechazar y fecha corregida', async () => {
    const a = TestBed.inject(http.HttpApprovalAdapter);
    const p1 = a.revisarDocumento(9, false, {
      motivo: ' Borrosa ',
      fechaVencimiento: '2027-01-01',
    });
    const r1 = await req('PATCH', '/admin/documentos/9');
    expect(r1.request.body).toEqual({
      aprobado: false,
      motivo: 'Borrosa',
      fecha_vencimiento: '2027-01-01',
    });
    r1.flush({
      documento: { id: 9, tipo_documento: 'SOAT', url_archivo: 'u', estado: 'Rechazado' },
    });
    expect((await p1).estado).toBe('Rechazado');

    const p2 = a.revisarDocumento(9, true, { motivo: 'ignorado' });
    const r2 = await req('PATCH', '/admin/documentos/9');
    expect(r2.request.body).toEqual({ aprobado: true });
    r2.flush({
      documento: { id: 9, tipo_documento: 'SOAT', url_archivo: 'u', estado: 'Aprobado' },
    });
    await p2;
  });

  it('sube un documento con su fecha de vencimiento', async () => {
    const eventos = firstValueFrom(
      TestBed.inject(http.HttpDocumentsAdapter)
        .subir(new File(['x'], 'l.jpg'), 'Licencia', '2030-05-01')
        .pipe(toArray()),
    );
    const r = await req('POST', '/documentos/upload');
    expect((r.request.body as FormData).get('fecha_vencimiento')).toBe('2030-05-01');
    r.flush({ documento: { tipo_documento: 'Licencia', url_archivo: 'u' } });
    expect((await eventos).at(-1)).toMatchObject({ tipo: 'completo' });
  });
});
