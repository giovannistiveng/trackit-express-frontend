import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { Subject, of } from 'rxjs';
import { CLIENTE, CONDUCTOR, buildEnvio } from '../../testing/fixtures';
import {
  FakeRealtime,
  botonPorTexto,
  escribir,
  q,
  rechaza,
  vaciarPromesas,
} from '../../testing/fakes';
import { configurar, montar } from '../../testing/pantallas';
import { SessionService } from '../core/auth/session.service';
import {
  Envio,
  MensajeChat,
  PagoResumen,
  Seguimiento,
  SeguimientoPublico,
  telefonoWhatsapp,
} from '../core/domain';
import { ApiError } from '../core/http/api-error';
import {
  AuthPort,
  ChatPort,
  DriverBoardPort,
  DriverProfilePort,
  DriverServicePort,
  DriverStatsPort,
  NotificationsPort,
  PaymentsPort,
  PublicSitePort,
  RealtimePort,
  ShipmentsPort,
  TrackingPort,
} from '../core/ports';
import {
  EventosSseAdapter,
  FUENTE_EVENTOS,
  esperaReconexion,
} from '../core/adapters/sse/eventos-sse.adapter';
import {
  CAPACITOR,
  CapacitorGlobal,
  PushHibridoAdapter,
} from '../core/adapters/push/push-hibrido.adapter';
import { CampanaComponent } from '../layout/campana.component';
import { NotificacionesStore } from '../layout/notificaciones.store';
import { ChatEnvioComponent } from '../shared/ui/chat-envio.component';
import { ToastService } from '../shared/ui/toast.service';
import {
  ErrorUbicacion,
  entornoNavegador,
  mensajeUbicacion,
  motivoDenegado,
  obtenerUbicacion,
} from '../shared/util/ubicacion';
import { FakeEntornoUbicacion, posicion } from '../../testing/fakes';
import {
  OlvideContrasenaPage,
  RestablecerContrasenaPage,
  VerificarCorreoPage,
} from './auth/recuperacion.pages';
import { PagoPanelComponent, celularValido } from './cliente/components/pago-panel.component';
import { EnvioDetallePage } from './cliente/envio-detalle.page';
import { GananciasPage } from './conductor/ganancias.page';
import { TableroPage } from './conductor/tablero.page';
import { DriverProfileStore } from './conductor/state/driver-profile.store';
import { SeguimientoPublicoPage } from './publico/seguimiento.page';

// ------------------------------------------------------------------ canal de eventos falso

class FuenteFalsa {
  static readonly instancias: FuenteFalsa[] = [];
  static get ultima(): FuenteFalsa | null {
    return FuenteFalsa.instancias.at(-1) ?? null;
  }
  onerror: (() => void) | null = null;
  cerrada = false;
  private readonly oyentes = new Map<string, ((e: MessageEvent) => void)[]>();
  constructor(readonly url: string) {
    FuenteFalsa.instancias.push(this);
  }
  addEventListener(tipo: string, fn: (e: MessageEvent) => void) {
    this.oyentes.set(tipo, [...(this.oyentes.get(tipo) ?? []), fn]);
  }
  emitir(tipo: string, datos: unknown) {
    for (const fn of this.oyentes.get(tipo) ?? [])
      fn({ data: typeof datos === 'string' ? datos : JSON.stringify(datos) } as MessageEvent);
  }
  close() {
    this.cerrada = true;
  }
}

const canalFalso = {
  provide: FUENTE_EVENTOS,
  useValue: (url: string) => new FuenteFalsa(url) as unknown as EventSource,
};

async function abrirCanal(): Promise<FuenteFalsa> {
  TestBed.inject(EventosSseAdapter).iniciar();
  await vaciarPromesas(10);
  const f = FuenteFalsa.ultima!;
  f.emitir('conectado', {});
  return f;
}

// ------------------------------------------------------------------ cuenta

