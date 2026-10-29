import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { CONDUCTOR, buildEnvio } from '../../../testing/fixtures';
import {
  FakeGeolocation,
  FakeLocalForage,
  botonPorTexto,
  configPrueba,
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
  KeyValueStorePort,
  LocationTransportPort,
  RouteStartPort,
  VehiclesPort,
} from '../../core/ports';
import { LocationQueue } from '../../core/adapters/local/local-adapters';
import { MockLocationAdapter } from '../../core/adapters/mock/mock-adapters';
import { ToastService } from '../../shared/ui/toast.service';
import { DocumentoCardComponent } from './components/documento-card.component';
import {
  EntregaModalComponent,
  MENSAJE_PIN_INCORRECTO,
} from './components/entrega-modal.component';
import { MENSAJE_PLACA_DUPLICADA, MENSAJE_SIN_PERFIL, PerfilPage } from './perfil.page';
import { ServicioPage } from './servicio.page';
import { ActiveServiceStore } from './state/active-service.store';
import { CompartirUbicacionService } from './state/compartir-ubicacion.service';
import { DriverProfileStore } from './state/driver-profile.store';
import { GEOLOCALIZACION } from './state/geolocalizacion';
import { INTERVALO_TABLERO_MS, MENSAJE_TOMADO, TableroPage } from './tablero.page';

const APROBADO: PerfilConductor = { idConductor: 1, estadoAprobacion: 'Aprobado' };

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
    expect(v.registrar).toHaveBeenCalledWith({
      placa: 'ABC12D',
      categoria: 'Motocarro',
      idConductor: 1,
    });
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
    [new ApiError(404, 'No existe un conductor con id 1'), MENSAJE_SIN_PERFIL],
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

  it('sin perfil de conductor debería explicar el bloqueo y no permitir registrar ni subir', async () => {
    const { el, v } = await montarPerfil(vehiculos(), {
      idConductor: null,
      estadoAprobacion: 'Pendiente',
    });
    expect(el.textContent).toContain('Tu perfil de conductor aún no está creado');
    expect(botonPorTexto(el, 'Registrar vehículo').disabled).toBe(true);
    expect(el.querySelector('ti-documento-card')).toBeNull();
    expect(v.registrar).not.toHaveBeenCalled();
  });

  it('debería mostrar tres tarjetas de documentos y el aviso de revisión si no está aprobado', async () => {
    const { el } = await montarPerfil(vehiculos(), {
      idConductor: 1,
      estadoAprobacion: 'Pendiente',
    });
    expect(el.querySelectorAll('ti-documento-card')).toHaveLength(3);
    expect(el.textContent).toContain('Tu cuenta está en revisión');
  });
});

