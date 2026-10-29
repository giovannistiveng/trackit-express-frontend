import { TestBed } from '@angular/core/testing';
import { buildEnvio } from '../../../../testing/fixtures';
import { LineaTiempoComponent } from './linea-tiempo.component';
import { MapaEnvioComponent } from './mapa-envio.component';

describe('LineaTiempoComponent', () => {
  async function montar(estado: 'Pendiente' | 'En Ruta' | 'Entregado', conEnRuta: boolean) {
    const e = buildEnvio({ estado });
    const f = TestBed.createComponent(LineaTiempoComponent);
    f.componentRef.setInput('historial', e.historial);
    f.componentRef.setInput('estadoActual', estado);
    f.componentRef.setInput('conEnRuta', conEnRuta);
    await f.whenStable();
    return f.nativeElement as HTMLElement;
  }

  it('debería mostrar las paradas cumplidas con fecha y las pendientes sin fecha', async () => {
    const el = await montar('Pendiente', true);
    expect(el.querySelectorAll('li')).toHaveLength(4);
    expect(el.querySelectorAll('time')).toHaveLength(1);
  });

  it('debería incluir En Ruta si el historial la tiene aunque el flag esté apagado', async () => {
    const el = await montar('En Ruta', false);
    expect(el.textContent).toContain('El conductor va en camino');
    expect(el.querySelectorAll('li')).toHaveLength(4);
    const el2 = await montar('Entregado', true);
    expect(el2.querySelectorAll('time')).toHaveLength(4);
  });
});

describe('MapaEnvioComponent', () => {
  it('debería crear el mapa con teselas de OpenStreetMap y mover el marcador', async () => {
    const f = TestBed.createComponent(MapaEnvioComponent);
    f.componentRef.setInput('ubicacion', { lat: 4.33, lon: -74.36, capturadoEn: 'x' });
    await f.whenStable();
    await new Promise((r) => setTimeout(r, 50));
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.leaflet-container')).toBeTruthy();
    expect(el.textContent).toContain('OpenStreetMap');
    f.componentRef.setInput('ubicacion', { lat: 4.34, lon: -74.35, capturadoEn: 'y' });
    await f.whenStable();
    expect(el.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1);
    f.destroy();
  });
});
