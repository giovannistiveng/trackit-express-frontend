import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { CONDUCTOR, buildEnvio } from '../../../testing/fixtures';
import {
  FakeGeolocation,
  botonPorTexto,
  elegir,
  escribir,
  q,
  rechaza,
  vaciarPromesas,
} from '../../../testing/fakes';
import { configurar, montar } from '../../../testing/pantallas';
import { ApiError } from '../../core/http/api-error';
import { EventoCarga, MensajeChat, Parada, PerfilConductor, Requisito } from '../../core/domain';
import {
  ChatPort,
  DeliveryPort,
  DocumentsPort,
  DriverBoardPort,
  DriverProfilePort,
  DriverServicePort,
  EvidenceStoragePort,
  LocationTransportPort,
  TrackingPort,
  VehiclesPort,
} from '../../core/ports';
import { LocationQueue } from './state/location-queue';
import { ToastService } from '../../shared/ui/toast.service';
import { DocumentoCardComponent } from './components/documento-card.component';
import {
  EntregaModalComponent,
  MENSAJE_PIN_INCORRECTO,
} from './components/entrega-modal.component';
import { MENSAJE_PLACA_DUPLICADA, PerfilPage } from './perfil.page';
import { ServicioPage, accionDe } from './servicio.page';
import { faltaRecogida } from './components/recogida-modal.component';
import {
  CompartirUbicacionService,
  LATIDO_UBICACION_MS,
} from './state/compartir-ubicacion.service';
import { DriverProfileStore } from './state/driver-profile.store';
import { GEOLOCALIZACION } from './state/geolocalizacion';
import { INTERVALO_TABLERO_MS, MENSAJE_TOMADO, TableroPage } from './tablero.page';

const APROBADO: PerfilConductor = {
  idConductor: 1,
  estadoAprobacion: 'Aprobado',
  motivoRechazo: null,
};

function ubicacionFalsa() {
  return { enviar: vi.fn(async () => undefined), ultima: vi.fn(async () => null) };
}

function perfilPort(p: PerfilConductor = APROBADO) {
  return { provide: DriverProfilePort, useValue: { obtener: vi.fn(async () => p) } };
}

async function cargarPerfil() {
  await TestBed.inject(DriverProfileStore).cargar(true);
}

describe('DriverProfileStore', () => {
  it('debería cargar una vez por usuario y marcar error', async () => {
    const obtener = vi.fn(async () => APROBADO);
    configurar({
      usuario: CONDUCTOR,
      providers: [{ provide: DriverProfilePort, useValue: { obtener } }],
    });
    const s = TestBed.inject(DriverProfileStore);
    await s.cargar();
    await s.cargar();
    expect(obtener).toHaveBeenCalledTimes(1);
    expect(s.aprobado()).toBe(true);
    s.registrarVehiculo({ id: 1, placa: 'ABC123', categoria: 'Furgoneta' });
    expect(s.perfil()?.vehiculo?.placa).toBe('ABC123');
    obtener.mockImplementation(rechaza(new ApiError(500, 'x')));
    expect(await s.cargar(true)).toBeNull();
    expect(s.error()).toBe(true);
  });
});

