import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { apiEnvio } from '../../../../testing/fixtures';
import { API_BASE, configPrueba, provideFakesBase } from '../../../../testing/fakes';
import { apiInterceptor } from '../../http/api.interceptor';
import { ApiLiquidacion, ApiPago } from './backend.types';
import * as http from './http-adapters';
import { aEnvio, aLiquidacion, aPago, aParada, aSeguimientoPublico } from './mappers';

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
  for (let i = 0; i < 3; i++) await Promise.resolve();
  return ctrl.expectOne((r) => r.method === metodo && r.urlWithParams === `${API_BASE}${url}`);
}

const PAGO: ApiPago = {
  metodo: 'nequi',
  estado: 'pendiente',
  monto: '31600',
  telefono: '*** *** 4567',
  mensaje: 'Acepta',
  actualizado: '2026-11-02T12:00:00Z',
};
const LIQ: ApiLiquidacion = {
  id_liquidacion: 3,
  conductor_nombre: 'Pedro',
  desde: '2026-10-26',
  hasta: '2026-11-01',
  servicios: 4,
  total_tarifas: '100000',
  ganancia_conductor: '80000',
  cobrado_efectivo: '50000',
  comision_efectivo: '10000',
  saldo: '20000',
  estado: 'pendiente',
  referencia: null,
  pagada_en: null,
};
const FUSA = { lat: 4.3369, lon: -74.3638 };

describe('mappers de la plataforma', () => {
  it('aPago normaliza método, estado, monto y fecha', () => {
    expect(aPago(PAGO)).toEqual({
      metodo: 'nequi',
      estado: 'pendiente',
      monto: 31600,
      telefono: '*** *** 4567',
      mensaje: 'Acepta',
      actualizado: new Date('2026-11-02T12:00:00Z'),
    });
    const raro = aPago({ ...PAGO, metodo: 'x', estado: 'otro', actualizado: null });
    expect(raro).toMatchObject({ metodo: 'efectivo', estado: 'pendiente', actualizado: null });
  });

  it('aLiquidacion convierte los montos y la fecha de pago', () => {
    expect(aLiquidacion(LIQ)).toMatchObject({
      id: 3,
      conductor: 'Pedro',
      saldo: 20000,
      pagadaEn: null,
    });
    const pagada = aLiquidacion({
      ...LIQ,
      conductor_nombre: undefined,
      estado: 'pagada',
      pagada_en: '2026-11-03T10:00:00Z',
    });
    expect(pagada.conductor).toBeNull();
    expect(pagada.pagadaEn).toEqual(new Date('2026-11-03T10:00:00Z'));
  });

  it('aParada usa el orden si no hay id y fecha de completada', () => {
    expect(aParada({ orden: 2, direccion: 'x', coords: FUSA, completada_en: null })).toMatchObject({
      id: 2,
      notas: null,
      completadaEn: null,
    });
    expect(
      aParada({
        id_parada: 9,
        orden: 1,
        direccion: 'x',
        coords: FUSA,
        notas: 'n',
        completada_en: '2026-11-02T12:00:00Z',
      }).completadaEn,
    ).toEqual(new Date('2026-11-02T12:00:00Z'));
  });

  it('aEnvio trae pago, paradas, destinatario, programación y foto de recogida', () => {
    const e = aEnvio(
      {
        ...apiEnvio(),
        metodo_pago: 'nequi',
        pago: PAGO,
        token_seguimiento: 'tok',
        destinatario_nombre: 'Ana',
        destinatario_telefono: '3001234567',
        fecha_programada: '2026-11-03T15:00:00Z',
        ida_y_vuelta: true,
        destino_visitado_en: '2026-11-03T16:00:00Z',
        url_foto_recogida: 'https://x/r.jpg',
        fecha_recogida: '2026-11-03T15:10:00Z',
        paradas: [{ id_parada: 1, orden: 1, direccion: 'x', coords: FUSA, completada_en: null }],
        chat_no_leidos: 2,
      },
      true,
    );
    expect(e).toMatchObject({
      metodoPago: 'nequi',
      tokenSeguimiento: 'tok',
      destinatarioNombre: 'Ana',
      idaYVuelta: true,
      urlFotoRecogida: 'https://x/r.jpg',
      chatNoLeidos: 2,
    });
    expect(e.pago?.monto).toBe(31600);
    expect(e.paradas).toHaveLength(1);
    expect(e.fechaProgramada).toEqual(new Date('2026-11-03T15:00:00Z'));
  });

  it('aSeguimientoPublico ordena el historial y mapea el mapa', () => {
    const s = aSeguimientoPublico({
      codigo: 7,
      estado: 'En Ruta',
      origen: 'a',
      destino: 'b',
      destinatario: 'Ana',
      fecha_programada: null,
      ida_y_vuelta: false,
      historial: [
        { estado: 'Asignado', fecha: '2026-11-02T12:05:00Z' },
        { estado: 'Pendiente', fecha: '2026-11-02T12:00:00Z' },
      ],
      conductor: { nombre: 'Pedro', vehiculo: 'Moto Express', placa: 'ABC12D' },
      paradas: [],
      mapa: null,
    });
    expect(s.historial.map((h) => h.estado)).toEqual(['Pendiente', 'Asignado']);
    expect(s.mapa).toBeNull();
  });
});