describe('Recuperación de contraseña y verificación de correo', () => {
  function auth() {
    return {
      olvidePassword: vi.fn(async () => undefined),
      restablecerPassword: vi.fn(async () => undefined),
      verificarCorreo: vi.fn(async () => undefined),
    };
  }

  it('olvidé mi contraseña: valida el correo, envía y permite usar otro', async () => {
    const a = auth();
    const { el, estable } = await montar(OlvideContrasenaPage, {
      providers: [{ provide: AuthPort, useValue: a }],
    });
    botonPorTexto(el, 'Enviar enlace').click();
    await estable();
    expect(q(el, '#correo-error')).toBeTruthy();
    escribir(q(el, '#correo'), ' Ana@Correo.CO ');
    botonPorTexto(el, 'Enviar enlace').click();
    await estable();
    expect(a.olvidePassword).toHaveBeenCalledWith('ana@correo.co');
    expect(el.textContent).toContain('Revisa tu correo');
    botonPorTexto(el, 'Usar otro correo').click();
    await estable();
    a.olvidePassword.mockImplementation(rechaza(new ApiError(429, 'Demasiadas solicitudes')));
    escribir(q(el, '#correo'), 'ana@correo.co');
    botonPorTexto(el, 'Enviar enlace').click();
    await estable();
    expect(q(el, '[role="alert"]')).toBeTruthy();
  });

  it('restablecer: sin token pide otro enlace', async () => {
    const { el } = await montar(RestablecerContrasenaPage, {
      providers: [{ provide: AuthPort, useValue: auth() }],
    });
    expect(el.textContent).toContain('El enlace está incompleto');
  });

  it('restablecer: valida, guarda y ofrece iniciar sesión; si venció ofrece otro enlace', async () => {
    const a = auth();
    const { el, estable } = await montar(RestablecerContrasenaPage, {
      inputs: { token: 'tok' },
      providers: [{ provide: AuthPort, useValue: a }],
    });
    escribir(q(el, '#nueva'), 'corta');
    escribir(q(el, '#confirmar'), 'otra');
    botonPorTexto(el, 'Guardar contraseña').click();
    await estable();
    expect(q(el, '#nueva-error')).toBeTruthy();
    expect(q(el, '#confirmar-error').textContent).toContain('no coinciden');
    expect(a.restablecerPassword).not.toHaveBeenCalled();
    a.restablecerPassword.mockImplementationOnce(
      rechaza(new ApiError(400, 'El enlace venció. Pide uno nuevo')),
    );
    escribir(q(el, '#nueva'), 'Segura123');
    escribir(q(el, '#confirmar'), 'Segura123');
    botonPorTexto(el, 'Guardar contraseña').click();
    await estable();
    expect(el.textContent).toContain('Pedir otro enlace');
    botonPorTexto(el, 'Guardar contraseña').click();
    await estable();
    expect(a.restablecerPassword).toHaveBeenLastCalledWith('tok', 'Segura123');
    expect(el.textContent).toContain('Contraseña actualizada');
  });

  it('verificar correo: marca la sesión como verificada o muestra el error', async () => {
    const a = auth();
    const { el } = await montar(VerificarCorreoPage, {
      usuario: { ...CLIENTE, correoVerificado: false },
      inputs: { token: 'tok' },
      providers: [{ provide: AuthPort, useValue: a }],
    });
    await vaciarPromesas();
    expect(a.verificarCorreo).toHaveBeenCalledWith('tok');
    expect(TestBed.inject(SessionService).usuario()?.correoVerificado).toBe(true);
    expect(el.textContent).toContain('¡Correo verificado!');
  });

  it('verificar correo: sin token o con token vencido explica qué hacer', async () => {
    const a = auth();
    a.verificarCorreo.mockImplementation(rechaza(new ApiError(400, 'El enlace venció')));
    const { el, fixture } = await montar(VerificarCorreoPage, {
      inputs: { token: 'x' },
      providers: [{ provide: AuthPort, useValue: a }],
    });
    await vaciarPromesas();
    fixture.detectChanges();
    expect(q(el, '[role="alert"]').textContent).toContain('venció');
    expect(el.textContent).toContain('Iniciar sesión');
    TestBed.resetTestingModule();
    const r = await montar(VerificarCorreoPage, {
      usuario: CLIENTE,
      providers: [{ provide: AuthPort, useValue: auth() }],
    });
    expect(r.el.textContent).toContain('incompleto');
    expect(r.el.textContent).toContain('Ir a Mi cuenta');
  });
});

// ------------------------------------------------------------------ seguimiento público

const SEGUIMIENTO: Seguimiento = {
  idEnvio: 7,
  estado: 'En Ruta',
  origen: { direccion: 'a', coords: { lat: 4.33, lon: -74.36 } },
  destino: { direccion: 'b', coords: { lat: 4.4, lon: -74.38 } },
  ultima: null,
  recorrido: [],
  enVivo: false,
  distanciaRestanteKm: 3.2,
  etaMinutos: 12,
};

const PUBLICO: SeguimientoPublico = {
  codigo: 7,
  estado: 'En Ruta',
  origen: 'Casco Urbano',
  destino: 'Silvania',
  destinatario: 'Ana',
  fechaProgramada: null,
  idaYVuelta: true,
  historial: [{ estado: 'Pendiente', fecha: new Date() }],
  conductor: { nombre: 'Pedro', vehiculo: 'Moto Express', placa: 'ABC12D' },
  paradas: [{ orden: 1, direccion: 'Chinauta', completada: true }],
  mapa: SEGUIMIENTO,
};