describe('CU-003 y CU-004 PerfilPage', () => {
  function vehiculos() {
    return {
      registrar: vi.fn(async (d: { placa: string; categoria: string }) => ({
        id: 1,
        placa: d.placa,
        categoria: d.categoria,
      })),
    };
  }

  async function montarPerfil(v = vehiculos(), perfil = APROBADO) {
    const r = await montar(PerfilPage, {
      usuario: CONDUCTOR,
      providers: [
        perfilPort(perfil),
        { provide: VehiclesPort, useValue: v },
        { provide: DocumentsPort, useValue: { subir: vi.fn() } },
      ],
    });
    await cargarPerfil();
    await r.estable();
    return { ...r, v };
  }

  it('Dado placa y categoría válidas, cuando registro, entonces normaliza la placa y la muestra confirmada', async () => {
    const { el, v, estable } = await montarPerfil();
    escribir(q(el, '#placa'), ' abc-12d ');
    elegir(q(el, '#categoria'), 1);
    botonPorTexto(el, 'Registrar vehículo').click();
    await estable();
    expect(v.registrar).toHaveBeenCalledWith({ placa: 'ABC12D', categoria: 'Furgoneta' });
    expect(q(el, '[aria-label="Placa del vehículo: A B C 1 2 D"]')).toBeTruthy();
    expect(el.textContent).toContain('Vehículo registrado');
  });

  it('debería rechazar una placa con formato inválido sin llamar a la API', async () => {
    const { el, v, estable } = await montarPerfil();
    escribir(q(el, '#placa'), 'AB1234');
    botonPorTexto(el, 'Registrar vehículo').click();
    await estable();
    expect(q(el, '#placa-ayuda').textContent).toContain('ABC123');
    expect(v.registrar).not.toHaveBeenCalled();
  });

  it.each([
    [new ApiError(400, 'La placa ya está registrada'), MENSAJE_PLACA_DUPLICADA],
    [new ApiError(403, 'Esta acción requiere el rol Conductor'), 'No tienes permiso'],
    [new ApiError(500, 'x'), 'Algo salió mal'],
  ])('debería mostrar el error del backend (%#)', async (error, mensaje) => {
    const v = vehiculos();
    v.registrar.mockImplementation(rechaza(error));
    const { el, estable } = await montarPerfil(v);
    escribir(q(el, '#placa'), 'ABC123');
    botonPorTexto(el, 'Registrar vehículo').click();
    await estable();
    expect(q(el, '#placa-ayuda').textContent).toContain(mensaje);
  });

  it('sin perfil cargado debería bloquear el registro y no mostrar documentos', async () => {
    const r = await montar(PerfilPage, {
      usuario: CONDUCTOR,
      providers: [
        {
          provide: DriverProfilePort,
          useValue: { obtener: vi.fn(rechaza(new ApiError(0, 'x', 'SIN_CONEXION'))) },
        },
        { provide: VehiclesPort, useValue: vehiculos() },
        { provide: DocumentsPort, useValue: { subir: vi.fn() } },
      ],
    });
    await cargarPerfil();
    await r.estable();
    expect(botonPorTexto(r.el, 'Registrar vehículo').disabled).toBe(true);
    expect(r.el.querySelector('ti-documento-card')).toBeNull();
    expect(r.el.textContent).toContain('Disponible cuando se cargue tu perfil.');
  });

  it('debería mostrar el motivo del rechazo y recargar el perfil al subir un documento', async () => {
    const obtener = vi.fn(async () => ({
      ...APROBADO,
      estadoAprobacion: 'Rechazado' as const,
      motivoRechazo: 'SOAT vencido',
    }));
    const eventos = new Subject<EventoCarga>();
    const r = await montar(PerfilPage, {
      usuario: CONDUCTOR,
      providers: [
        { provide: DriverProfilePort, useValue: { obtener } },
        { provide: VehiclesPort, useValue: vehiculos() },
        { provide: DocumentsPort, useValue: { subir: () => eventos } },
      ],
    });
    await cargarPerfil();
    await r.estable();
    expect(r.el.textContent).toContain('SOAT vencido');
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const input = q<HTMLInputElement>(r.el, 'ti-documento-card input[type=file]');
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'soat.pdf', { type: 'application/pdf' })],
    });
    input.dispatchEvent(new Event('change'));
    // procesar() es asíncrono (comprime fotos grandes): se espera a que se suscriba la carga
    await vi.waitFor(() => expect(eventos.observed).toBe(true));
    eventos.next({ tipo: 'completo', documento: { id: 1, tipo: 'Cédula', urlArchivo: 'u' } });
    await r.estable();
    expect(obtener).toHaveBeenCalledTimes(2);
  });

  it('sin requisitos del backend muestra los documentos básicos y el aviso de revisión', async () => {
    const { el } = await montarPerfil(vehiculos(), { ...APROBADO, estadoAprobacion: 'Pendiente' });
    expect(el.querySelectorAll('ti-documento-card')).toHaveLength(4);
    expect(el.textContent).toContain('Tu cuenta está en revisión');
  });

  it('con requisitos muestra una tarjeta por requisito y el avance', async () => {
    const { el } = await montarPerfil(vehiculos(), {
      ...APROBADO,
      estadoAprobacion: 'Pendiente',
      requisitos: {
        completo: false,
        pendientes: ['Falta SOAT'],
        items: [
          { ...REQ_CEDULA, estado: 'aprobado' },
          { ...REQ_SOAT },
          { ...REQ_CEDULA, tipo: 'Tecnomecánica', nombre: 'Tecnomecánica', obligatorio: false },
        ],
      },
    });
    expect(el.querySelectorAll('ti-documento-card')).toHaveLength(3);
    expect(el.textContent?.replace(/\s+/g, ' ')).toMatch(/1\s*(de|\/)\s*2/);
  });
});

const REQ_CEDULA: Requisito = {
  tipo: 'Cédula',
  nombre: 'Cédula de ciudadanía',
  ayuda: 'Por ambos lados',
  obligatorio: true,
  vence: false,
  estado: 'falta',
  verificar: null,
  documento: null,
};
const REQ_SOAT: Requisito = { ...REQ_CEDULA, tipo: 'SOAT', nombre: 'SOAT', vence: true };