describe('adaptadores HTTP de la plataforma', () => {
  it('cuenta: olvidé, restablecer, verificar y reenviar verificación', async () => {
    const a = TestBed.inject(http.HttpAuthAdapter);
    const p1 = a.olvidePassword('a@b.co');
    const r1 = await req('POST', '/auth/olvide-password');
    expect(r1.request.body).toEqual({ correo: 'a@b.co' });
    r1.flush({});
    await p1;
    const p2 = a.restablecerPassword('tok', 'Nueva123');
    const r2 = await req('POST', '/auth/restablecer-password');
    expect(r2.request.body).toEqual({ token: 'tok', nueva: 'Nueva123' });
    r2.flush({});
    await p2;
    const p3 = a.verificarCorreo('tok');
    (await req('POST', '/auth/verificar-correo')).flush({});
    await p3;
    const p4 = TestBed.inject(http.HttpAccountAdapter).reenviarVerificacion();
    (await req('POST', '/usuarios/me/verificacion')).flush({ enviado: true });
    expect(await p4).toBe(true);
  });

  it('crear con Nequi, paradas, ida y vuelta, programado y destinatario', async () => {
    const s = TestBed.inject(http.HttpShipmentsAdapter);
    const fecha = new Date('2026-11-03T15:00:00Z');
    const p = s.crear({
      origen: 'a',
      destino: 'b',
      tipoCarga: 'c',
      origenCoords: FUSA,
      destinoCoords: FUSA,
      paradas: [{ direccion: 'p', coords: FUSA }],
      idaYVuelta: true,
      fechaProgramada: fecha,
      metodoPago: 'nequi',
      telefonoNequi: '3001234567',
      destinatarioNombre: ' Ana ',
      destinatarioTelefono: '3009876543',
    });
    const r = await req('POST', '/envios/crear');
    expect(r.request.body).toEqual({
      origen: 'a',
      destino: 'b',
      tipo_carga: 'c',
      origen_coords: FUSA,
      destino_coords: FUSA,
      paradas: [{ direccion: 'p', coords: FUSA, notas: undefined }],
      ida_y_vuelta: true,
      fecha_programada: fecha.toISOString(),
      metodo_pago: 'nequi',
      telefono_nequi: '3001234567',
      destinatario_nombre: 'Ana',
      destinatario_telefono: '3009876543',
    });
    r.flush({ envio: apiEnvio() });
    await p;
  });

  it('editar envía solo lo que cambia', async () => {
    const p = TestBed.inject(http.HttpShipmentsAdapter).editar(4, {
      notas: 'x',
      destinatarioTelefono: '',
    });
    const r = await req('PATCH', '/envios/4');
    expect(r.request.body).toEqual({ notas: 'x', destinatario_telefono: '' });
    r.flush({ envio: apiEnvio({ id_envio: 4 }) });
    expect((await p).id).toBe(4);
    const p2 = TestBed.inject(http.HttpShipmentsAdapter).editar(4, {
      tipoCarga: 't',
      destinatarioNombre: 'n',
    });
    const r2 = await req('PATCH', '/envios/4');
    expect(r2.request.body).toEqual({ tipo_carga: 't', destinatario_nombre: 'n' });
    r2.flush({ envio: apiEnvio({ id_envio: 4 }) });
    await p2;
  });

  it('pagos del cliente: estado, reintentar (con y sin celular) y efectivo', async () => {
    const a = TestBed.inject(http.HttpPaymentsAdapter);
    const p1 = a.estado(3);
    (await req('GET', '/envios/3/pago')).flush(PAGO);
    expect((await p1).estado).toBe('pendiente');
    const p2 = a.reintentar(3, '3001112233');
    const r2 = await req('POST', '/envios/3/pago/reintentar');
    expect(r2.request.body).toEqual({ telefono: '3001112233' });
    r2.flush({ pago: PAGO });
    await p2;
    const p3 = a.reintentar(3);
    const r3 = await req('POST', '/envios/3/pago/reintentar');
    expect(r3.request.body).toEqual({});
    r3.flush({ pago: PAGO });
    await p3;
    const p4 = a.pagarEnEfectivo(3);
    (await req('POST', '/envios/3/pago/efectivo')).flush({
      pago: { ...PAGO, metodo: 'efectivo', estado: 'por_cobrar' },
    });
    expect((await p4).metodo).toBe('efectivo');
  });

  it('chat: lista y envía', async () => {
    const a = TestBed.inject(http.HttpChatAdapter);
    const m = {
      id: 1,
      texto: 'hola',
      autor: 'Ana',
      mio: true,
      leido: false,
      fecha: '2026-11-02T12:00:00Z',
    };
    const p1 = a.mensajes(5);
    (await req('GET', '/envios/5/mensajes')).flush({ abierto: true, mensajes: [m] });
    expect((await p1).mensajes[0].fecha).toEqual(new Date(m.fecha));
    const p2 = a.enviar(5, 'hola');
    const r2 = await req('POST', '/envios/5/mensajes');
    expect(r2.request.body).toEqual({ texto: 'hola' });
    r2.flush(m);
    expect((await p2).texto).toBe('hola');
  });

  it('tiempo real: ticket, URL, clave y suscripciones push', async () => {
    const a = TestBed.inject(http.HttpRealtimeAdapter);
    const p1 = a.ticket();
    (await req('POST', '/eventos/ticket')).flush({ ticket: 'abc' });
    expect(await p1).toBe('abc');
    expect(a.urlEventos('a b')).toBe(`${API_BASE}/eventos?ticket=a%20b&ngsw-bypass=true`);
    const p2 = a.clavePush();
    (await req('GET', '/push/clave-publica')).flush({ clave: null });
    expect(await p2).toBeNull();
    const p3 = a.suscribirPush({ plataforma: 'android', token: 't' });
    const r3 = await req('POST', '/push/suscripciones');
    expect(r3.request.body).toEqual({ plataforma: 'android', token: 't' });
    r3.flush({});
    await p3;
    const p4 = a.desuscribirPush('e');
    const r4 = await req('DELETE', '/push/suscripciones');
    expect(r4.request.body).toEqual({ endpoint: 'e' });
    r4.flush({});
    await p4;
  });

  it('conductor: recogida, parada, llegada, entrega en efectivo y billetera', async () => {
    const a = TestBed.inject(http.HttpDriverServiceAdapter);
    const p1 = a.recoger(5, new File(['x'], 'r.jpg', { type: 'image/jpeg' }));
    const r1 = await req('POST', '/envios/5/recogida');
    expect(r1.request.body).toBeInstanceOf(FormData);
    r1.flush({ envio: apiEnvio({ id_envio: 5 }) });
    await p1;
    const p2 = a.completarParada(5, 9);
    (await req('POST', '/envios/5/paradas/9/completar')).flush({
      paradas: [
        {
          id_parada: 9,
          orden: 1,
          direccion: 'x',
          coords: FUSA,
          completada_en: '2026-11-02T12:00:00Z',
        },
      ],
    });
    expect((await p2)[0].completadaEn).toBeInstanceOf(Date);
    const p3 = a.llegadaDestino(5);
    (await req('POST', '/envios/5/llegada-destino')).flush({ envio: apiEnvio({ id_envio: 5 }) });
    await p3;
    const p4 = TestBed.inject(http.HttpDeliveryAdapter).validar(5, 'u', '1234', true);
    const r4 = await req('POST', '/envios/5/validar-entrega');
    expect(r4.request.body).toEqual({
      url_foto: 'u',
      pin_seguridad: '1234',
      efectivo_recibido: true,
    });
    r4.flush({ envio: { id_envio: 5, url_foto: 'u' } });
    await p4;
    const p5 = TestBed.inject(http.HttpDriverStatsAdapter).billetera();
    (await req('GET', '/conductores/me/billetera')).flush({
      pendiente: {
        servicios: 2,
        ganancia_nequi: 1,
        cobrado_efectivo: 2,
        comision_efectivo: 3,
        saldo: -2,
      },
      movimientos: [
        { id_envio: 1, fecha: '2026-11-02T12:00:00Z', metodo: 'nequi', tarifa: 10, ganancia: 8 },
        { id_envio: 2, fecha: '2026-11-02T12:00:00Z', metodo: 'efectivo', tarifa: 10, ganancia: 8 },
      ],
      liquidaciones: [LIQ],
    });
    const b = await p5;
    expect(b.pendiente.saldo).toBe(-2);
    expect(b.movimientos.map((m) => m.metodo)).toEqual(['nequi', 'efectivo']);
    expect(b.liquidaciones[0].saldo).toBe(20000);
  });

  it('notificaciones: borrar una y borrar las leídas', async () => {
    const a = TestBed.inject(http.HttpNotificationsAdapter);
    const p1 = a.borrar(4);
    (await req('DELETE', '/notificaciones/4')).flush({});
    await p1;
    const p2 = a.borrarLeidas();
    (await req('DELETE', '/notificaciones')).flush({ borradas: 3 });
    expect(await p2).toBe(3);
  });

  it('seguimiento público con token codificado', async () => {
    const p = TestBed.inject(http.HttpPublicSiteAdapter).seguimiento('a/b');
    (await req('GET', '/publico/seguimiento/a%2Fb')).flush({
      codigo: 1,
      estado: 'Pendiente',
      origen: 'a',
      destino: 'b',
      destinatario: null,
      fecha_programada: '2026-11-03T15:00:00Z',
      ida_y_vuelta: true,
      historial: [],
      conductor: null,
      paradas: [],
      mapa: null,
    });
    expect((await p).fechaProgramada).toBeInstanceOf(Date);
  });

  it('administración: zonas, mensajes, pagos, reembolsos y liquidaciones', async () => {
    const a = TestBed.inject(http.HttpAdminOperationsAdapter);
    const p1 = a.borrarZona(2);
    (await req('DELETE', '/admin/zonas/2')).flush({ resultado: 'archivada' });
    expect(await p1).toBe('archivada');
    const p2 = a.borrarMensaje(8);
    (await req('DELETE', '/admin/contactos/8')).flush({});
    await p2;
    const p3 = a.pagos({ metodo: 'nequi', estado: 'reembolso_pendiente', pagina: 1 });
    (
      await req('GET', '/admin/pagos?pagina=1&tamano=20&metodo=nequi&estado=reembolso_pendiente')
    ).flush({
      items: [{ ...PAGO, id_envio: 5, cliente_nombre: 'Ana', origen: 'a', destino: 'b' }],
      total: 1,
      pagina: 1,
      tamano: 20,
    });
    expect((await p3).items[0]).toMatchObject({ idEnvio: 5, cliente: 'Ana', monto: 31600 });
    const p3b = a.pagos({ pagina: 2 });
    (await req('GET', '/admin/pagos?pagina=2&tamano=20')).flush({
      items: [],
      total: 0,
      pagina: 2,
      tamano: 20,
    });
    await p3b;
    const p4 = a.reembolsar(5);
    (await req('POST', '/admin/pagos/5/reembolso')).flush({
      pago: { ...PAGO, estado: 'reembolsado' },
    });
    expect((await p4).estado).toBe('reembolsado');
    const p5 = a.liquidaciones({ estado: 'pendiente', pagina: 1 });
    (await req('GET', '/admin/liquidaciones?pagina=1&tamano=20&estado=pendiente')).flush({
      items: [LIQ],
      total: 1,
      pagina: 1,
      tamano: 20,
    });
    expect((await p5).items[0].conductor).toBe('Pedro');
    const p5b = a.liquidaciones({ pagina: 1 });
    (await req('GET', '/admin/liquidaciones?pagina=1&tamano=20')).flush({
      items: [],
      total: 0,
      pagina: 1,
      tamano: 20,
    });
    await p5b;
    const p6 = a.generarLiquidaciones('2026-11-01');
    const r6 = await req('POST', '/admin/liquidaciones/generar');
    expect(r6.request.body).toEqual({ hasta: '2026-11-01' });
    r6.flush({ liquidaciones: [LIQ] });
    expect(await p6).toHaveLength(1);
    const p6b = a.generarLiquidaciones();
    const r6b = await req('POST', '/admin/liquidaciones/generar');
    expect(r6b.request.body).toEqual({});
    r6b.flush({ liquidaciones: [] });
    await p6b;
    const p7 = a.pagarLiquidacion(3, 'ref');
    const r7 = await req('POST', '/admin/liquidaciones/3/pagar');
    expect(r7.request.body).toEqual({ referencia: 'ref' });
    r7.flush({ liquidacion: { ...LIQ, estado: 'pagada' } });
    expect((await p7).estado).toBe('pagada');
  });
});
