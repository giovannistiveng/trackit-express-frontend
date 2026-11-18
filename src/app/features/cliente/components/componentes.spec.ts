import { TestBed } from '@angular/core/testing';
import { buildEnvio } from '../../../../testing/fixtures';
import { Seguimiento } from '../../../core/domain';
import { LineaTiempoComponent } from './linea-tiempo.component';
import { DesgloseTarifaComponent } from './desglose-tarifa.component';
import { EtapasServicioComponent } from '../../../shared/ui/etapas-servicio.component';
import {
  MapaEnvioComponent,
  claveRuta,
  describirMapa,
  interpolar,
} from '../../../shared/ui/mapa-envio.component';
import { RutaMapa } from '../../../core/domain';
import { FakeGeo, q } from '../../../../testing/fakes';
import { GeoPort } from '../../../core/ports';

describe('LineaTiempoComponent', () => {
  async function montar(
    estado: 'Pendiente' | 'En Ruta' | 'Entregado' | 'Cancelado',
    historial = buildEnvio({ estado }).historial,
  ) {
    const f = TestBed.createComponent(LineaTiempoComponent);
    f.componentRef.setInput('historial', historial);
    f.componentRef.setInput('estadoActual', estado);
    await f.whenStable();
    return f.nativeElement as HTMLElement;
  }

  it('debería mostrar las paradas cumplidas con fecha y las pendientes sin fecha', async () => {
    const el = await montar('Pendiente');
    expect(el.querySelectorAll('li')).toHaveLength(4);
    expect(el.querySelectorAll('time')).toHaveLength(1);
  });

  it('debería marcar En Ruta y, al entregar, fechar las cuatro paradas', async () => {
    const el = await montar('En Ruta');
    expect(el.textContent).toContain('El conductor va en camino');
    expect(el.querySelectorAll('li')).toHaveLength(4);
    const el2 = await montar('Entregado');
    expect(el2.querySelectorAll('time')).toHaveLength(4);
  });

  it('un envío cancelado muestra solo lo que alcanzó y la cancelación al final', async () => {
    const base = new Date('2026-10-29T10:00:00Z').getTime();
    const el = await montar('Cancelado', [
      { estado: 'Pendiente', fecha: new Date(base) },
      { estado: 'Asignado', fecha: new Date(base + 60_000) },
      { estado: 'Cancelado', fecha: new Date(base + 120_000) },
    ]);
    const pasos = Array.from(el.querySelectorAll('li p.font-bold')).map((p) =>
      p.textContent?.replace('(estado actual)', '').trim(),
    );
    expect(pasos).toEqual(['Pendiente', 'Asignado', 'Cancelado']);
    expect(el.textContent).toContain('El envío se canceló');
  });
});

describe('DesgloseTarifaComponent y EtapasServicioComponent', () => {
  it('el desglose lista extras, acceso destapado, nocturno y tarifa mínima', async () => {
    const f = TestBed.createComponent(DesgloseTarifaComponent);
    f.componentRef.setInput('desglose', {
      categoria: 'Furgoneta',
      banderazo: 10000,
      distancia: 8000,
      tiempo: 2000,
      recargoZona: 0,
      paradas: 1,
      recargoParadas: 1500,
      idaYVuelta: false,
      extras: [
        { concepto: '2 ayudantes', valor: 50000 },
        { concepto: 'Escaleras (3 pisos)', valor: 12000 },
      ],
      recargoAcceso: 3000,
      recargoNocturno: 4000,
      minimoAplicado: true,
      total: 90500,
    });
    f.componentRef.setInput('abierto', true);
    await f.whenStable();
    const t = (f.nativeElement as HTMLElement).textContent?.replaceAll(/\s+/g, ' ') ?? '';
    expect(t).toContain('1 parada');
    expect(t).toMatch(/2 ayudantes\s*\$ 50\.000/);
    expect(t).toMatch(/Escaleras \(3 pisos\)\s*\$ 12\.000/);
    expect(t).toMatch(/Vía destapada o finca \(15 %\)\s*\$ 3\.000/);
    expect(t).toContain('Recargo nocturno (20 %)');
    expect(t).toContain('tarifa mínima');
    expect(t).not.toContain('Recargo de zona');
  });

  it('las etapas marcan lo hecho, el paso actual y el regreso en ida y vuelta', async () => {
    const f = TestBed.createComponent(EtapasServicioComponent);
    f.componentRef.setInput('etapa', 'en_camino');
    f.componentRef.setInput('rol', 'conductor');
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[aria-current="step"]')?.textContent).toContain('En camino');
    expect(el.textContent).toContain('(hecho)');
    f.componentRef.setInput('etapa', 'regresando');
    f.componentRef.setInput('idaYVuelta', true);
    await f.whenStable();
    expect(el.textContent).toContain('De regreso');
    f.componentRef.setInput('etapa', 'cancelado');
    await f.whenStable();
    expect(el.textContent).toContain('Este servicio fue cancelado.');
  });
});

