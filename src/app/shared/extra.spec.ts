import { ChangeDetectionStrategy, Component, ErrorHandler, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FakeLogger, botonPorTexto, provideFakesBase, q, rechaza } from '../../testing/fakes';
import { montar } from '../../testing/pantallas';
import { LoggerPort } from '../core/ports';
import {
  GlobalErrorHandler,
  VENTANA_REPETIDOS_MS,
  esDeExtension,
} from '../core/logging/global-error-handler';
import { ContadorDirective } from './directives/contador.directive';
import { RevelarDirective } from './directives/revelar.directive';
import { CAMARAS, CamaraComponent, mensajeErrorCamara } from './ui/camara.component';
import { CargaArchivoComponent } from './ui/carga-archivo.component';
import { IconoComponent } from './ui/icono.component';
import { comprimirImagen, escalar, nombreFoto } from './util/imagen';

describe('utilidades de imagen', () => {
  it('escala conservando la proporción y nombra las fotos con fecha', () => {
    expect(escalar(4000, 3000)).toEqual({ ancho: 1600, alto: 1200 });
    expect(escalar(800, 600)).toEqual({ ancho: 800, alto: 600 });
    expect(escalar(0, 0)).toEqual({ ancho: 0, alto: 0 });
    expect(nombreFoto('entrega-5', new Date(2026, 9, 29, 14, 3, 7))).toBe(
      'entrega-5-20261029-140307.jpg',
    );
  });

  it('no toca PDF ni imágenes pequeñas, y devuelve el original si no puede comprimir', async () => {
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    expect(await comprimirImagen(pdf)).toBe(pdf);
    const chica = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    expect(await comprimirImagen(chica)).toBe(chica);
    const grande = new File(['x'], 'g.jpg', { type: 'image/jpeg' });
    Object.defineProperty(grande, 'size', { value: 8_000_000 });
    expect(await comprimirImagen(grande)).toBe(grande); // jsdom no tiene createImageBitmap
  });

  it('comprime con createImageBitmap: usa el JPEG si pesa menos y el original si no o si falla', async () => {
    const grande = new File(['x'], 'g.png', { type: 'image/png' });
    Object.defineProperty(grande, 'size', { value: 8_000_000 });
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4000, height: 3000, close })),
    );
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage: vi.fn() } as never);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((cb) => cb(new Blob(['jpeg'])));
    const comprimida = await comprimirImagen(grande);
    expect(comprimida.name).toBe('g.jpg');
    expect(close).toHaveBeenCalled();
    toBlob.mockImplementation((cb) => cb(null));
    expect(await comprimirImagen(grande)).toBe(grande);
    // Si el JPEG pesa más que el original, se queda el original
    toBlob.mockImplementation((cb) => cb(new Blob(['un jpeg más grande'])));
    const liviana = new File(['x'], 'l.png', { type: 'image/png' });
    expect(await comprimirImagen(liviana, 0)).toBe(liviana);
    getContext.mockReturnValue(null);
    expect(await comprimirImagen(grande)).toBe(grande);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});

describe('IconoComponent', () => {
  it('pinta el SVG de Lucide sin tamaño fijo y es decorativo salvo que tenga etiqueta', async () => {
    @Component({
      changeDetection: ChangeDetectionStrategy.OnPush,
      imports: [IconoComponent],
      template: `<ti-icono nombre="truck" id="a" /><ti-icono
          nombre="star"
          etiqueta="Favorito"
          id="b"
        />`,
    })
    class Anfitrion {}
    const { el } = await montar(Anfitrion);
    const a = q(el, '#a');
    expect(a.getAttribute('aria-hidden')).toBe('true');
    expect(a.querySelector('svg')?.getAttribute('width')).toBeNull();
    expect(a.querySelector('svg.lucide-truck')).toBeTruthy();
    expect(q(el, '#b').getAttribute('aria-label')).toBe('Favorito');
    expect(q(el, '#b').getAttribute('role')).toBe('img');
  });
});