describe('CU-004 DocumentoCardComponent', () => {
  it('Dado un JPG válido, cuando lo subo, entonces muestra progreso y avisa el documento subido', async () => {
    const eventos = new Subject<EventoCarga>();
    const subir = vi.fn(() => eventos.asObservable());
    const { el, c, estable } = await montar(DocumentoCardComponent, {
      inputs: { requisito: REQ_CEDULA },
      providers: [{ provide: DocumentsPort, useValue: { subir } }],
    });
    const subidos: unknown[] = [];
    c.subido.subscribe((d) => subidos.push(d));
    const archivo = new File(['x'], 'cedula.jpg', { type: 'image/jpeg' });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    c.subir(archivo);
    eventos.next({ tipo: 'progreso', porcentaje: 40 });
    await estable();
    expect(subir).toHaveBeenCalledWith(archivo, 'Cédula', undefined);
    expect(q(el, '[role="progressbar"]').getAttribute('aria-valuenow')).toBe('40');
    expect(el.textContent).toContain('Subiendo');
    eventos.next({
      tipo: 'completo',
      documento: { id: 3, tipo: 'Cédula', urlArchivo: 'https://c/x.jpg' },
    });
    await estable();
    expect(c.estado()).toBe('reposo');
    expect(subidos).toEqual([{ id: 3, tipo: 'Cédula', urlArchivo: 'https://c/x.jpg' }]);
  });

  it('un documento que vence exige la fecha antes de subirlo y la envía', async () => {
    const subir = vi.fn(() => new Subject<EventoCarga>().asObservable());
    const { el, c, estable } = await montar(DocumentoCardComponent, {
      inputs: { requisito: REQ_SOAT },
      providers: [{ provide: DocumentsPort, useValue: { subir } }],
    });
    expect(el.textContent).toContain('Primero indica la fecha de vencimiento');
    const archivo = new File(['x'], 'soat.pdf', { type: 'application/pdf' });
    c.subir(archivo);
    expect(subir).not.toHaveBeenCalled();
    c.vencimiento.set('2027-05-01');
    await estable();
    c.subir(archivo);
    expect(subir).toHaveBeenCalledWith(archivo, 'SOAT', '2027-05-01');
  });

  it('muestra el motivo del rechazo y el aviso de vencimiento próximo', async () => {
    const { el } = await montar(DocumentoCardComponent, {
      inputs: {
        requisito: {
          ...REQ_SOAT,
          estado: 'rechazado',
          documento: {
            id: 9,
            tipo: 'SOAT',
            urlArchivo: 'https://c/s.pdf',
            estado: 'Rechazado',
            motivoRechazo: 'Foto borrosa',
            fechaVencimiento: '2027-01-10',
            diasParaVencer: 3,
          },
        },
      },
      providers: [{ provide: DocumentsPort, useValue: { subir: vi.fn() } }],
    });
    const texto = el.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(texto).toContain('Corregir');
    expect(texto).toContain('Motivo: Foto borrosa');
    expect(texto).toContain('Vence en 3 días');
  });

  it('un documento aprobado oculta la carga hasta pedir reemplazarlo', async () => {
    const { el, estable } = await montar(DocumentoCardComponent, {
      inputs: {
        requisito: {
          ...REQ_CEDULA,
          estado: 'aprobado',
          documento: { id: 1, tipo: 'Cédula', urlArchivo: 'https://c/c.jpg', estado: 'Aprobado' },
        },
      },
      providers: [{ provide: DocumentsPort, useValue: { subir: vi.fn() } }],
    });
    expect(el.querySelector('ti-carga-archivo')).toBeNull();
    expect(el.textContent).toContain('Aprobado');
    (
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Reemplazar'),
      ) as HTMLButtonElement
    ).click();
    await estable();
    expect(el.querySelector('ti-carga-archivo')).toBeTruthy();
  });

  it('debería mostrar el error traducido de multer', async () => {
    const eventos = new Subject<EventoCarga>();
    const { el, c, estable } = await montar(DocumentoCardComponent, {
      inputs: { requisito: { ...REQ_SOAT, vence: false } },
      providers: [{ provide: DocumentsPort, useValue: { subir: () => eventos } }],
    });
    c.subir(new File(['x'], 's.pdf', { type: 'application/pdf' }));
    eventos.error(new ApiError(400, 'File too large'));
    await estable();
    expect(c.estado()).toBe('error');
    expect(q(el, '[role="alert"]').textContent).toContain('más de 5 MB');
  });

  it('Dado un formato no permitido, cuando lo elijo, entonces se rechaza en el cliente sin llamar a la API', async () => {
    const subir = vi.fn();
    const { el, estable } = await montar(DocumentoCardComponent, {
      inputs: { requisito: { ...REQ_CEDULA, tipo: 'Licencia', nombre: 'Licencia' } },
      providers: [{ provide: DocumentsPort, useValue: { subir } }],
    });
    const input = q<HTMLInputElement>(el, 'input[type=file]');
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'a.gif', { type: 'image/gif' })],
    });
    input.dispatchEvent(new Event('change'));
    await estable();
    expect(subir).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Ese formato no está permitido');
  });
});