describe('SeguimientoPublicoPage', () => {
  afterEach(() => vi.useRealTimers());

  it('muestra estado, mapa, paradas y conductor; se actualiza mientras está activo', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const sitio = { seguimiento: vi.fn(async () => PUBLICO) };
    const { el, fixture } = await montar(SeguimientoPublicoPage, {
      inputs: { token: 'tok' },
      providers: [{ provide: PublicSitePort, useValue: sitio }],
    });
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    const texto = el.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(texto).toContain('Para Ana');
    expect(texto).toContain('El paquete va en camino');
    expect(texto).toContain('12 min');
    expect(texto).toContain('Chinauta');
    expect(texto).toContain('ABC12D');
    expect(texto).toContain('Ida y vuelta');
    sitio.seguimiento.mockImplementation(async () => ({
      ...PUBLICO,
      estado: 'Entregado',
      mapa: null,
    }));
    await vi.advanceTimersByTimeAsync(15_000);
    fixture.detectChanges();
    expect(el.textContent).toContain('El paquete fue entregado');
    fixture.destroy();
  });

  it('enlace inválido o sin conexión', async () => {
    const sitio = { seguimiento: vi.fn(rechaza(new ApiError(404, 'x'))) };
    const { el, fixture } = await montar(SeguimientoPublicoPage, {
      inputs: { token: 'malo' },
      providers: [{ provide: PublicSitePort, useValue: sitio }],
    });
    await vaciarPromesas();
    fixture.detectChanges();
    expect(el.textContent).toContain('No encontramos ese envío');
    TestBed.resetTestingModule();
    const r = await montar(SeguimientoPublicoPage, {
      inputs: { token: 't' },
      providers: [
        {
          provide: PublicSitePort,
          useValue: { seguimiento: vi.fn(rechaza(new ApiError(0, 'x'))) },
        },
      ],
    });
    await vaciarPromesas();
    r.fixture.detectChanges();
    expect(r.el.textContent).toContain('Revisa tu conexión');
  });

  it('muestra la hora programada de un envío pendiente', async () => {
    const { el, fixture } = await montar(SeguimientoPublicoPage, {
      inputs: { token: 't' },
      providers: [
        {
          provide: PublicSitePort,
          useValue: {
            seguimiento: vi.fn(async () => ({
              ...PUBLICO,
              estado: 'Pendiente',
              fechaProgramada: new Date('2026-11-05T15:00:00'),
              mapa: null,
              conductor: null,
              destinatario: null,
            })),
          },
        },
      ],
    });
    await vaciarPromesas();
    fixture.detectChanges();
    expect(el.textContent).toContain('Programado');
    fixture.destroy();
  });
});

// ------------------------------------------------------------------ pagos (cliente)

const PENDIENTE: PagoResumen = {
  metodo: 'nequi',
  estado: 'pendiente',
  monto: 31600,
  telefono: '*** *** 4567',
  mensaje: null,
  actualizado: new Date(),
};

function pagos() {
  return {
    estado: vi.fn(async (): Promise<PagoResumen> => PENDIENTE),
    reintentar: vi.fn(async (): Promise<PagoResumen> => ({
      ...PENDIENTE,
      actualizado: new Date(),
    })),
    pagarEnEfectivo: vi.fn(async (): Promise<PagoResumen> => ({
      ...PENDIENTE,
      metodo: 'efectivo',
      estado: 'por_cobrar',
    })),
  };
}

describe('PagoPanelComponent', () => {
  afterEach(() => vi.useRealTimers());

  it('con el cobro pendiente consulta hasta que se aprueba y avisa el cambio', async () => {
    const p = pagos();
    const { el, c, fixture } = await montar(PagoPanelComponent, {
      inputs: { idEnvio: 3, pagoInicial: PENDIENTE },
      providers: [{ provide: PaymentsPort, useValue: p }],
    });
    const cambios: PagoResumen[] = [];
    c.cambio.subscribe((x) => cambios.push(x));
    expect(el.textContent).toContain('Esperando que aceptes el cobro');
    await vi.waitFor(() => expect(el.textContent).toMatch(/vence en \d+:\d\d/));
    await c.consultar();
    expect(p.estado).toHaveBeenCalledWith(3);
    expect(cambios).toEqual([]);
    p.estado.mockImplementation(async () => ({ ...PENDIENTE, estado: 'aprobado' }));
    await c.consultar();
    fixture.detectChanges();
    expect(el.textContent).toContain('Pagado desde Nequi');
    expect(cambios.at(-1)?.estado).toBe('aprobado');
    p.estado.mockImplementation(rechaza(new ApiError(0, 'x')));
    await c.consultar();
    fixture.destroy();
  });

  it('rechazado: valida el celular, reintenta o cambia a efectivo', async () => {
    const p = pagos();
    const { el, estable } = await montar(PagoPanelComponent, {
      inputs: {
        idEnvio: 3,
        pagoInicial: { ...PENDIENTE, estado: 'rechazado', mensaje: 'Saldo insuficiente' },
      },
      providers: [{ provide: PaymentsPort, useValue: p }],
    });
    expect(el.textContent).toContain('Saldo insuficiente');
    escribir(q(el, '#tel-reintento'), '123');
    await estable();
    expect(botonPorTexto(el, /Reintentar con Nequi/).disabled).toBe(true);
    escribir(q(el, '#tel-reintento'), '+57 300 111 2233');
    await estable();
    botonPorTexto(el, /Reintentar con Nequi/).click();
    await estable();
    expect(p.reintentar).toHaveBeenCalledWith(3, '+57 300 111 2233');
    expect(el.textContent).toContain('Esperando que aceptes');
    botonPorTexto(el, 'Prefiero pagar en efectivo').click();
    await estable();
    expect(p.pagarEnEfectivo).toHaveBeenCalledWith(3);
    expect(el.textContent).toContain('en efectivo al conductor');
  });

  it('muestra el error del servidor y los demás estados', async () => {
    const p = pagos();
    p.reintentar.mockImplementation(
      rechaza(new ApiError(400, 'Alcanzaste el máximo de intentos con Nequi')),
    );
    const { el, estable, fixture } = await montar(PagoPanelComponent, {
      inputs: { idEnvio: 3, pagoInicial: { ...PENDIENTE, estado: 'expirado' } },
      providers: [{ provide: PaymentsPort, useValue: p }],
    });
    expect(el.textContent).toContain('El cobro venció');
    botonPorTexto(el, /Reintentar con Nequi/).click();
    await estable();
    expect(q(el, '[role="alert"].error-campo').textContent).toContain('máximo de intentos');
    const textos: Record<string, string> = {
      cobrado: 'Pagado en efectivo',
      anulado: 'No se cobró nada',
      reembolso_pendiente: 'Estamos devolviendo',
      reembolsado: 'Te devolvimos',
    };
    for (const [estado, texto] of Object.entries(textos)) {
      fixture.componentRef.setInput('pagoInicial', { ...PENDIENTE, estado });
      await estable();
      expect(el.textContent).toContain(texto);
    }
  });

  it('un aviso de pago por el canal de eventos actualiza al instante', async () => {
    const p = pagos();
    p.estado.mockImplementation(async () => ({ ...PENDIENTE, estado: 'aprobado' }));
    const { el, estable } = await montar(PagoPanelComponent, {
      inputs: { idEnvio: 3, pagoInicial: PENDIENTE },
      providers: [{ provide: PaymentsPort, useValue: p }, canalFalso],
    });
    const f = await abrirCanal();
    f.emitir('notificacion', {
      id: 1,
      tipo: 'pago_aprobado',
      id_envio: 3,
      titulo: 't',
      mensaje: 'm',
    });
    f.emitir('notificacion', {
      id: 2,
      tipo: 'pago_aprobado',
      id_envio: 99,
      titulo: 't',
      mensaje: 'm',
    });
    await estable();
    expect(p.estado).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('Pagado desde Nequi');
  });

  it('celularValido', () => {
    expect(celularValido('3001234567')).toBe(true);
    expect(celularValido('+57 300-123-4567')).toBe(true);
    expect(celularValido('2001234567')).toBe(false);
  });
});