describe('MapaEnvioComponent', () => {
  const seguimiento = (lat: number): Seguimiento => ({
    idEnvio: 1,
    estado: 'En Ruta',
    origen: { direccion: 'Casco Urbano', coords: { lat: 4.3369, lon: -74.3638 } },
    destino: { direccion: 'Silvania', coords: { lat: 4.4033, lon: -74.3878 } },
    ultima: { lat, lon: -74.36, capturadoEn: 'x' },
    recorrido: [
      { lat: 4.33, lon: -74.36, capturadoEn: 'a' },
      { lat, lon: -74.36, capturadoEn: 'b' },
    ],
    enVivo: true,
    distanciaRestanteKm: 5,
    etaMinutos: 13,
  });

  it('debería dibujar origen, destino, recorrido y el conductor en vivo, y moverlo', async () => {
    const geo = new FakeGeo();
    TestBed.configureTestingModule({ providers: [{ provide: GeoPort, useValue: geo }] });
    const f = TestBed.createComponent(MapaEnvioComponent);
    f.componentRef.setInput('seguimiento', seguimiento(4.34));
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    // Leaflet se importa de forma perezosa: en equipos lentos tarda más
    await vi.waitFor(() => expect(el.querySelector('.leaflet-container')).toBeTruthy(), {
      timeout: 5000,
    });
    await vi.waitFor(() => expect(el.querySelectorAll('.leaflet-marker-icon')).toHaveLength(3), {
      timeout: 5000,
    });
    expect(el.textContent).toContain('OpenStreetMap');
    expect(el.querySelector('.marcador-vivo.activo')).toBeTruthy();
    expect(el.querySelectorAll('path.leaflet-interactive').length).toBeGreaterThanOrEqual(2);
    f.componentRef.setInput('seguimiento', { ...seguimiento(4.35), enVivo: false });
    await f.whenStable();
    expect(el.querySelectorAll('.leaflet-marker-icon')).toHaveLength(3);
    expect(el.querySelector('.marcador-vivo.activo')).toBeNull();
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain(
      'rumbo a Silvania',
    );
    // La ruta por calles se pide una sola vez y su distancia se muestra en el mapa
    await vi.waitFor(() => expect(el.textContent).toContain('4.5 km'));
    expect(geo.ruta).toHaveBeenCalledTimes(1);
    f.destroy();
  });

  it('si la ruta por calles falla, el mapa sigue sin ella', async () => {
    const geo = new FakeGeo();
    geo.fallo = new Error('sin red');
    TestBed.configureTestingModule({ providers: [{ provide: GeoPort, useValue: geo }] });
    const f = TestBed.createComponent(MapaEnvioComponent);
    f.componentRef.setInput('seguimiento', seguimiento(4.34));
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    await vi.waitFor(() => expect(el.querySelectorAll('.leaflet-marker-icon')).toHaveLength(3), {
      timeout: 5000,
    });
    await vi.waitFor(() => expect(geo.ruta).toHaveBeenCalled());
    expect(el.textContent).not.toContain('por carretera');
    f.destroy();
  });

  it('centra con uno o varios puntos, ruta en línea recta, conductor rumbo a recoger y animación', async () => {
    const geo = new FakeGeo();
    geo.ruta.mockImplementation(async () => ({
      puntos: [
        { lat: 4.33, lon: -74.36 },
        { lat: 4.4, lon: -74.38 },
      ],
      km: 6.1,
      minutos: 15,
      exacta: false,
    }));
    TestBed.configureTestingModule({ providers: [{ provide: GeoPort, useValue: geo }] });
    const f = TestBed.createComponent(MapaEnvioComponent);
    // Antes de cargar Leaflet centrar no hace nada
    f.componentInstance.centrar();
    f.componentRef.setInput('posicionPropia', { lat: 4.34, lon: -74.36 });
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    await vi.waitFor(() => expect(el.querySelector('.leaflet-container')).toBeTruthy(), {
      timeout: 5000,
    });
    // Solo la posición propia: un punto
    q<HTMLButtonElement>(el, '[aria-label="Centrar el mapa en el envío"]').click();
    // Con el envío asignado el conductor va hacia el origen; el marcador se desliza
    const marcos: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => marcos.push(cb));
    f.componentRef.setInput('seguimiento', { ...seguimiento(4.34), estado: 'Asignado' });
    await f.whenStable();
    f.componentRef.setInput('seguimiento', { ...seguimiento(4.36), estado: 'Asignado' });
    await f.whenStable();
    // Un cuadro a mitad de camino pide el siguiente; uno al final termina
    // (Leaflet también pide cuadros: se ejecutan los que haya en cada ronda)
    for (const t of [100, 10_000]) marcos.splice(0).forEach((cb) => cb(performance.now() + t));
    f.componentRef.setInput('seguimiento', { ...seguimiento(4.37), estado: 'Asignado' });
    await f.whenStable();
    vi.unstubAllGlobals();
    q<HTMLButtonElement>(el, '[aria-label="Centrar el mapa en el envío"]').click();
    await vi.waitFor(() => expect(el.textContent).toContain('6.1 km por línea recta'));
    // Paradas, vista alta y un conductor lejos (el mapa lo sigue)
    f.componentRef.setInput('alto', 'alto');
    f.componentRef.setInput('paradas', [{ lat: 4.35, lon: -74.37 }]);
    f.componentRef.setInput('posicionPropia', { lat: 5.5, lon: -73 });
    await f.whenStable();
    expect(el.querySelector('[title="Parada 1"]')).toBeTruthy();
    expect(el.querySelector(String.raw`.h-\[52vh\]`)).toBeTruthy();
    // Sin posición ni envío: sin conductor y nada que centrar
    f.componentRef.setInput('posicionPropia', null);
    f.componentRef.setInput('paradas', []);
    f.componentRef.setInput('seguimiento', null);
    await f.whenStable();
    expect(el.querySelector('[title="Conductor"]')).toBeNull();
    q<HTMLButtonElement>(el, '[aria-label="Centrar el mapa en el envío"]').click();
    f.destroy();
  });

  it('una ruta vieja que llega tarde no reemplaza la nueva', async () => {
    const geo = new FakeGeo();
    const pendientes: ((r: RutaMapa) => void)[] = [];
    geo.ruta.mockImplementation(() => new Promise<RutaMapa>((ok) => pendientes.push(ok)));
    TestBed.configureTestingModule({ providers: [{ provide: GeoPort, useValue: geo }] });
    const f = TestBed.createComponent(MapaEnvioComponent);
    f.componentRef.setInput('seguimiento', seguimiento(4.34));
    await f.whenStable();
    f.componentRef.setInput('paradas', [{ lat: 4.35, lon: -74.37 }]);
    await f.whenStable();
    expect(pendientes).toHaveLength(2);
    pendientes[0]({ km: 99, minutos: 1, puntos: [], exacta: true });
    pendientes[1]({ km: 7, minutos: 1, puntos: [], exacta: true });
    const el = f.nativeElement as HTMLElement;
    await vi.waitFor(() => expect(el.textContent).toContain('7 km por carretera'));
    expect(el.textContent).not.toContain('99 km');
    f.destroy();
  });

  it('utilidades: clave de ruta, interpolación y descripción accesible', () => {
    const a = { lat: 4, lon: -74 };
    const b = { lat: 5, lon: -73 };
    expect(claveRuta([a, b])).toBe('4.00000,-74.00000;5.00000,-73.00000');
    expect(interpolar(a, b, 0.5)).toEqual({ lat: 4.5, lon: -73.5 });
    expect(interpolar(a, b, 2)).toEqual(b);
    expect(interpolar(a, b, -1)).toEqual(a);
    expect(describirMapa(null, null)).toBe('Mapa del envío');
    expect(describirMapa(seguimiento(4.34), null)).toContain('de Casco Urbano a Silvania');
  });
});