describe('CU-007 TableroPage', () => {
  afterEach(() => vi.useRealTimers());

  function puertos() {
    return {
      tablero: {
        disponibles: vi.fn(async () => [
          buildEnvio({ id: 7, origen: 'Vereda Pekín', pin: undefined }),
          buildEnvio({ id: 8, pin: undefined }),
        ]),
      },
      servicio: {
        aceptar: vi.fn(async (id: number) =>
          buildEnvio({ id, estado: 'Asignado', pin: undefined }),
        ),
        obtener: vi.fn(async () => buildEnvio({ id: 5, estado: 'Asignado' })),
        activo: vi.fn<() => Promise<ReturnType<typeof buildEnvio> | null>>(async () => null),
        iniciarRuta: vi.fn(),
      },
    };
  }

  async function montarTablero(p = puertos(), perfil = APROBADO) {
    const r = await montar(TableroPage, {
      usuario: CONDUCTOR,
      providers: [
        perfilPort(perfil),
        { provide: DriverBoardPort, useValue: p.tablero },
        { provide: DriverServicePort, useValue: p.servicio },
      ],
    });
    await cargarPerfil();
    await r.c.inicializar();
    await r.estable();
    return { ...r, p };
  }

  it('Dado un conductor no aprobado, entonces no muestra el tablero y explica por qué', async () => {
    const { el, p } = await montarTablero(undefined, {
      ...APROBADO,
      estadoAprobacion: 'Pendiente',
    });
    expect(el.textContent).toContain('Tu cuenta está en revisión');
    expect(q<HTMLAnchorElement>(el, 'a[href="/conductor/perfil"]')).toBeTruthy();
    expect(p.tablero.disponibles).not.toHaveBeenCalled();
  });

  it('debería explicar un rechazo', async () => {
    const { el } = await montarTablero(undefined, {
      ...APROBADO,
      estadoAprobacion: 'Rechazado',
      motivoRechazo: 'Licencia vencida',
    });
    expect(el.textContent).toContain('Tu solicitud fue rechazada');
    expect(el.textContent).toContain('Licencia vencida');
  });

  it('Dado servicios disponibles, cuando acepto y confirmo, entonces abre /conductor/servicio/:id', async () => {
    const { el, p, navegar, estable } = await montarTablero();
    expect(el.textContent).toContain('Vereda Pekín');
    botonPorTexto(el, 'Aceptar servicio').click();
    await estable();
    const dialogo = q(el, '[role="dialog"]');
    expect(dialogo.textContent).toContain('¿Aceptar este servicio?');
    botonPorTexto(dialogo, 'Aceptar servicio').click();
    await estable();
    expect(p.servicio.aceptar).toHaveBeenCalledWith(7);
    expect(navegar).toHaveBeenCalledWith(['/conductor/servicio', 7]);
  });

  it('Dado que otro conductor lo tomó, cuando acepto, entonces avisa y refresca la lista', async () => {
    const p = puertos();
    p.servicio.aceptar.mockImplementation(
      rechaza(new ApiError(400, 'Este envío ya fue tomado por otro conductor')),
    );
    const { el, estable } = await montarTablero(p);
    p.tablero.disponibles.mockImplementation(async () => [buildEnvio({ id: 8, pin: undefined })]);
    const toast = vi.spyOn(TestBed.inject(ToastService), 'error');
    botonPorTexto(el, 'Aceptar servicio').click();
    await estable();
    botonPorTexto(q(el, '[role="dialog"]'), 'Aceptar servicio').click();
    await estable();
    expect(toast).toHaveBeenCalledWith(MENSAJE_TOMADO);
    expect(p.tablero.disponibles).toHaveBeenCalledTimes(2);
    expect(el.textContent).not.toContain('Vereda Pekín');
  });

  it('debería mostrar otros errores al aceptar', async () => {
    const p = puertos();
    p.servicio.aceptar.mockImplementation(rechaza(new ApiError(0, 'x', 'SIN_CONEXION')));
    const { el, estable } = await montarTablero(p);
    const toast = vi.spyOn(TestBed.inject(ToastService), 'error');
    botonPorTexto(el, 'Aceptar servicio').click();
    await estable();
    botonPorTexto(q(el, '[role="dialog"]'), 'Aceptar servicio').click();
    await estable();
    expect(toast.mock.calls[0][0]).toContain('No hay conexión');
  });

  it('Dado un servicio activo en el backend, entonces bloquea aceptar otro (RN_OP_002)', async () => {
    const p = puertos();
    p.servicio.activo.mockImplementation(async () => buildEnvio({ id: 5, estado: 'En Ruta' }));
    const { el } = await montarTablero(p);
    expect(el.textContent).toContain('Tienes el servicio #5 en curso');
    expect(botonPorTexto(el, 'Aceptar servicio').disabled).toBe(true);
  });

  it('debería refrescar cada 15 s y con el botón; vacío y error', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const p = puertos();
    p.tablero.disponibles.mockImplementation(async () => []);
    const { el, fixture } = await montarTablero(p);
    await vi.advanceTimersByTimeAsync(0);
    const llamadas = p.tablero.disponibles.mock.calls.length;
    await vi.advanceTimersByTimeAsync(INTERVALO_TABLERO_MS);
    expect(p.tablero.disponibles.mock.calls.length).toBe(llamadas + 1);
    fixture.detectChanges();
    expect(el.textContent).toContain('No hay servicios disponibles');
    p.tablero.disponibles.mockImplementation(rechaza(new ApiError(500, 'x')));
    botonPorTexto(el, 'Refrescar').click();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(q(el, '[role="alert"]').textContent).toContain('Algo salió mal');
    fixture.destroy();
  });
});