// ------------------------------------------------------------------ detalle del envío (cliente)

function chatFalso(abierto = true) {
  return {
    mensajes: vi.fn(async () => ({
      abierto,
      mensajes: [
        {
          id: 1,
          texto: 'Voy en camino',
          autor: 'Pedro',
          mio: false,
          leido: true,
          fecha: new Date(),
        },
        { id: 2, texto: 'Gracias', autor: 'Ana', mio: true, leido: true, fecha: new Date() },
      ] as MensajeChat[],
    })),
    enviar: vi.fn(async (_id: number, texto: string): Promise<MensajeChat> => ({
      id: 10 + texto.length,
      texto,
      autor: 'Ana',
      mio: true,
      leido: false,
      fecha: new Date(),
    })),
  };
}

async function montarDetalle(envio: Envio, extra: object[] = []) {
  const shipments = {
    obtener: vi.fn(async () => envio),
    editar: vi.fn(async (_id: number, c: object) => ({ ...envio, ...c, pin: undefined })),
    cancelar: vi.fn(),
    crear: vi.fn(),
  };
  const r = await montar(EnvioDetallePage, {
    usuario: CLIENTE,
    inputs: { id: String(envio.id), chat: '1' },
    providers: [
      { provide: ShipmentsPort, useValue: shipments },
      { provide: TrackingPort, useValue: { seguimiento: vi.fn(async () => SEGUIMIENTO) } },
      { provide: PaymentsPort, useValue: pagos() },
      { provide: ChatPort, useValue: chatFalso() },
      ...(extra as never[]),
    ],
  });
  await r.estable();
  return { ...r, shipments };
}