describe('directivas de animación', () => {
  it('sin IntersectionObserver revelan y cuentan de inmediato', async () => {
    @Component({
      changeDetection: ChangeDetectionStrategy.OnPush,
      imports: [RevelarDirective, ContadorDirective],
      template: `<p tiRevelar [retraso]="120" id="r">Hola</p>
        <span id="c" [tiContador]="valor()" sufijo=" ★" [decimales]="decimales()"></span>`,
    })
    class Anfitrion {
      valor = signal(1240);
      decimales = signal(0);
    }
    const { el, fixture, estable } = await montar(Anfitrion);
    expect(q(el, '#r').classList).toContain('visible');
    expect(q(el, '#r').style.getPropertyValue('--retraso')).toBe('120ms');
    expect(q(el, '#c').textContent).toBe('1.240 ★');
    fixture.componentInstance.valor.set(4.8);
    fixture.componentInstance.decimales.set(1);
    await estable();
    expect(q(el, '#c').textContent).toBe('4,8 ★');
  });

  it('con IntersectionObserver esperan a ser visibles', async () => {
    const observados: ((e: { isIntersecting: boolean }[]) => void)[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
          observados.push(cb);
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) =>
      setTimeout(() => f(performance.now() + 2000), 0),
    );
    @Component({
      changeDetection: ChangeDetectionStrategy.OnPush,
      imports: [RevelarDirective, ContadorDirective],
      template: `<p tiRevelar id="r">Hola</p>
        <span id="c" [tiContador]="50"></span>`,
    })
    class Anfitrion {}
    const { el } = await montar(Anfitrion);
    expect(q(el, '#r').classList).not.toContain('visible');
    expect(q(el, '#c').textContent).toBe('0');
    observados.forEach((cb) => cb([{ isIntersecting: true }]));
    await new Promise((r) => setTimeout(r, 10));
    expect(q(el, '#r').classList).toContain('visible');
    expect(q(el, '#c').textContent).toBe('50');
    vi.unstubAllGlobals();
  });
});

describe('GlobalErrorHandler', () => {
  it('ignora errores de extensiones y agrupa los repetidos', () => {
    TestBed.configureTestingModule({
      providers: [provideFakesBase(), { provide: ErrorHandler, useClass: GlobalErrorHandler }],
    });
    const h = TestBed.inject(ErrorHandler) as GlobalErrorHandler;
    const log = TestBed.inject(LoggerPort) as FakeLogger;
    const ext = new TypeError("Cannot read properties of undefined (reading 'M_ID')");
    ext.stack =
      'TypeError: x\n    at Y (chrome-extension://abc/executors/200.js:1:761)\n    at XMLHttpRequest.<anonymous> (chrome-extension://abc/x.js:1:2598)';
    expect(esDeExtension(ext)).toBe(true);
    h.handleError(ext);
    expect(log.de('ERROR')).toHaveLength(0);
    const propio = new Error('falló algo');
    h.handleError(propio, 1000);
    h.handleError(propio, 2000);
    expect(log.de('ERROR')).toHaveLength(1);
    h.handleError(propio, 1000 + VENTANA_REPETIDOS_MS + 1);
    expect(log.de('ERROR')).toHaveLength(2);
    h.handleError('texto suelto', 0);
    expect(log.de('ERROR')).toHaveLength(3);
    for (let i = 0; i < 60; i++) h.handleError(new Error('e' + i), 0);
    expect(log.de('ERROR').length).toBe(63);
  });
});