describe('CU-009 EntregaModalComponent', () => {
  function puertos() {
    return {
      evidencia: { subir: vi.fn(async () => 'https://x/foto.jpg') },
      entrega: {
        validar: vi.fn(async () => ({
          id: 1,
          estado: 'Entregado' as const,
          urlFoto: 'https://x/foto.jpg',
        })),
      },
    };
  }

  async function montarModal(p = puertos()) {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const r = await montar(EntregaModalComponent, {
      inputs: { idEnvio: 1 },
      providers: [
        { provide: EvidenceStoragePort, useValue: p.evidencia },
        { provide: DeliveryPort, useValue: p.entrega },
      ],
    });
    const salidas: string[] = [];
    r.c.entregado.subscribe(() => salidas.push('entregado'));
    r.c.yaEntregado.subscribe(() => salidas.push('ya'));
    return { ...r, p, salidas };
  }

  async function pinYFoto(el: HTMLElement, pin: string, estable: () => Promise<void>) {
    for (const d of pin) botonPorTexto(el, d).click();
    const input = q<HTMLInputElement>(el, 'input[type=file]');
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'f.jpg', { type: 'image/jpeg' })],
      configurable: true,
    });
    input.dispatchEvent(new Event('change'));
    await estable();
  }

  it('debería habilitar Finalizar solo con 4 dígitos y foto', async () => {
    const { el, estable } = await montarModal();
    const finalizar = () => botonPorTexto(el, 'Finalizar entrega');
    expect(finalizar().disabled).toBe(true);
    for (const d of '123') botonPorTexto(el, d).click();
    await estable();
    expect(finalizar().disabled).toBe(true);
    await pinYFoto(el, '4', estable);
    expect(finalizar().disabled).toBe(false);
  });

  it('Dado PIN correcto y foto válida, cuando finalizo, entonces sube la foto, valida y emite entregado', async () => {
    const { el, p, salidas, estable } = await montarModal();
    await pinYFoto(el, '1234', estable);
    botonPorTexto(el, 'Finalizar entrega').click();
    await estable();
    expect(p.evidencia.subir).toHaveBeenCalledWith(1, expect.any(File));
    expect(p.entrega.validar).toHaveBeenCalledWith(1, 'https://x/foto.jpg', '1234', undefined);
    expect(salidas).toEqual(['entregado']);
  });

  it('Dado un envío en efectivo, exige confirmar que recibió el dinero', async () => {
    const p = puertos();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const r = await montar(EntregaModalComponent, {
      inputs: { idEnvio: 1, cobroEfectivo: 31600 },
      providers: [
        { provide: EvidenceStoragePort, useValue: p.evidencia },
        { provide: DeliveryPort, useValue: p.entrega },
      ],
    });
    await pinYFoto(r.el, '1234', r.estable);
    expect(r.el.textContent).toMatch(/Recibí \$\s31\.600 en efectivo/);
    expect(botonPorTexto(r.el, 'Finalizar entrega').disabled).toBe(true);
    q<HTMLInputElement>(r.el, 'input[type=checkbox]').click();
    await r.estable();
    botonPorTexto(r.el, 'Finalizar entrega').click();
    await r.estable();
    expect(p.entrega.validar).toHaveBeenCalledWith(1, 'https://x/foto.jpg', '1234', true);
  });

  it('Dado PIN incorrecto, entonces el modal sigue abierto, limpia el teclado, avisa y reutiliza la foto subida', async () => {
    const p = puertos();
    p.entrega.validar.mockImplementationOnce(rechaza(new ApiError(400, 'PIN incorrecto')));
    const { el, c, salidas, estable } = await montarModal(p);
    await pinYFoto(el, '0000', estable);
    botonPorTexto(el, 'Finalizar entrega').click();
    await estable();
    expect(q(el, '[role="alert"]').textContent).toContain(MENSAJE_PIN_INCORRECTO);
    expect(c.pin()).toBe('');
    expect(salidas).toEqual([]);
    for (const d of '1234') botonPorTexto(el, d).click();
    await estable();
    botonPorTexto(el, 'Finalizar entrega').click();
    await estable();
    expect(p.evidencia.subir).toHaveBeenCalledTimes(1);
    expect(salidas).toEqual(['entregado']);
  });

  it('Dado un envío ya entregado, entonces informa y emite yaEntregado', async () => {
    const p = puertos();
    p.entrega.validar.mockImplementation(
      rechaza(new ApiError(400, 'Este envío ya ha sido validado como entregado')),
    );
    const { el, salidas, estable } = await montarModal(p);
    await pinYFoto(el, '1234', estable);
    botonPorTexto(el, 'Finalizar entrega').click();
    await estable();
    expect(salidas).toEqual(['ya']);
  });

  it('debería mostrar el error si la foto no se puede subir', async () => {
    const p = puertos();
    p.evidencia.subir.mockImplementation(rechaza(new ApiError(0, 'x', 'SIN_CONEXION')));
    const { el, estable } = await montarModal(p);
    await pinYFoto(el, '1234', estable);
    botonPorTexto(el, 'Finalizar entrega').click();
    await estable();
    expect(q(el, '[role="alert"]').textContent).toContain('No hay conexión');
  });
});

const PARADA: Parada = {
  id: 11,
  orden: 1,
  direccion: 'Chinauta',
  coords: { lat: 4.27, lon: -74.4 },
  notas: null,
  completadaEn: null,
};

function chatFalso() {
  return {
    mensajes: vi.fn(async () => ({ abierto: true, mensajes: [] as MensajeChat[] })),
    enviar: vi.fn(async (_id: number, texto: string): Promise<MensajeChat> => ({
      id: Date.now(),
      texto,
      autor: 'Yo',
      mio: true,
      leido: false,
      fecha: new Date(),
    })),
  };
}

