import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { apiEnvio } from '../../../../testing/fixtures';
import { API_BASE, configPrueba, provideFakesBase } from '../../../../testing/fakes';
import { apiInterceptor } from '../../http/api.interceptor';
import * as http from './http-adapters';
import { aContacto, aEnvio, aNotificacion, aPerfil } from './mappers';

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

const ENVIO_COMPLETO = apiEnvio({
  distancia_km: '12.5' as unknown as number,
  notas: 'Portería',
  motivo_cancelacion: 'Cliente ausente',
  origen_coords: { lat: 4.33, lon: -74.36 },
  destino_coords: { lat: 4.4, lon: -74.38 },
  ganancia_conductor: '31600' as unknown as number,
  comentario: 'Excelente',
  calificado: true,
  calificacion: 5,
});

describe('mappers ampliados', () => {
  it('aEnvio trae distancia, notas, coordenadas, ganancia y comentario', () => {
    const e = aEnvio(ENVIO_COMPLETO, false);
    expect(e).toMatchObject({
      distanciaKm: 12.5,
      notas: 'Portería',
      motivoCancelacion: 'Cliente ausente',
      origenCoords: { lat: 4.33, lon: -74.36 },
      destinoCoords: { lat: 4.4, lon: -74.38 },
      gananciaConductor: 31600,
      comentario: 'Excelente',
    });
    expect(e.pin).toBeUndefined();
  });

  it('aNotificacion, aPerfil y aContacto normalizan valores desconocidos', () => {
    expect(
      aNotificacion({
        id: 1,
        tipo: 'raro',
        titulo: 't',
        mensaje: 'm',
        id_envio: null,
        leida: false,
        fecha: '2026-10-29T10:00:00Z',
      }).tipo,
    ).toBe('envio_aceptado');
    expect(
      aPerfil({
        id: 1,
        nombre: 'A',
        correo: 'a@b.co',
        rol: '2',
        nombre_rol: 'Cliente',
        telefono: null,
        fecha_registro: null,
      }),
    ).toMatchObject({ rol: '2', fechaRegistro: null });
    expect(
      aContacto({
        id: 1,
        nombre: 'n',
        correo: 'c',
        telefono: null,
        asunto: 'otro',
        mensaje: 'm',
        atendido: false,
        fecha: '2026-10-29T10:00:00Z',
      }),
    ).toMatchObject({ asunto: 'General', telefono: undefined });
  });
});