describe('CamaraComponent', () => {
  function camarasFalsas(dispositivos = 2) {
    const pista = { stop: vi.fn() };
    return {
      pista,
      camaras: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [pista] }) as unknown as MediaStream),
        enumerateDevices: vi.fn(async () =>
          Array.from({ length: dispositivos }, () => ({ kind: 'videoinput' }) as MediaDeviceInfo),
        ),
      },
    };
  }

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:foto');
    URL.revokeObjectURL = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(['jpg'], { type: 'image/jpeg' }));
    };
  });

  it('abre la cámara trasera, captura, permite repetir, cambiar de cámara y usar la foto', async () => {
    const { camaras, pista } = camarasFalsas();
    const { el, c, estable, fixture } = await montar(CamaraComponent, {
      providers: [{ provide: CAMARAS, useValue: camaras }],
      inputs: { titulo: 'Foto de tu Cédula', prefijo: 'cedula' },
    });
    await new Promise((r) => setTimeout(r, 0));
    await estable();
    expect(camaras.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: { ideal: 'environment' } }),
      }),
    );
    expect(el.textContent).toContain('Encuadra el documento');
    expect(q(el, '[aria-label="Cambiar de cámara"]')).toBeTruthy();
    const fotos: File[] = [];
    c.foto.subscribe((f) => fotos.push(f));
    await c.capturar();
    await estable();
    expect(q<HTMLImageElement>(el, 'img').src).toBe('blob:foto');
    c.repetir();
    await estable();
    expect(el.querySelector('img')).toBeNull();
    await c.cambiarCamara();
    expect(camaras.getUserMedia).toHaveBeenLastCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: { ideal: 'user' } }),
      }),
    );
    await c.capturar();
    c.usar();
    expect(fotos).toHaveLength(1);
    expect(fotos[0].name).toMatch(/^cedula-\d{8}-\d{6}\.jpg$/);
    expect(fotos[0].type).toBe('image/jpeg');
    expect(pista.stop).toHaveBeenCalled();
    fixture.destroy();
  });

  it('si no hay permiso o no hay cámara, explica y ofrece elegir una foto', async () => {
    const { camaras } = camarasFalsas(1);
    camaras.getUserMedia.mockImplementation(async () => {
      throw Object.assign(new Error('x'), { name: 'NotAllowedError' });
    });
    const { el, c, estable } = await montar(CamaraComponent, {
      providers: [{ provide: CAMARAS, useValue: camaras }],
      inputs: { guia: 'entrega' },
    });
    await new Promise((r) => setTimeout(r, 0));
    await estable();
    expect(q(el, '[role="alert"]').textContent).toContain('No diste permiso');
    const fotos: File[] = [];
    c.foto.subscribe((f) => fotos.push(f));
    const input = q<HTMLInputElement>(el, 'input[type=file]');
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'f.jpg', { type: 'image/jpeg' })],
    });
    input.dispatchEvent(new Event('change'));
    expect(fotos).toHaveLength(1);
    TestBed.resetTestingModule();
    const r2 = await montar(CamaraComponent, { providers: [{ provide: CAMARAS, useValue: null }] });
    await new Promise((r) => setTimeout(r, 0));
    await r2.estable();
    expect(r2.el.textContent).toContain('No encontramos una cámara');
  });

  it('con los botones: tomar, repetir, cambiar de cámara y usar; selfie con la cámara frontal', async () => {
    const { camaras } = camarasFalsas();
    const r = await montar(CamaraComponent, {
      providers: [{ provide: CAMARAS, useValue: camaras }],
      inputs: { guia: 'selfie' },
    });
    await new Promise((ok) => setTimeout(ok, 0));
    await r.estable();
    expect(q(r.el, 'video').className).toContain('-scale-x-100');
    expect(r.el.querySelector(String.raw`.\!rounded-\[50\%\]`)).toBeTruthy();
    const fotos: File[] = [];
    r.c.foto.subscribe((f) => fotos.push(f));
    q<HTMLButtonElement>(r.el, '[aria-label="Tomar foto"]').click();
    await new Promise((ok) => setTimeout(ok, 0));
    await r.estable();
    botonPorTexto(r.el, /Repetir/).click();
    await r.estable();
    q<HTMLButtonElement>(r.el, '[aria-label="Cambiar de cámara"]').click();
    await new Promise((ok) => setTimeout(ok, 0));
    await r.estable();
    q<HTMLButtonElement>(r.el, '[aria-label="Tomar foto"]').click();
    await new Promise((ok) => setTimeout(ok, 0));
    await r.estable();
    botonPorTexto(r.el, /Usar foto/).click();
    expect(fotos).toHaveLength(1);
    const cerrar = vi.fn();
    r.c.cerrar.subscribe(cerrar);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(cerrar).toHaveBeenCalled();
    r.fixture.destroy();
  });

  it('casos de borde: guía de entrega, foto fallida, repetir sin cámara, usar sin foto y sin lista de cámaras', async () => {
    const { camaras } = camarasFalsas();
    camaras.enumerateDevices.mockImplementation(rechaza(new Error('sin permiso')));
    const r = await montar(CamaraComponent, {
      providers: [{ provide: CAMARAS, useValue: camaras }],
      inputs: { guia: 'entrega' },
    });
    await new Promise((ok) => setTimeout(ok, 0));
    await r.estable();
    expect(r.el.querySelector('[aria-label="Cambiar de cámara"]')).toBeNull();
    expect(r.el.querySelector('.aspect-square')).toBeTruthy();
    const fotos: File[] = [];
    r.c.foto.subscribe((f) => fotos.push(f));
    r.c.usar();
    expect(fotos).toHaveLength(0);
    // Elegir una foto sin archivo no emite nada
    const sinArchivo = { target: { files: [] } } as unknown as Event;
    (r.c as unknown as { alElegir(e: Event): void }).alElegir(sinArchivo);
    expect(fotos).toHaveLength(0);
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
    await r.c.capturar();
    await r.estable();
    expect(q(r.el, '[role="alert"]').textContent).toContain('No se pudo tomar la foto');
    // Sin cámara abierta, repetir la vuelve a abrir
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never;
    await r.c.capturar();
    r.c.repetir();
    await new Promise((ok) => setTimeout(ok, 0));
    expect(camaras.getUserMedia).toHaveBeenCalledTimes(2);
    r.fixture.destroy();
  });

  it('la cámara del navegador solo se usa si existe getUserMedia; https por defecto', () => {
    TestBed.resetTestingModule();
    expect(TestBed.inject(CAMARAS)).toBeNull();
    TestBed.resetTestingModule();
    const mediaDevices = { getUserMedia: vi.fn(), enumerateDevices: vi.fn() };
    vi.stubGlobal('navigator', { ...navigator, mediaDevices });
    expect(TestBed.inject(CAMARAS)).toBe(mediaDevices);
    vi.stubGlobal('isSecureContext', false);
    expect(mensajeErrorCamara({ name: 'NotFoundError' })).toContain('conexión segura');
    vi.stubGlobal('isSecureContext', undefined);
    expect(mensajeErrorCamara({ name: 'NotFoundError' })).toContain('No encontramos');
    vi.unstubAllGlobals();
  });

  it('traduce cada error de getUserMedia', () => {
    expect(mensajeErrorCamara({ name: 'NotAllowedError' }, false)).toContain('conexión segura');
    expect(mensajeErrorCamara({ name: 'NotReadableError' })).toContain('Otra aplicación');
    expect(mensajeErrorCamara({ name: 'OverconstrainedError' })).toContain('No encontramos');
    expect(mensajeErrorCamara(new Error('x'))).toBe('No se pudo abrir la cámara.');
  });

  it('CargaArchivo abre la cámara y procesa la foto tomada', async () => {
    const { camaras } = camarasFalsas(1);
    const { el, c, estable } = await montar(CargaArchivoComponent, {
      providers: [{ provide: CAMARAS, useValue: camaras }],
      inputs: { conCamara: true, tipos: ['image/jpeg'] },
    });
    const emitidos: File[] = [];
    c.archivo.subscribe((a) => emitidos.push(a));
    (
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Tomar foto'),
      ) as HTMLButtonElement
    ).click();
    await estable();
    expect(el.querySelector('ti-camara')).toBeTruthy();
    const camara = el.querySelector('ti-camara') as HTMLElement;
    (camara.querySelector('[aria-label="Cerrar la cámara"]') as HTMLButtonElement).click();
    await estable();
    expect(el.querySelector('ti-camara')).toBeNull();
    (c as unknown as { alFotografiar(f: File): void }).alFotografiar(
      new File(['x'], 'foto.jpg', { type: 'image/jpeg' }),
    );
    await vi.waitFor(() => expect(emitidos).toHaveLength(1));
  });
});