describe('accionDe y faltaRecogida', () => {
  it('una sola acción por etapa, con su bloqueo', () => {
    const e = (o: Parameters<typeof buildEnvio>[0]) => buildEnvio({ pin: undefined, ...o });
    expect(accionDe(e({ estado: 'Pendiente' }), '', 0)).toBeNull();
    expect(accionDe(e({ estado: 'Asignado' }), '', 0)?.texto).toBe('Llegué a recoger');
    expect(accionDe(e({ estado: 'Asignado', tipoServicio: 'mandado' }), '', 0)?.texto).toBe(
      'Llegué al lugar',
    );
    const recoger = accionDe(
      e({ estado: 'Asignado', etapa: 'en_recogida', pideCodigoRecogida: true }),
      '',
      0,
    );
    expect(recoger?.tipo).toBe('recoger');
    expect(recoger?.ayuda).toContain('código de recogida');
    expect(
      accionDe(e({ estado: 'Asignado', etapa: 'en_recogida', tipoServicio: 'mercado' }), '', 0)
        ?.ayuda,
    ).toContain('factura');
    expect(accionDe(e({ estado: 'Asignado', etapa: 'en_recogida' }), '', 0)?.ayuda).toContain(
      'bultos',
    );
    expect(accionDe(e({ estado: 'En Ruta' }), '', 2)?.bloqueo).toContain('las 2 paradas');
    expect(accionDe(e({ estado: 'En Ruta', etapa: 'regresando' }), '', 0)?.texto).toBe(
      'Llegué al punto de entrega',
    );
    const fin = accionDe(e({ estado: 'En Ruta', etapa: 'en_destino' }), 'Falta algo', 0);
    expect(fin?.tipo).toBe('finalizar');
    expect(fin?.bloqueo).toBe('Falta algo');
  });

  it('la recogida exige código, bultos y foto según el servicio', () => {
    const foto = new File(['x'], 'f.jpg');
    const base = { pideCodigoRecogida: true, detalle: { bultos: 3 } };
    expect(faltaRecogida(base, { codigo: '12', bultos: '3', foto })).toContain('código');
    expect(faltaRecogida(base, { codigo: '1234', bultos: '', foto })).toContain('bultos');
    expect(faltaRecogida(base, { codigo: '1234', bultos: '3', foto: null })).toContain('foto');
    expect(faltaRecogida(base, { codigo: '1234', bultos: '3', foto })).toBe('');
    expect(
      faltaRecogida({ pideCodigoRecogida: false, detalle: null }, { codigo: '', bultos: '', foto }),
    ).toBe('');
  });
});