describe('adaptadores HTTP nuevos', () => {
  it('cotizar devuelve la duración y si la distancia es exacta', async () => {
    const p = TestBed.inject(http.HttpQuoteAdapter).cotizar({
      origen: 'a',
      destino: 'b',
      idZona: 1,
    });
    (await req('POST', '/cotizar/cotizar')).flush({
      distancia_km: 10,
      tarifa_base: 5000,
      tarifa_total: 15000,
      duracion_estimada_min: 26,
      distancia_exacta: true,
    });
    expect(await p).toEqual({
      distanciaKm: 10,
      tarifaBase: 5000,
      tarifaTotal: 15000,
      moneda: 'COP',
      duracionMin: 26,
      distanciaExacta: true,
    });
  });

  it('crear envía notas recortadas; cancelar con y sin motivo', async () => {
    const s = TestBed.inject(http.HttpShipmentsAdapter);
    const p = s.crear({
      origen: 'a',
      destino: 'b',
      tipoCarga: 'Paquete',
      idZona: 1,
      categoria: 'Moto Express',
      notas: '  Timbre 2 ',
    });
    const r = await req('POST', '/envios/crear');
    expect(r.request.body).toMatchObject({ categoria: 'Moto Express', notas: 'Timbre 2' });
    r.flush({ envio: apiEnvio() });
    await p;
    const c1 = s.cancelar(7);
    const r1 = await req('POST', '/envios/7/cancelar');
    expect(r1.request.body).toEqual({});
    r1.flush({ envio: apiEnvio({ estado: 'Cancelado' }) });
    expect((await c1).estado).toBe('Cancelado');
    const c2 = s.cancelar(7, ' Me equivoqué ');
    const r2 = await req('POST', '/envios/7/cancelar');
    expect(r2.request.body).toEqual({ motivo: 'Me equivoqué' });
    r2.flush({ envio: apiEnvio() });
    await c2;
  });

  it('seguimiento mapea recorrido, señal en vivo y ETA', async () => {
    const p = TestBed.inject(http.HttpTrackingAdapter).seguimiento(4);
    (await req('GET', '/envios/4/seguimiento')).flush({
      id_envio: 4,
      estado: 'En Ruta',
      origen: { lat: 1, lon: 2 },
      destino: { lat: 3, lon: 4 },
      ultima_ubicacion: { lat: 1.5, lon: 2.5, capturado_en: '2026-10-29T10:00:00Z' },
      recorrido: [{ lat: 1, lon: 2, capturado_en: '2026-10-29T09:59:00Z' }],
      en_vivo: true,
      distancia_restante_km: 3.2,
      eta_minutos: 8,
    });
    expect(await p).toMatchObject({
      idEnvio: 4,
      estado: 'En Ruta',
      ultima: { lat: 1.5 },
      recorrido: [{ lat: 1 }],
      enVivo: true,
      etaMinutos: 8,
    });
    const sin = TestBed.inject(http.HttpTrackingAdapter).seguimiento(5);
    (await req('GET', '/envios/5/seguimiento')).flush({
      id_envio: 5,
      estado: 'Asignado',
      origen: null,
      destino: null,
      ultima_ubicacion: null,
      recorrido: [],
      en_vivo: false,
      distancia_restante_km: null,
      eta_minutos: null,
    });
    expect((await sin).ultima).toBeNull();
  });

  it('calificar incluye el comentario solo si hay texto', async () => {
    const r = TestBed.inject(http.HttpRatingAdapter);
    const p = r.calificar(3, 4.6, '  Muy amable ');
    const q1 = await req('POST', '/envios/3/calificar');
    expect(q1.request.body).toEqual({ rating: 5, comentario: 'Muy amable' });
    q1.flush({ envio: { id_envio: 3, calificacion: 5 } });
    expect(await p).toEqual({ id: 3, calificacion: 5 });
  });

  it('resumen e historial del conductor', async () => {
    const d = TestBed.inject(http.HttpDriverStatsAdapter);
    const p = d.resumen();
    (await req('GET', '/conductores/me/resumen')).flush({
      completados: 4,
      ingresos_total: 100,
      ingresos_mes: 40,
      calificacion_promedio: 4.5,
      total_calificaciones: 2,
      servicio_activo: null,
    });
    expect(await p).toEqual({
      completados: 4,
      ingresosTotal: 100,
      ingresosMes: 40,
      calificacionPromedio: 4.5,
      totalCalificaciones: 2,
      servicioActivo: null,
    });
    const h = d.historial();
    (await req('GET', '/conductores/envios/historial')).flush({
      envios: [apiEnvio({ pin_seguridad: '1234' })],
    });
    expect((await h)[0].pin).toBeUndefined();
  });

  it('cuenta: perfil, actualizar y cambiar contraseña', async () => {
    const a = TestBed.inject(http.HttpAccountAdapter);
    const perfil = {
      id: 1,
      nombre: 'Ana',
      correo: 'a@b.co',
      rol: '2',
      nombre_rol: 'Cliente',
      telefono: '3001234567',
      fecha_registro: '2026-01-01T00:00:00Z',
    };
    const p1 = a.perfil();
    (await req('GET', '/usuarios/me')).flush(perfil);
    expect((await p1).fechaRegistro).toBeInstanceOf(Date);
    const p2 = a.actualizar({ nombre: 'Ana M', telefono: '3001234567' });
    const r2 = await req('PATCH', '/usuarios/me');
    expect(r2.request.body).toEqual({ nombre: 'Ana M', telefono: '3001234567' });
    r2.flush({ usuario: { ...perfil, nombre: 'Ana M' } });
    expect((await p2).nombre).toBe('Ana M');
    const p3 = a.cambiarPassword('Vieja1234', 'Nueva1234');
    const r3 = await req('POST', '/usuarios/me/password');
    expect(r3.request.body).toEqual({ actual: 'Vieja1234', nueva: 'Nueva1234' });
    r3.flush({ mensaje: 'ok' });
    await p3;
  });

  it('notificaciones: listar, contar y marcar', async () => {
    const n = TestBed.inject(http.HttpNotificationsAdapter);
    const p = n.listar(true);
    (await req('GET', '/notificaciones?limite=30&no_leidas=true')).flush({
      no_leidas: 1,
      items: [
        {
          id: 1,
          tipo: 'ruta_iniciada',
          titulo: 't',
          mensaje: 'm',
          id_envio: 2,
          leida: false,
          fecha: '2026-10-29T10:00:00Z',
        },
      ],
    });
    expect(await p).toMatchObject({ noLeidas: 1, items: [{ tipo: 'ruta_iniciada', idEnvio: 2 }] });
    const p0 = n.listar();
    (await req('GET', '/notificaciones?limite=30')).flush({ no_leidas: 0, items: [] });
    await p0;
    const c = n.noLeidas();
    (await req('GET', '/notificaciones/no-leidas')).flush({ no_leidas: 3 });
    expect(await c).toBe(3);
    const l = n.leer(1);
    (await req('POST', '/notificaciones/1/leer')).flush({});
    await l;
    const t = n.leerTodas();
    (await req('POST', '/notificaciones/leer-todas')).flush({});
    await t;
  });

  it('sitio público: estadísticas, zonas y contacto', async () => {
    const s = TestBed.inject(http.HttpPublicSiteAdapter);
    const e = s.estadisticas();
    (await req('GET', '/publico/estadisticas')).flush({
      envios_entregados: 10,
      conductores_activos: 2,
      zonas: 3,
      calificacion_promedio: 4.8,
    });
    expect(await e).toMatchObject({ envios_entregados: 10 });
    const z = s.zonas();
    (await req('GET', '/publico/zonas')).flush([
      { id_zona: 1, nombre_zona: 'Centro', tarifa_base: '5000' },
    ]);
    expect((await z)[0]).toMatchObject({ id: 1, tarifaBase: 5000 });
    const c = s.contactar({
      nombre: 'n',
      correo: 'c@d.co',
      asunto: 'Empresas',
      mensaje: 'Hola equipo',
      telefono: ' 3001234567 ',
    });
    const r = await req('POST', '/contacto');
    expect(r.request.body).toMatchObject({ telefono: '3001234567' });
    r.flush({});
    await c;
    const c2 = s.contactar({
      nombre: 'n',
      correo: 'c@d.co',
      asunto: 'General',
      mensaje: 'Hola equipo',
    });
    const r2 = await req('POST', '/contacto');
    expect(r2.request.body.telefono).toBeUndefined();
    r2.flush({});
    await c2;
  });

  it('operación del admin: búsqueda, cancelar, tarifa y mensajes', async () => {
    const a = TestBed.inject(http.HttpAdminOperationsAdapter);
    const p = a.envios({ pagina: 2, tamano: 12, estado: 'En Ruta', idZona: 3, texto: ' Ana ' });
    (
      await req('GET', '/admin/envios?pagina=2&tamano=12&estado=En%20Ruta&id_zona=3&texto=Ana')
    ).flush({
      items: [
        {
          ...apiEnvio(),
          cliente: { nombre: 'Ana', correo: 'a@b.co' },
          conductor_nombre: null,
          zona: 'Centro',
        },
      ],
      total: 1,
      pagina: 2,
      tamano: 12,
    });
    expect((await p).items[0]).toMatchObject({
      cliente: { nombre: 'Ana' },
      conductorNombre: null,
      zona: 'Centro',
    });
    const p0 = a.envios({ pagina: 1, tamano: 12 });
    (await req('GET', '/admin/envios?pagina=1&tamano=12')).flush({
      items: [],
      total: 0,
      pagina: 1,
      tamano: 12,
    });
    await p0;
    const c = a.cancelar(9, 'Sin conductor');
    const rc = await req('POST', '/envios/9/cancelar');
    expect(rc.request.body).toEqual({ motivo: 'Sin conductor' });
    rc.flush({ envio: apiEnvio() });
    await c;
    const t = a.actualizarTarifa(2, 7000);
    const rt = await req('PUT', '/admin/zonas/2');
    expect(rt.request.body).toEqual({ tarifa_base: 7000 });
    rt.flush({ zona: { id_zona: 2, nombre_zona: 'Fusa', tarifa_base: 7000 } });
    expect((await t).tarifaBase).toBe(7000);
    const m = a.mensajes(true, 1);
    (await req('GET', '/admin/contactos?pagina=1&tamano=20&pendientes=true')).flush({
      items: [
        {
          id: 1,
          nombre: 'n',
          correo: 'c',
          telefono: '3',
          asunto: 'Soporte',
          mensaje: 'm',
          atendido: false,
          fecha: '2026-10-29T10:00:00Z',
        },
      ],
      total: 1,
      pagina: 1,
      tamano: 20,
    });
    expect((await m).items[0].asunto).toBe('Soporte');
    const m2 = a.mensajes(false, 2);
    (await req('GET', '/admin/contactos?pagina=2&tamano=20')).flush({
      items: [],
      total: 0,
      pagina: 2,
      tamano: 20,
    });
    await m2;
    const at = a.atenderMensaje(1);
    (await req('POST', '/admin/contactos/1/atender')).flush({});
    await at;
  });
});