describe('EnvioDetallePage: pago, compartir, editar, recogida, paradas y chat', () => {
  it('Pendiente con Nequi: panel de pago, compartir por WhatsApp y editar datos', async () => {
    const envio = buildEnvio({
      id: 4,
      metodoPago: 'nequi',
      pago: PENDIENTE,
      tokenSeguimiento: 'tok123',
      destinatarioNombre: 'Ana Pérez',
      destinatarioTelefono: '3001234567',
      fechaProgramada: new Date('2026-11-05T15:00:00'),
      idaYVuelta: true,
      paradas: [
        {
          id: 1,
          orden: 1,
          direccion: 'Chinauta',
          coords: { lat: 1, lon: 1 },
          notas: null,
          completadaEn: null,
        },
      ],
    });
    const { el, estable, shipments } = await montarDetalle(envio);
    const texto = el.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(texto).toContain('Programado');
    expect(texto).toContain('Ida y vuelta');
    expect(texto).toContain('Esperando que aceptes el cobro');
    expect(texto).toContain('Parada 1');
    expect(texto).toContain('Regresa a');
    const wa = q<HTMLAnchorElement>(el, 'a[href^="https://wa.me/"]');
    expect(wa.href).toContain('wa.me/573001234567');
    expect(decodeURIComponent(wa.href)).toContain('/seguimiento/tok123');
    const escribirPortapapeles = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: escribirPortapapeles },
      configurable: true,
    });
    botonPorTexto(el, /Copiar enlace/).click();
    await estable();
    expect(escribirPortapapeles).toHaveBeenCalledWith(
      expect.stringContaining('/seguimiento/tok123'),
    );
    expect(el.textContent).toContain('Copiado');

    botonPorTexto(el, /Editar datos del envío/).click();
    await estable();
    escribir(q(el, '#ed-tipo'), '');
    botonPorTexto(el, /Guardar cambios/).click();
    await estable();
    expect(el.textContent).toContain('Indica el tipo de carga');
    escribir(q(el, '#ed-tipo'), 'Caja');
    escribir(q(el, '#ed-notas'), 'Timbre 2');
    escribir(q(el, '#ed-tel'), '300 999 8888');
    botonPorTexto(el, /Guardar cambios/).click();
    await estable();
    expect(shipments.editar).toHaveBeenCalledWith(4, {
      tipoCarga: 'Caja',
      notas: 'Timbre 2',
      destinatarioNombre: 'Ana Pérez',
      destinatarioTelefono: '3009998888',
    });
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    // El PIN se conserva aunque la respuesta no lo traiga
    expect(el.textContent).toContain('PIN de entrega');
  });

  it('si editar falla, el error queda en el modal', async () => {
    const envio = buildEnvio({ id: 4 });
    const { el, estable, shipments } = await montarDetalle(envio);
    shipments.editar.mockImplementation(rechaza(new ApiError(400, 'El envío ya fue tomado')));
    botonPorTexto(el, /Editar datos del envío/).click();
    await estable();
    botonPorTexto(el, /Guardar cambios/).click();
    await estable();
    expect(q(el, '[role="dialog"] [role="alert"]').textContent).toContain('ya fue tomado');
  });

  it('En Ruta: foto de recogida y chat con el conductor (llega al instante por el canal)', async () => {
    const envio = buildEnvio({
      id: 6,
      estado: 'En Ruta',
      urlFotoRecogida: 'https://x/r.jpg',
      fechaRecogida: new Date(),
      conductor: { nombre: 'Pedro Pérez', vehiculo: 'Moto Express', placa: 'ABC12D' },
      pago: { ...PENDIENTE, metodo: 'efectivo', estado: 'por_cobrar' },
    });
    const { el, estable } = await montarDetalle(envio, [canalFalso]);
    expect(q<HTMLImageElement>(el, 'img[alt^="Foto del paquete"]').src).toBe('https://x/r.jpg');
    expect(el.textContent).toContain('Chat con Pedro');
    await vaciarPromesas(10);
    await estable();
    expect(el.textContent).toContain('Voy en camino');
    const f = await abrirCanal();
    f.emitir('chat', {
      id_envio: 6,
      mensaje: {
        id: 50,
        texto: 'Llegué',
        autor: 'Pedro',
        mio: false,
        leido: false,
        fecha: new Date().toISOString(),
      },
    });
    f.emitir('chat', {
      id_envio: 99,
      mensaje: { id: 51, texto: 'otro', autor: 'x', mio: false, leido: false, fecha: '' },
    });
    f.emitir('chat', 'no es json');
    await estable();
    expect(el.textContent).toContain('Llegué');
    expect(el.textContent).not.toContain('otro');
  });

  it('telefonoWhatsapp', () => {
    expect(telefonoWhatsapp('300 123 4567')).toBe('573001234567');
    expect(telefonoWhatsapp('+573001234567')).toBe('573001234567');
    expect(telefonoWhatsapp('573001234567')).toBe('573001234567');
    expect(telefonoWhatsapp('123')).toBe('');
    expect(telefonoWhatsapp(null)).toBe('');
  });
});

describe('ChatEnvioComponent', () => {
  it('envía, usa respuestas rápidas, muestra errores y el estado cerrado', async () => {
    const chat = chatFalso();
    const { el, estable } = await montar(ChatEnvioComponent, {
      usuario: CLIENTE,
      inputs: { idEnvio: 3, otro: 'Pedro' },
      providers: [{ provide: ChatPort, useValue: chat }],
    });
    await vaciarPromesas();
    await estable();
    expect(el.textContent).toContain('Chat con Pedro');
    escribir(q(el, 'input[name="texto"]'), '  Hola  ');
    await estable();
    q<HTMLFormElement>(el, 'form').dispatchEvent(new Event('submit'));
    await estable();
    expect(chat.enviar).toHaveBeenCalledWith(3, 'Hola');
    botonPorTexto(el, '¿Cuánto te falta?').click();
    await estable();
    expect(chat.enviar).toHaveBeenLastCalledWith(3, '¿Cuánto te falta?');
    chat.enviar.mockImplementation(rechaza(new ApiError(400, 'El chat se cerró')));
    botonPorTexto(el, 'Ya voy a salir').click();
    await estable();
    expect(q(el, '[role="alert"]').textContent).toContain('El chat se cerró');
    TestBed.resetTestingModule();
    const cerrado = await montar(ChatEnvioComponent, {
      inputs: { idEnvio: 3, rol: 'conductor' },
      providers: [{ provide: ChatPort, useValue: chatFalso(false) }],
    });
    await vaciarPromesas();
    await cerrado.estable();
    expect(cerrado.el.textContent).toContain('Cerrado');
    expect(cerrado.el.querySelector('form')).toBeNull();
  });

  it('sin canal en vivo revisa el chat periódicamente', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const chat = chatFalso();
    chat.mensajes.mockImplementationOnce(rechaza(new ApiError(0, 'x')));
    const { fixture } = await montar(ChatEnvioComponent, {
      inputs: { idEnvio: 3 },
      providers: [{ provide: ChatPort, useValue: chat }],
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(chat.mensajes).toHaveBeenCalledTimes(2);
    fixture.destroy();
    vi.useRealTimers();
  });
});

// ------------------------------------------------------------------ servicios de tiempo real

describe('EventosSseAdapter', () => {
  afterEach(() => vi.useRealTimers());

  it('se conecta con ticket, reparte eventos y reconecta con espera creciente', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    configurar({ usuario: CLIENTE, providers: [canalFalso] });
    const s = TestBed.inject(EventosSseAdapter);
    const vistos: unknown[] = [];
    s.cambiosEnvio().subscribe((d) => vistos.push(d));
    s.iniciar();
    s.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    const f = FuenteFalsa.ultima!;
    expect(f.url).toContain('ticket=ticket');
    f.emitir('conectado', {});
    expect(s.conectado()).toBe(true);
    f.emitir('envio', { id_envio: 1 });
    expect(vistos).toEqual([1]);
    f.onerror?.();
    expect(f.cerrada).toBe(true);
    expect(s.conectado()).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(FuenteFalsa.ultima).not.toBe(f);
    s.detener();
    expect(FuenteFalsa.ultima!.cerrada).toBe(true);
  });

  it('si el ticket falla reintenta; sin EventSource no hace nada', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    configurar({ usuario: CLIENTE, providers: [canalFalso] });
    const rt = TestBed.inject(RealtimePort) as FakeRealtime;
    const ticket = vi.spyOn(rt, 'ticket').mockImplementationOnce(rechaza(new ApiError(0, 'x')));
    const s = TestBed.inject(EventosSseAdapter);
    s.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(ticket).toHaveBeenCalledTimes(2);
    s.ngOnDestroy();
    expect(esperaReconexion(0)).toBe(2000);
    expect(esperaReconexion(10)).toBe(60_000);
    TestBed.resetTestingModule();
    configurar({ usuario: CLIENTE });
    const sin = TestBed.inject(EventosSseAdapter);
    sin.iniciar();
    expect(sin.conectado()).toBe(false);
  });
});