describe('ServicioPage', () => {
  function puertos(envio = buildEnvio({ id: 5, estado: 'Asignado', pin: undefined })) {
    return {
      servicio: {
        aceptar: vi.fn(),
        activo: vi.fn(),
        obtener: vi.fn(async () => envio),
        iniciarRuta: vi.fn(async () => buildEnvio({ id: 5, estado: 'En Ruta', pin: undefined })),
        llegadaRecogida: vi.fn(async () =>
          buildEnvio({
            id: 5,
            estado: 'Asignado',
            etapa: 'en_recogida',
            pideCodigoRecogida: true,
            pin: undefined,
          }),
        ),
        recoger: vi.fn(async () =>
          buildEnvio({
            id: 5,
            estado: 'En Ruta',
            pin: undefined,
            urlFotoRecogida: 'https://x/r.jpg',
          }),
        ),
        completarParada: vi.fn(async (): Promise<Parada[]> => [
          { ...PARADA, completadaEn: new Date() },
        ]),
        llegadaDestino: vi.fn(async () =>
          buildEnvio({
            id: 5,
            estado: 'En Ruta',
            etapa: 'regresando',
            idaYVuelta: true,
            destinoVisitadoEn: new Date(),
          }),
        ),
      },
    };
  }

  async function montarServicio(p = puertos(), id = '5') {
    const r = await montar(ServicioPage, {
      usuario: CONDUCTOR,
      inputs: { id },
      providers: [
        perfilPort(),
        { provide: DriverServicePort, useValue: p.servicio },
        { provide: LocationTransportPort, useValue: ubicacionFalsa() },
        {
          provide: TrackingPort,
          useValue: {
            seguimiento: vi.fn(async () => {
              throw new ApiError(0, 'x');
            }),
          },
        },
        { provide: EvidenceStoragePort, useValue: { subir: vi.fn() } },
        { provide: DeliveryPort, useValue: { validar: vi.fn() } },
        { provide: ChatPort, useValue: chatFalso() },
      ],
    });
    await cargarPerfil();
    await r.c.cargar();
    await r.estable();
    return { ...r, p };
  }

  /** Elige la foto en el modal de recogida. */
  function elegirFoto(el: HTMLElement) {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const input = q<HTMLInputElement>(el, '[role="dialog"] input[type=file]');
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })],
      configurable: true,
    });
    input.dispatchEvent(new Event('change'));
  }

  it('nunca muestra el PIN y guía paso a paso: llegué, recojo con código, llegué y entrego', async () => {
    const { el, p, estable } = await montarServicio(
      puertos(
        buildEnvio({
          id: 5,
          estado: 'Asignado',
          pin: '6647',
          metodoPago: 'efectivo',
          tarifa: 20000,
        }),
      ),
    );
    expect(el.textContent).not.toContain('6647');
    expect(el.textContent).toMatch(/Cobra \$\s20\.000 en efectivo/);
    // 1. Llegué a recoger
    botonPorTexto(el, 'Llegué a recoger').click();
    await estable();
    expect(p.servicio.llegadaRecogida).toHaveBeenCalledWith(5);
    // 2. Recoger: exige el código de recogida y la foto
    botonPorTexto(el, 'Recoger la carga').click();
    await estable();
    const confirmar = () => botonPorTexto(el, 'Confirmar y salir a entregar');
    expect(confirmar().disabled).toBe(true);
    expect(q(el, '[role="dialog"]').textContent).toContain('código de 4 dígitos');
    escribir(q(el, '#rec-codigo'), '4821');
    await estable();
    elegirFoto(el);
    await vi.waitFor(() => expect(confirmar().disabled).toBe(false));
    confirmar().click();
    await estable();
    expect(p.servicio.recoger).toHaveBeenCalledWith(5, expect.any(File), {
      codigo: '4821',
      bultos: undefined,
      valorCompra: undefined,
    });
    // Al recoger se comparte la ubicación sin que el conductor lo active a mano
    expect(q(el, '[role="switch"]').getAttribute('aria-checked')).toBe('true');
    expect(el.textContent).toContain('El cliente puede ver por dónde vas.');
    expect(q<HTMLAnchorElement>(el, '[aria-label="Cómo llegar al destino"]').href).toContain(
      'destination=',
    );
    // 3. Llegué a entregar
    p.servicio.llegadaDestino.mockImplementationOnce(async () =>
      buildEnvio({ id: 5, estado: 'En Ruta', etapa: 'en_destino', pin: undefined }),
    );
    botonPorTexto(el, 'Llegué a entregar').click();
    await estable();
    // 4. Finalizar con el PIN de quien recibe
    botonPorTexto(el, 'Finalizar entrega').click();
    await estable();
    expect(q(el, '[role="dialog"]').textContent).toContain('PIN');
  });

  it('si la recogida falla, muestra el error en el modal', async () => {
    const p = puertos(
      buildEnvio({ id: 5, estado: 'Asignado', etapa: 'en_recogida', pin: undefined }),
    );
    p.servicio.recoger.mockImplementation(
      rechaza(new ApiError(400, 'La foto debe ser JPG, PNG o WebP')),
    );
    const { el, estable } = await montarServicio(p);
    botonPorTexto(el, 'Recoger la carga').click();
    await estable();
    elegirFoto(el);
    await vi.waitFor(() =>
      expect(botonPorTexto(el, 'Confirmar y salir a entregar').disabled).toBe(false),
    );
    botonPorTexto(el, 'Confirmar y salir a entregar').click();
    await estable();
    expect(q(el, '[role="dialog"] [role="alert"]').textContent).toContain('JPG, PNG o WebP');
  });

  it('en un mercado registra los bultos y el valor de la compra', async () => {
    const p = puertos(
      buildEnvio({
        id: 5,
        estado: 'Asignado',
        etapa: 'en_recogida',
        tipoServicio: 'mercado',
        detalle: { lista: 'Arroz, panela', presupuesto: 60000, bultos: 2 },
        pin: undefined,
      }),
    );
    const { el, estable } = await montarServicio(p);
    botonPorTexto(el, 'Ya compré, salir a entregar').click();
    await estable();
    expect(q(el, '[role="dialog"]').textContent).toContain('Registrar la compra');
    elegirFoto(el);
    await estable();
    expect(q(el, '[role="dialog"]').textContent).toContain('Cuenta los bultos');
    escribir(q(el, '#rec-bultos'), '2');
    escribir(q(el, '#rec-compra'), '58300');
    await estable();
    await vi.waitFor(() =>
      expect(botonPorTexto(el, 'Confirmar y salir a entregar').disabled).toBe(false),
    );
    botonPorTexto(el, 'Confirmar y salir a entregar').click();
    await estable();
    expect(p.servicio.recoger).toHaveBeenCalledWith(5, expect.any(File), {
      codigo: undefined,
      bultos: 2,
      valorCompra: 58300,
    });
  });

  it('con paradas y de ida y vuelta: marca la parada, la llegada y solo entonces deja entregar', async () => {
    const envio = buildEnvio({
      id: 5,
      estado: 'En Ruta',
      pin: undefined,
      idaYVuelta: true,
      paradas: [PARADA],
      destinatarioNombre: 'Ana',
      destinatarioTelefono: '3001234567',
      metodoPago: 'nequi',
    });
    const { el, p, estable } = await montarServicio(puertos(envio));
    expect(el.textContent).toContain('Servicio pagado con Nequi');
    expect(q<HTMLAnchorElement>(el, 'a[href^="tel:"]').href).toContain('3001234567');
    expect(q<HTMLAnchorElement>(el, 'a[href^="https://wa.me/573001234567"]')).toBeTruthy();
    expect(botonPorTexto(el, 'Llegué al destino, regreso').disabled).toBe(true);
    expect(el.textContent).toContain('Primero marca la parada como hecha.');
    botonPorTexto(el, 'Marcar parada hecha').click();
    await estable();
    expect(p.servicio.completarParada).toHaveBeenCalledWith(5, 11);
    botonPorTexto(el, 'Llegué al destino, regreso').click();
    await estable();
    expect(p.servicio.llegadaDestino).toHaveBeenCalledWith(5);
    expect(q(el, '[aria-label="Cómo llegar al origen"]')).toBeTruthy();
    expect(botonPorTexto(el, 'Llegué al punto de entrega').disabled).toBe(false);
  });

  it('errores al marcar parada o llegada se avisan', async () => {
    const envio = buildEnvio({ id: 5, estado: 'En Ruta', idaYVuelta: true, paradas: [PARADA] });
    const p = puertos(envio);
    p.servicio.completarParada.mockImplementation(rechaza(new ApiError(500, 'x')));
    const { el, estable } = await montarServicio(p);
    const toast = vi.spyOn(TestBed.inject(ToastService), 'error');
    botonPorTexto(el, 'Marcar parada hecha').click();
    await estable();
    expect(toast).toHaveBeenCalled();
  });

  it('muestra el chat con el cliente mientras el servicio está activo', async () => {
    const { el } = await montarServicio();
    expect(el.textContent).toContain('Chat con el cliente');
  });

  it('debería alternar compartir ubicación', async () => {
    const { el, estable } = await montarServicio();
    const sw = q<HTMLButtonElement>(el, '[role="switch"]');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    sw.click();
    await estable();
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(el.textContent).toContain('El cliente puede ver por dónde vas.');
    sw.click();
    await estable();
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });

  it('al entregar debería recargar y mostrar el cierre', async () => {
    const p = puertos();
    const { el, c, estable } = await montarServicio(p);
    p.servicio.obtener.mockImplementation(async () =>
      buildEnvio({ id: 5, estado: 'Entregado', pin: undefined }),
    );
    await c.alEntregar();
    await estable();
    expect(el.textContent).toContain('Entrega completada');
  });

  it.each([
    ['abc', null, 'no es válido'],
    ['9', new ApiError(404, 'No existe el envío con id 9'), 'No encontramos ese servicio'],
    ['9', new ApiError(403, 'No tienes permiso'), 'no está asignado a ti'],
    ['9', new ApiError(500, 'x'), 'Algo salió mal'],
  ])('debería informar errores al cargar (%s)', async (id, error, texto) => {
    const p = puertos();
    if (error) p.servicio.obtener.mockImplementation(rechaza(error));
    const { el } = await montarServicio(p, id);
    expect(el.textContent).toContain(texto);
  });

  it('no debería mostrar un servicio de otro conductor', async () => {
    const { el } = await montarServicio(
      puertos(buildEnvio({ id: 5, estado: 'Asignado', idConductor: 3 })),
    );
    expect(el.textContent).toContain('no está asignado a ti');
  });
});

