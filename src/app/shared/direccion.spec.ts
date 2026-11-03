import { FakeEntornoUbicacion, posicion } from '../../testing/fakes';
import { ENTORNO_UBICACION } from './ui/campo-direccion.component';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { FakeGeo, escribir, q } from '../../testing/fakes';
import { montar } from '../../testing/pantallas';
import { Coordenadas, Zona } from '../core/domain';
import { GeoPort } from '../core/ports';
import {
  CampoDireccionComponent,
  ESPERA_BUSQUEDA_MS,
  textoCoordenadas,
} from './ui/campo-direccion.component';
import { SelectorMapaComponent, redondear } from './ui/selector-mapa.component';

const PARQUE = {
  nombre: 'Parque principal',
  detalle: 'Parque principal, Fusagasugá',
  coords: { lat: 4.3369, lon: -74.3638 },
};
const IGLESIA = {
  nombre: 'Catedral',
  detalle: 'Catedral, Fusagasugá',
  coords: { lat: 4.337, lon: -74.364 },
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, CampoDireccionComponent],
  template: `<ti-campo-direccion
    idCampo="dir"
    [formControl]="control"
    [(coords)]="coords"
    [conUbicacion]="true"
    [zonas]="zonas"
  />`,
})
class Anfitrion {
  control = new FormControl('', { nonNullable: true });
  coords = signal<Coordenadas | null>(null);
  zonas: Zona[] = [
    { id: 1, nombre: 'Centro', tarifaBase: 0, centro: { lat: 4.3365, lon: -74.3638 }, radioKm: 3 },
  ];
}

async function montarCampo() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const r = await montar(Anfitrion);
  const geo = TestBed.inject(GeoPort) as FakeGeo;
  const paso = async (ms = 0) => {
    await vi.advanceTimersByTimeAsync(ms);
    r.fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    r.fixture.detectChanges();
  };
  return { ...r, geo, paso, input: q<HTMLInputElement>(r.el, '#dir') };
}

const tecla = (el: HTMLElement, key: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

const botonUbicacion = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Usar mi ubicación'),
  ) as HTMLButtonElement;