describe('NotificacionesStore con el canal de eventos', () => {
  it('agrega el aviso al instante, borra y borra leídas', async () => {
    configurar({ usuario: CLIENTE, providers: [canalFalso] });
    const store = TestBed.inject(NotificacionesStore);
    const toast = vi.spyOn(TestBed.inject(ToastService), 'mostrar');
    store.iniciar();
    await vaciarPromesas(10);
    const f = FuenteFalsa.ultima!;
    f.emitir('notificacion', {
      id: null,
      tipo: 'mensaje_chat',
      titulo: 'Nuevo mensaje',
      mensaje: 'Hola',
      id_envio: 3,
    });
    expect(toast).toHaveBeenCalledWith('Nuevo mensaje');
    expect(store.noLeidas()).toBe(1);
    const n = store.items()[0];
    expect(n.id).toBeLessThan(0);
    await store.marcarLeida(n);
    expect(store.noLeidas()).toBe(0);
    await store.borrar(n);
    expect(store.items()).toHaveLength(0);
    const fake = TestBed.inject(NotificationsPort);
    vi.spyOn(fake, 'borrar').mockImplementation(rechaza(new ApiError(500, 'x')));
    vi.spyOn(fake, 'borrarLeidas').mockImplementation(rechaza(new ApiError(500, 'x')));
    f.emitir('notificacion', {
      id: 5,
      tipo: 'nuevo_servicio',
      titulo: 'T',
      mensaje: 'M',
      id_envio: null,
      fecha: new Date().toISOString(),
    });
    await store.borrar(store.items()[0]);
    await store.borrarLeidas();
    store.detener();
  });
});