describe('CU-004 DocumentoCardComponent', () => {
  it('Dado un JPG válido, cuando lo subo, entonces muestra progreso y luego "en revisión" conservando la URL', async () => {
    const eventos = new Subject<EventoCarga>();
    const subir = vi.fn(() => eventos.asObservable());
    const { el, c, estable } = await montar(DocumentoCardComponent, {
      inputs: { tipo: 'Cédula', idConductor: 1 },
      providers: [{ provide: DocumentsPort, useValue: { subir } }],
    });
    const archivo = new File(['x'], 'cedula.jpg', { type: 'image/jpeg' });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    c.subir(archivo);
    eventos.next({ tipo: 'progreso', porcentaje: 40 });
    await estable();
    expect(subir).toHaveBeenCalledWith(archivo, 'Cédula', 1);
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
      inputs: { tipo: 'SOAT', idConductor: 1 },
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
      inputs: { tipo: 'Licencia', idConductor: 1 },
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
      },
    };
  }

  async function montarTablero(p = puertos(), perfil = APROBADO, extra: object[] = []) {
    const r = await montar(TableroPage, {
      usuario: CONDUCTOR,
      providers: [
        perfilPort(perfil),
        { provide: DriverBoardPort, useValue: p.tablero },
        { provide: DriverServicePort, useValue: p.servicio },
        ...(extra as never[]),
      ],
    });
    await cargarPerfil();
    await r.c.ngOnInit();
    await r.estable();
    return { ...r, p };
  }

  it('Dado un conductor no aprobado, entonces no muestra el tablero y explica por qué', async () => {
    const { el, p } = await montarTablero(undefined, {
      idConductor: 1,
      estadoAprobacion: 'Pendiente',
    });
    expect(el.textContent).toContain('Tu cuenta está en revisión');
    expect(q<HTMLAnchorElement>(el, 'a[href="/conductor/perfil"]')).toBeTruthy();
    expect(p.tablero.disponibles).not.toHaveBeenCalled();
  });

  it('debería explicar un rechazo', async () => {
    const { el } = await montarTablero(undefined, {
      idConductor: 1,
      estadoAprobacion: 'Rechazado',
    });
    expect(el.textContent).toContain('Tu solicitud fue rechazada');
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
    expect(p.servicio.aceptar).toHaveBeenCalledWith(7, 1);
    expect(navegar).toHaveBeenCalledWith(['/conductor/servicio', 7]);
    expect(await TestBed.inject(KeyValueStorePort).get(ActiveServiceStore.clave(1))).toBe(7);
  });

  it('Dado que otro conductor lo tomó, cuando acepto, entonces avisa y refresca la lista', async () => {
    const p = puertos();
    p.servicio.aceptar.mockImplementation(
      rechaza(new ApiError(400, 'Este envío ya fue tomado por otro conductor')),
    );
    const { el, estable } = await montarTablero(p);
    const toast = vi.spyOn(TestBed.inject(ToastService), 'error');
    botonPorTexto(el, 'Aceptar servicio').click();
    await estable();
    botonPorTexto(q(el, '[role="dialog"]'), 'Aceptar servicio').click();
    await estable();
    expect(toast).toHaveBeenCalledWith(MENSAJE_TOMADO);
    expect(p.tablero.disponibles).toHaveBeenCalledTimes(2);
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

  it('Dado un servicio activo, entonces bloquea aceptar otro (RN_OP_002)', async () => {
    const almacen = new FakeLocalForage();
    almacen.datos.set(ActiveServiceStore.clave(1), 5);
    const { el } = await montarTablero(undefined, APROBADO, [
      { provide: KeyValueStorePort, useValue: almacen },
    ]);
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
      servicio: { aceptar: vi.fn(), obtener: vi.fn(async () => envio) },
      ruta: {
        iniciar: vi.fn(async () => buildEnvio({ id: 5, estado: 'En Ruta', pin: undefined })),
      },
    };
  }

  async function montarServicio(p = puertos(), features = {}, id = '5') {
    const r = await montar(ServicioPage, {
      usuario: CONDUCTOR,
      inputs: { id },
      config: configPrueba({ features }),
      providers: [
        perfilPort(),
        { provide: DriverServicePort, useValue: p.servicio },
        { provide: RouteStartPort, useValue: p.ruta },
        { provide: LocationTransportPort, useClass: MockLocationAdapter },
        { provide: EvidenceStoragePort, useValue: { subir: vi.fn() } },
        { provide: DeliveryPort, useValue: { validar: vi.fn() } },
      ],
    });
    await cargarPerfil();
    await r.c.cargar();
    await r.estable();
    return { ...r, p };
  }

  it('nunca debería mostrar el PIN y debería permitir finalizar desde Asignado sin el flag de ruta', async () => {
    const { el, estable } = await montarServicio(
      puertos(buildEnvio({ id: 5, estado: 'Asignado', pin: '6647' })),
    );
    expect(el.textContent).not.toContain('6647');
    expect(el.textContent).not.toContain('Iniciar ruta');
    botonPorTexto(el, 'Finalizar entrega').click();
    await estable();
    expect(q(el, '[role="dialog"]')).toBeTruthy();
  });

  it('con el flag iniciarRutaEndpoint debería iniciar ruta antes de entregar', async () => {
    const { el, p, estable } = await montarServicio(undefined, { iniciarRutaEndpoint: true });
    expect(el.textContent).toContain('Inicia la ruta para poder finalizar');
    botonPorTexto(el, 'Iniciar ruta').click();
    await estable();
    expect(p.ruta.iniciar).toHaveBeenCalledWith(5);
    expect(botonPorTexto(el, 'Finalizar entrega')).toBeTruthy();
  });

  it('debería mostrar un error si iniciar ruta falla', async () => {
    const p = puertos();
    p.ruta.iniciar.mockImplementation(rechaza(new ApiError(500, 'x')));
    const { el, estable } = await montarServicio(p, { iniciarRutaEndpoint: true });
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

  it('al entregar debería limpiar el servicio activo y mostrar el cierre', async () => {
    const p = puertos();
    const { el, c, estable } = await montarServicio(p);
    await TestBed.inject(ActiveServiceStore).guardar(1, 5);
    p.servicio.obtener.mockImplementation(async () =>
      buildEnvio({ id: 5, estado: 'Entregado', pin: undefined }),
    );
    await c.alEntregar();
    await estable();
    expect(el.textContent).toContain('Entrega completada');
    expect(await TestBed.inject(KeyValueStorePort).get(ActiveServiceStore.clave(1))).toBeNull();
  });

  it.each([
    ['abc', null, 'no es válido'],
    ['9', new ApiError(404, 'No existe el envío con id 9'), 'No encontramos ese servicio'],
    ['9', new ApiError(500, 'x'), 'Algo salió mal'],
  ])('debería informar errores al cargar (%s)', async (id, error, texto) => {
    const p = puertos();
    if (error) p.servicio.obtener.mockImplementation(rechaza(error));
    const { el } = await montarServicio(p, {}, id);
    expect(el.textContent).toContain(texto);
  });

  it('no debería mostrar un servicio de otro conductor', async () => {
    const { el } = await montarServicio(
      puertos(buildEnvio({ id: 5, estado: 'Asignado', idConductor: 3 })),
    );
    expect(el.textContent).toContain('no está asignado a ti');
  });
});

describe('ActiveServiceStore', () => {
  it('debería devolver el activo solo si sigue activo y es del conductor', async () => {
    const obtener = vi.fn();
    configurar({ providers: [{ provide: DriverServicePort, useValue: { obtener } }] });
    const s = TestBed.inject(ActiveServiceStore);
    expect(await s.actual(1)).toBeNull();
    await s.guardar(1, 5);
    obtener.mockImplementation(async () =>
      buildEnvio({ id: 5, estado: 'En Ruta', idConductor: 1 }),
    );
    expect(await s.actual(1)).toBe(5);
    obtener.mockImplementation(rechaza(new ApiError(0, 'x')));
    expect(await s.actual(1)).toBe(5);
    obtener.mockImplementation(async () =>
      buildEnvio({ id: 5, estado: 'Entregado', idConductor: 1 }),
    );
    expect(await s.actual(1)).toBeNull();
  });
});

describe('CU-008 CompartirUbicacionService', () => {
  async function preparar(extra: object[] = []) {
    configurar({
      providers: [
        { provide: LocationTransportPort, useClass: MockLocationAdapter },
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
    s.iniciar(5);
    geo.fallar(2);
    expect(s.estado()).toBe('no-disponible');
    window.dispatchEvent(new Event('online'));
    expect(sincronizar).toHaveBeenCalled();
    s.ngOnDestroy();
  });

  it('sin geolocalización debería quedar no disponible', async () => {
    await preparar([{ provide: GEOLOCALIZACION, useValue: null }]);
    const s = TestBed.inject(CompartirUbicacionService);
    s.iniciar(1);
    expect(s.estado()).toBe('no-disponible');
  });
});