describe('CU-008 CompartirUbicacionService', () => {
  async function preparar(extra: object[] = []) {
    configurar({
      providers: [
        { provide: LocationTransportPort, useValue: ubicacionFalsa() },
        ...(extra as never[]),
      ],
    });
  }

  it('debería observar la posición, enviarla y detenerse', async () => {
    await preparar();
    const s = TestBed.inject(CompartirUbicacionService);
    const geo = TestBed.inject(GEOLOCALIZACION) as FakeGeolocation;
    const cola = TestBed.inject(LocationQueue);
    const registrar = vi.spyOn(cola, 'registrar');
    s.iniciar(5);
    expect(s.estado()).toBe('activo');
    geo.emitir(4.33, -74.36, Date.UTC(2026, 9, 29, 10));
    await vaciarPromesas(10);
    expect(registrar).toHaveBeenCalledWith(5, {
      lat: 4.33,
      lon: -74.36,
      capturadoEn: '2026-10-29T10:00:00.000Z',
    });
    expect(s.ultimaEnvio()).toBeInstanceOf(Date);
    geo.emitir(95, 0);
    await vaciarPromesas(10);
    s.detener();
    expect(geo.limpiado).toEqual([7]);
    expect(s.estado()).toBe('apagado');
  });

  it('debería marcar permiso denegado y sincronizar al volver la red', async () => {
    await preparar();
    const s = TestBed.inject(CompartirUbicacionService);
    const geo = TestBed.inject(GEOLOCALIZACION) as FakeGeolocation;
    const sincronizar = vi.spyOn(TestBed.inject(LocationQueue), 'sincronizar');
    s.iniciar(5);
    geo.fallar(1);
    expect(s.estado()).toBe('denegado');
    expect(geo.limpiado).toEqual([7]);
    s.iniciar(5);
    geo.fallar(2);
    expect(s.estado()).toBe('no-disponible');
    // Un error pasajero no apaga el seguimiento: al llegar una posición vuelve a "activo"
    geo.emitir(4.33, -74.36);
    await vaciarPromesas(10);
    expect(s.estado()).toBe('activo');
    geo.fallar(3);
    expect(s.estado()).toBe('activo');
    window.dispatchEvent(new Event('online'));
    expect(sincronizar).toHaveBeenCalled();
    s.ngOnDestroy();
  });

  it('debería reenviar la última posición cada 20 s aunque el conductor esté quieto', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await preparar();
    const s = TestBed.inject(CompartirUbicacionService);
    const geo = TestBed.inject(GEOLOCALIZACION) as FakeGeolocation;
    const registrar = vi.spyOn(TestBed.inject(LocationQueue), 'registrar');
    s.iniciar(5);
    expect(s.compartiendo(5)).toBe(true);
    expect(s.compartiendo(6)).toBe(false);
    geo.emitir(4.33, -74.36);
    await vaciarPromesas(10);
    expect(registrar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(LATIDO_UBICACION_MS);
    expect(registrar).toHaveBeenCalledTimes(2);
    expect(registrar.mock.calls[1][1]).toMatchObject({ lat: 4.33, lon: -74.36 });
    s.detener();
    await vi.advanceTimersByTimeAsync(LATIDO_UBICACION_MS * 2);
    expect(registrar).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('sin geolocalización debería quedar no disponible', async () => {
    await preparar([{ provide: GEOLOCALIZACION, useValue: null }]);
    const s = TestBed.inject(CompartirUbicacionService);
    s.iniciar(1);
    expect(s.estado()).toBe('no-disponible');
  });
});