describe('PushHibridoAdapter', () => {
  function swFalso(habilitado = true) {
    const clics = new Subject<{ notification: { data?: { url?: string } } }>();
    return {
      clics,
      sw: {
        isEnabled: habilitado,
        subscription: of(null as PushSubscription | null),
        notificationClicks: clics,
        requestSubscription: vi.fn(async () => ({
          toJSON: () => ({ endpoint: 'https://push/1', keys: { p256dh: 'p', auth: 'a' } }),
        })),
        unsubscribe: vi.fn(async () => undefined),
      },
    };
  }

  it('web: sin service worker no es soportado', async () => {
    configurar({ usuario: CLIENTE });
    const s = TestBed.inject(PushHibridoAdapter);
    expect(await s.comprobar()).toBe('no-soportado');
    await s.activar();
    expect(s.estado()).toBe('no-soportado');
  });

  it('web: activa, se suscribe, navega al tocar y desactiva', async () => {
    const { sw, clics } = swFalso();
    vi.stubGlobal('Notification', { permission: 'default' });
    configurar({ usuario: CLIENTE, providers: [{ provide: SwPush, useValue: sw }] });
    const s = TestBed.inject(PushHibridoAdapter);
    expect(await s.comprobar()).toBe('inactivo');
    await s.activar();
    expect(s.estado()).toBe('activo');
    const rt = TestBed.inject(RealtimePort) as FakeRealtime;
    expect(rt.suscripciones[0]).toEqual({
      plataforma: 'web',
      endpoint: 'https://push/1',
      keys: { p256dh: 'p', auth: 'a' },
    });
    const { Router } = await import('@angular/router');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    clics.next({ notification: { data: { url: '/envios/3' } } });
    expect(navegar).toHaveBeenCalledWith('/envios/3');
    sw.subscription = of({ endpoint: 'https://push/1' } as PushSubscription);
    await s.desactivar();
    expect(rt.bajas).toEqual(['https://push/1']);
    expect(s.estado()).toBe('inactivo');
    vi.unstubAllGlobals();
  });

  it('web: bloqueado por el navegador, sin clave o con error', async () => {
    const { sw } = swFalso();
    vi.stubGlobal('Notification', { permission: 'denied' });
    configurar({ usuario: CLIENTE, providers: [{ provide: SwPush, useValue: sw }] });
    const s = TestBed.inject(PushHibridoAdapter);
    expect(await s.comprobar()).toBe('bloqueado');
    sw.requestSubscription.mockImplementation(rechaza(new Error('denied')));
    await s.activar();
    expect(s.estado()).toBe('bloqueado');
    (TestBed.inject(RealtimePort) as FakeRealtime).clave = null;
    await s.activar();
    expect(s.estado()).toBe('no-soportado');
    vi.unstubAllGlobals();
  });

  it('app móvil (Capacitor): pide permiso, registra el token y navega al tocar', async () => {
    const oyentes: Record<string, (x: never) => void> = {};
    const plugin = {
      requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
      register: vi.fn(async () => {
        oyentes['registration']({ value: 'fcm-token' } as never);
      }),
      addListener: vi.fn(async (ev: string, fn: (x: never) => void) => {
        oyentes[ev] = fn;
      }),
    };
    const cap: CapacitorGlobal = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      Plugins: { PushNotifications: plugin as never },
    };
    configurar({ usuario: CLIENTE, providers: [{ provide: CAPACITOR, useValue: cap }] });
    const s = TestBed.inject(PushHibridoAdapter);
    await s.comprobar();
    await s.activar();
    await vaciarPromesas();
    const rt = TestBed.inject(RealtimePort) as FakeRealtime;
    expect(rt.suscripciones).toEqual([{ plataforma: 'android', token: 'fcm-token' }]);
    expect(s.estado()).toBe('activo');
    const { Router } = await import('@angular/router');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    oyentes['pushNotificationActionPerformed']({ notification: { data: { url: '/x' } } } as never);
    expect(navegar).toHaveBeenCalledWith('/x');
    await s.desactivar();
    expect(rt.bajas).toEqual(['fcm-token']);
    plugin.requestPermissions.mockImplementation(async () => ({ receive: 'denied' }));
    await s.activar();
    expect(s.estado()).toBe('bloqueado');
  });

  it('app móvil sin el plugin no es soportado', async () => {
    const cap: CapacitorGlobal = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      Plugins: {},
    };
    configurar({ usuario: CLIENTE, providers: [{ provide: CAPACITOR, useValue: cap }] });
    const s = TestBed.inject(PushHibridoAdapter);
    expect(await s.comprobar()).toBe('no-soportado');
    await s.activar();
    expect(s.estado()).toBe('no-soportado');
  });
});

describe('CampanaComponent: borrar y activar avisos', () => {
  it('borra un aviso, borra las leídas y ofrece activar las notificaciones', async () => {
    const { sw } = {
      sw: {
        isEnabled: true,
        subscription: of(null),
        notificationClicks: new Subject(),
        requestSubscription: vi.fn(async () => ({
          toJSON: () => ({ endpoint: 'e', keys: { p256dh: 'p', auth: 'a' } }),
        })),
        unsubscribe: vi.fn(),
      },
    };
    vi.stubGlobal('Notification', { permission: 'default' });
    const fake = {
      items: [
        {
          id: 1,
          tipo: 'nuevo_servicio' as const,
          titulo: 'Uno',
          mensaje: 'm',
          idEnvio: null,
          leida: true,
          fecha: new Date(),
        },
        {
          id: 2,
          tipo: 'mensaje_chat' as const,
          titulo: 'Dos',
          mensaje: 'm',
          idEnvio: 3,
          leida: false,
          fecha: new Date(),
        },
      ],
      listar: vi.fn(async function (this: { items: unknown[] }) {
        return { noLeidas: 1, items: fake.items };
      }),
      noLeidas: vi.fn(async () => 1),
      leer: vi.fn(),
      leerTodas: vi.fn(),
      borrar: vi.fn(async () => undefined),
      borrarLeidas: vi.fn(async () => 1),
    };
    const { el, estable } = await montar(CampanaComponent, {
      usuario: CLIENTE,
      providers: [
        { provide: NotificationsPort, useValue: fake },
        { provide: SwPush, useValue: sw },
      ],
    });
    await TestBed.inject(PushHibridoAdapter).comprobar();
    q<HTMLButtonElement>(el, 'button[aria-controls="panel-notificaciones"]').click();
    await estable();
    q<HTMLButtonElement>(el, 'button[aria-label="Eliminar notificación: Dos"]').click();
    await estable();
    expect(fake.borrar).toHaveBeenCalledWith(2);
    expect(el.querySelector('#panel-notificaciones')).toBeTruthy();
    botonPorTexto(el, 'Borrar leídas').click();
    await estable();
    expect(fake.borrarLeidas).toHaveBeenCalled();
    botonPorTexto(el, /Recibir avisos en este dispositivo/).click();
    await estable();
    expect(TestBed.inject(PushHibridoAdapter).estado()).toBe('activo');
    vi.unstubAllGlobals();
  });
});

// ------------------------------------------------------------------ ubicación

