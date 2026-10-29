import { TestBed } from '@angular/core/testing';
import { buildEnvio } from '../../../../testing/fixtures';
import { Seguimiento } from '../../../core/domain';
import { LineaTiempoComponent } from './linea-tiempo.component';
import { MapaEnvioComponent } from '../../../shared/ui/mapa-envio.component';

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
    f.destroy();
  });
});
