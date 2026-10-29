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
import { EventoCarga, PerfilConductor } from '../../core/domain';
import {
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
import { LocationQueue } from '../../core/adapters/local/location-queue';
import { ToastService } from '../../shared/ui/toast.service';
import { DocumentoCardComponent } from './components/documento-card.component';
import {
  EntregaModalComponent,
  MENSAJE_PIN_INCORRECTO,
} from './components/entrega-modal.component';
import { MENSAJE_PLACA_DUPLICADA, PerfilPage } from './perfil.page';
import { ServicioPage } from './servicio.page';
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
    s.registrarVehiculo({ id: 1, placa: 'ABC123', categoria: 'Camioneta' });
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
    expect(v.registrar).toHaveBeenCalledWith({ placa: 'ABC12D', categoria: 'Motocarro' });
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

  it('debería mostrar tres tarjetas de documentos y el aviso de revisión si no está aprobado', async () => {
    const { el } = await montarPerfil(vehiculos(), { ...APROBADO, estadoAprobacion: 'Pendiente' });
    expect(el.querySelectorAll('ti-documento-card')).toHaveLength(3);
    expect(el.textContent).toContain('Tu cuenta está en revisión');
  });
});

describe('CU-004 DocumentoCardComponent', () => {
  it('Dado un JPG válido, cuando lo subo, entonces muestra progreso y luego "en revisión" conservando la URL', async () => {
    const eventos = new Subject<EventoCarga>();
    const subir = vi.fn(() => eventos.asObservable());
    const { el, c, estable } = await montar(DocumentoCardComponent, {
      inputs: { tipo: 'Cédula' },
      providers: [{ provide: DocumentsPort, useValue: { subir } }],
    });
    const archivo = new File(['x'], 'cedula.jpg', { type: 'image/jpeg' });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    c.subir(archivo);
    eventos.next({ tipo: 'progreso', porcentaje: 40 });
    await estable();
    expect(subir).toHaveBeenCalledWith(archivo, 'Cédula');
    expect(q(el, '[role="progressbar"]').getAttribute('aria-valuenow')).toBe('40');
    eventos.next({
      tipo: 'completo',
      documento: { id: 3, tipo: 'Cédula', urlArchivo: 'https://c/x.jpg' },
    });
    await estable();
    expect(el.textContent).toContain('Documento recibido, queda en revisión');
    expect(c.documento()?.urlArchivo).toBe('https://c/x.jpg');
  });

  it('debería mostrar el error traducido de multer', async () => {
    const eventos = new Subject<EventoCarga>();
    const { el, c, estable } = await montar(DocumentoCardComponent, {
      inputs: { tipo: 'SOAT' },
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
      inputs: { tipo: 'Licencia' },
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
    await r.c.ngOnInit();
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
    expect(p.entrega.validar).toHaveBeenCalledWith(1, 'https://x/foto.jpg', '1234');
    expect(salidas).toEqual(['entregado']);
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

describe('ServicioPage', () => {
  function puertos(envio = buildEnvio({ id: 5, estado: 'Asignado', pin: undefined })) {
    return {
      servicio: {
        aceptar: vi.fn(),
        activo: vi.fn(),
        obtener: vi.fn(async () => envio),
        iniciarRuta: vi.fn(async () => buildEnvio({ id: 5, estado: 'En Ruta', pin: undefined })),
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
      ],
    });
    await cargarPerfil();
    await r.c.cargar();
    await r.estable();
    return { ...r, p };
  }

  it('nunca debería mostrar el PIN y desde Asignado debería pedir iniciar la ruta', async () => {
    const { el, p, estable } = await montarServicio(
      puertos(buildEnvio({ id: 5, estado: 'Asignado', pin: '6647' })),
    );
    expect(el.textContent).not.toContain('6647');
    expect(el.textContent).toContain('Inicia la ruta para poder finalizar');
    botonPorTexto(el, 'Iniciar ruta').click();
    await estable();
    expect(p.servicio.iniciarRuta).toHaveBeenCalledWith(5);
    // Al iniciar la ruta se comparte la ubicación sin que el conductor lo active a mano
    expect(q(el, '[role="switch"]').getAttribute('aria-checked')).toBe('true');
    expect(el.textContent).toContain('El cliente puede ver por dónde vas.');
    expect(
      q<HTMLAnchorElement>(el, '[aria-label="Cómo llegar al punto de entrega"]').href,
    ).toContain('destination=');
    botonPorTexto(el, 'Finalizar entrega').click();
    await estable();
    expect(q(el, '[role="dialog"]')).toBeTruthy();
  });

  it('debería mostrar un error si iniciar ruta falla', async () => {
    const p = puertos();
    p.servicio.iniciarRuta.mockImplementation(rechaza(new ApiError(500, 'x')));
    const { el, estable } = await montarServicio(p);
    const toast = vi.spyOn(TestBed.inject(ToastService), 'error');
    botonPorTexto(el, 'Iniciar ruta').click();
    await estable();
    expect(toast).toHaveBeenCalled();
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