describe('obtenerUbicacion', () => {
  it('diagnostica el motivo del rechazo', async () => {
    const e = new FakeEntornoUbicacion();
    e.estadoPermiso = 'granted';
    expect(await motivoDenegado(e)).toBe('bloqueado-sistema');
    e.estadoPermiso = null;
    expect(await motivoDenegado(e)).toBe('rechazado');
    expect(mensajeUbicacion('bloqueado-sistema', false)).toContain('ajustes del dispositivo');
    e.respuestas = [3, 1];
    e.estadoPermiso = 'denied';
    await expect(obtenerUbicacion(e)).rejects.toMatchObject({ motivo: 'bloqueado-sitio' });
    e.respuestas = [posicion(1, 2)];
    expect((await obtenerUbicacion(e)).coords.latitude).toBe(1);
    expect(new ErrorUbicacion('inseguro', 'x').name).toBe('ErrorUbicacion');
  });

  it('el entorno del navegador consulta permisos y tolera errores', async () => {
    const real = entornoNavegador();
    expect(typeof real.seguro).toBe('boolean');
    vi.stubGlobal('navigator', {
      ...navigator,
      permissions: { query: vi.fn(async () => ({ state: 'granted' })) },
    });
    expect(await entornoNavegador().permiso()).toBe('granted');
    vi.stubGlobal('navigator', {
      ...navigator,
      permissions: { query: vi.fn(rechaza(new Error('x'))) },
    });
    expect(await entornoNavegador().permiso()).toBeNull();
    vi.unstubAllGlobals();
  });
});

// ------------------------------------------------------------------ conductor

describe('GananciasPage: liquidación semanal', () => {
  it('muestra lo pendiente por liquidar y las semanas anteriores', async () => {
    const stats = {
      resumen: vi.fn(async () => ({
        completados: 1,
        ingresosTotal: 1,
        ingresosMes: 1,
        calificacionPromedio: null,
        totalCalificaciones: 0,
        servicioActivo: null,
      })),
      historial: vi.fn(async () => []),
      billetera: vi.fn(async () => ({
        pendiente: {
          servicios: 3,
          gananciaNequi: 40000,
          cobradoEfectivo: 30000,
          comisionEfectivo: 6000,
          saldo: 34000,
        },
        movimientos: [],
        liquidaciones: [
          {
            id: 1,
            conductor: null,
            desde: '2026-10-19',
            hasta: '2026-10-25',
            servicios: 2,
            totalTarifas: 1,
            gananciaConductor: 1,
            cobradoEfectivo: 1,
            comisionEfectivo: 1,
            saldo: -5000,
            estado: 'pagada' as const,
            referencia: 'r',
            pagadaEn: new Date(),
          },
          {
            id: 2,
            conductor: null,
            desde: '2026-10-26',
            hasta: '2026-11-01',
            servicios: 4,
            totalTarifas: 1,
            gananciaConductor: 1,
            cobradoEfectivo: 1,
            comisionEfectivo: 1,
            saldo: 20000,
            estado: 'pendiente' as const,
            referencia: null,
            pagadaEn: null,
          },
        ],
      })),
    };
    const { el, estable } = await montar(GananciasPage, {
      usuario: CONDUCTOR,
      providers: [{ provide: DriverStatsPort, useValue: stats }],
    });
    await vaciarPromesas();
    await estable();
    const texto = el.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(texto).toContain('Liquidación de esta semana');
    expect(texto).toContain('Te pagaremos');
    expect(texto).toContain('Saldada');
    expect(texto).toContain('26 – 1 nov');
  });
});

describe('TableroPage: insignias y aviso al instante', () => {
  it('muestra pago, programación, paradas e ida y vuelta; refresca con un servicio nuevo', async () => {
    const lista = [
      buildEnvio({
        id: 1,
        pin: undefined,
        metodoPago: 'nequi',
        fechaProgramada: new Date(),
        idaYVuelta: true,
        paradas: [
          {
            id: 1,
            orden: 1,
            direccion: 'x',
            coords: { lat: 1, lon: 1 },
            notas: null,
            completadaEn: null,
          },
        ],
      }),
      buildEnvio({
        id: 2,
        pin: undefined,
        metodoPago: 'efectivo',
        fechaProgramada: new Date('2030-01-02T10:00:00'),
      }),
    ];
    const tablero = { disponibles: vi.fn(async () => lista) };
    const r = await montar(TableroPage, {
      usuario: CONDUCTOR,
      providers: [
        canalFalso,
        { provide: DriverBoardPort, useValue: tablero },
        { provide: DriverServicePort, useValue: { activo: vi.fn(async () => null) } },
        {
          provide: DriverProfilePort,
          useValue: {
            obtener: vi.fn(async () => ({
              idConductor: 1,
              estadoAprobacion: 'Aprobado',
              motivoRechazo: null,
            })),
          },
        },
      ],
    });
    await TestBed.inject(DriverProfileStore).cargar(true);
    await r.c.ngOnInit();
    await r.estable();
    const texto = r.el.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(texto).toContain('Pagado');
    expect(texto).toContain('Efectivo');
    expect(texto).toContain('1 parada');
    expect(texto).toContain('Ida y vuelta');
    const antes = tablero.disponibles.mock.calls.length;
    const f = await abrirCanal();
    f.emitir('notificacion', {
      id: 1,
      tipo: 'nuevo_servicio',
      titulo: 't',
      mensaje: 'm',
      id_envio: 9,
    });
    f.emitir('notificacion', {
      id: 2,
      tipo: 'liquidacion',
      titulo: 't',
      mensaje: 'm',
      id_envio: null,
    });
    await r.estable();
    expect(tablero.disponibles.mock.calls.length).toBe(antes + 1);
    r.c.ngOnDestroy();
  });
});