describe('CampoDireccionComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('busca con pausa, navega con el teclado y elige con Enter', async () => {
    const { el, c, geo, paso, input } = await montarCampo();
    geo.resultados = [PARQUE, IGLESIA];
    escribir(input, 'Pa');
    await paso(ESPERA_BUSQUEDA_MS);
    expect(geo.buscar).not.toHaveBeenCalled();
    escribir(input, 'Parq');
    await paso(100);
    escribir(input, 'Parque');
    await paso(ESPERA_BUSQUEDA_MS);
    expect(geo.buscar).toHaveBeenCalledTimes(1);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelectorAll('[role="option"]')).toHaveLength(2);
    tecla(input, 'ArrowDown');
    tecla(input, 'ArrowDown');
    tecla(input, 'ArrowDown');
    await paso();
    expect(input.getAttribute('aria-activedescendant')).toMatch(/-0$/);
    tecla(input, 'ArrowUp');
    await paso();
    expect(input.getAttribute('aria-activedescendant')).toMatch(/-1$/);
    tecla(input, 'Enter');
    await paso();
    expect(c.control.value).toBe('Catedral');
    expect(c.coords()).toEqual(IGLESIA.coords);
    expect(el.textContent).toContain('Ubicada en el mapa');
    // Escribir de nuevo borra las coordenadas
    escribir(input, 'Catedral y');
    await paso();
    expect(c.coords()).toBeNull();
    expect(el.textContent).toContain('Elige una sugerencia o márcala en el mapa');
    tecla(input, 'Escape');
  });

  it('sin resultados o si la búsqueda falla, lo dice; al enfocar reabre la lista', async () => {
    const { el, geo, paso, input } = await montarCampo();
    escribir(input, 'Lugar inexistente');
    await paso(ESPERA_BUSQUEDA_MS);
    expect(el.textContent).toContain('Sin resultados en la región');
    geo.fallo = new Error('red');
    escribir(input, 'Otro lugar');
    await paso(ESPERA_BUSQUEDA_MS);
    expect(el.textContent).toContain('No pudimos buscar ahora');
    input.dispatchEvent(new Event('blur'));
    await paso(200);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    geo.fallo = null;
    geo.resultados = [PARQUE];
    escribir(input, 'Parque');
    await paso(ESPERA_BUSQUEDA_MS);
    input.dispatchEvent(new Event('blur'));
    await paso(200);
    input.dispatchEvent(new Event('focus'));
    await paso();
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('"Usar mi ubicación" pone el nombre de la dirección y las coordenadas', async () => {
    const { el, c, paso } = await montarCampo();
    const entorno = TestBed.inject(ENTORNO_UBICACION) as FakeEntornoUbicacion;
    entorno.respuestas = [posicion(4.34, -74.36)];
    botonUbicacion(el).click();
    await paso();
    expect(c.control.value).toBe('Calle falsa 123');
    expect(c.coords()).toEqual({ lat: 4.34, lon: -74.36 });
  });

  it('con una ubicación poco precisa abre el mapa para confirmar el punto', async () => {
    const { el, c, paso } = await montarCampo();
    const entorno = TestBed.inject(ENTORNO_UBICACION) as FakeEntornoUbicacion;
    entorno.respuestas = [posicion(4.34, -74.36, 2500)];
    botonUbicacion(el).click();
    await paso();
    expect(q(el, '[role="dialog"]').textContent).toContain('aproximada (±2.5 km)');
    expect(c.coords()).toBeNull();
  });

  it('si el intento rápido no responde, reintenta con GPS', async () => {
    const { el, c, paso } = await montarCampo();
    const entorno = TestBed.inject(ENTORNO_UBICACION) as FakeEntornoUbicacion;
    entorno.respuestas = [3, posicion(4.3, -74.3)];
    botonUbicacion(el).click();
    await paso();
    expect(c.coords()).toEqual({ lat: 4.3, lon: -74.3 });
  });

  it.each([
    ['granted', 'Windows tiene la ubicación apagada'],
    ['denied', 'bloqueada para este sitio'],
    ['prompt', 'No aceptaste el permiso'],
  ] as const)(
    '"Usar mi ubicación" denegado con permiso %s explica qué hacer',
    async (permiso, texto) => {
      const { el, paso } = await montarCampo();
      const entorno = TestBed.inject(ENTORNO_UBICACION) as FakeEntornoUbicacion;
      entorno.estadoPermiso = permiso;
      entorno.respuestas = [1];
      botonUbicacion(el).click();
      await paso();
      expect(el.textContent).toContain(texto);
    },
  );

  it('"Usar mi ubicación" sin señal, sin soporte o sin https', async () => {
    const { el, paso } = await montarCampo();
    const entorno = TestBed.inject(ENTORNO_UBICACION) as FakeEntornoUbicacion;
    entorno.respuestas = [2, 2];
    botonUbicacion(el).click();
    await paso();
    expect(el.textContent).toContain('No pudimos detectar tu ubicación');
    entorno.seguro = false;
    botonUbicacion(el).click();
    await paso();
    expect(el.textContent).toContain('conexión segura');
    entorno.geolocation = null;
    botonUbicacion(el).click();
    await paso();
    expect(el.textContent).toContain('no permite obtener la ubicación');
  });

  it('"Elegir en el mapa" abre el selector con las zonas y usa el punto elegido', async () => {
    const { el, c, fixture, geo, paso } = await montarCampo();
    (
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Elegir en el mapa'),
      ) as HTMLButtonElement
    ).click();
    await paso();
    expect(q(el, '[role="dialog"]').textContent).toContain('círculos verdes');
    const usar = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(
      (b) => b.textContent?.includes('Usar este punto'),
    )!;
    expect(usar.disabled).toBe(true);
    const selector = fixture.debugElement.query(By.directive(SelectorMapaComponent))
      .componentInstance as SelectorMapaComponent;
    expect(selector.zonas()).toHaveLength(1);
    selector.elegir.emit({ lat: 4.35, lon: -74.37 });
    await paso();
    // Si la búsqueda inversa falla, se usan las coordenadas como texto
    geo.fallo = new Error('red');
    usar.click();
    await paso();
    expect(c.control.value).toBe(textoCoordenadas({ lat: 4.35, lon: -74.37 }));
    expect(c.coords()).toEqual({ lat: 4.35, lon: -74.37 });
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it('se deshabilita con el control', async () => {
    const { c, fixture, input } = await montarCampo();
    c.control.disable();
    fixture.detectChanges();
    expect(input.disabled).toBe(true);
  });
});

describe('SelectorMapaComponent', () => {
  it('redondea a seis decimales', () => {
    expect(redondear(4.33691234567, -74.36381234567)).toEqual({ lat: 4.336912, lon: -74.363812 });
  });

  it('dibuja las zonas y el punto con su radio, y emite al hacer clic en el mapa', async () => {
    const zonas: Zona[] = [
      {
        id: 1,
        nombre: 'Centro',
        tarifaBase: 0,
        centro: { lat: 4.3365, lon: -74.3638 },
        radioKm: 3,
        activa: true,
      },
      {
        id: 2,
        nombre: 'Apagada',
        tarifaBase: 0,
        centro: { lat: 4.4, lon: -74.38 },
        radioKm: 2,
        activa: false,
      },
      { id: 3, nombre: 'Sin centro', tarifaBase: 0, centro: null },
    ];
    const { c, fixture } = await montar(SelectorMapaComponent, {
      inputs: { zonas, punto: { lat: 4.3369, lon: -74.3638 }, radioKm: 2 },
    });
    await vi.waitFor(
      () => expect(fixture.nativeElement.querySelector('.leaflet-container')).toBeTruthy(),
      { timeout: 3000 },
    );
    const emitidos: Coordenadas[] = [];
    c.elegir.subscribe((p) => emitidos.push(p));
    const mapa = (c as unknown as { mapa: { fire(e: string, d: unknown): void } }).mapa;
    mapa.fire('click', { latlng: { lat: 4.1234567, lng: -74.7654321 } });
    expect(emitidos).toEqual([{ lat: 4.123457, lon: -74.765432 }]);
    fixture.componentRef.setInput('radioKm', null);
    fixture.componentRef.setInput('idZonaActiva', 1);
    fixture.componentRef.setInput('punto', null);
    fixture.detectChanges();
    c.irA({ lat: 4.3, lon: -74.3 });
    fixture.destroy();
  });
});
