import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CLIENTE, CONDUCTOR, buildEnvio } from '../../testing/fixtures';
import { configurar, montar } from '../../testing/pantallas';
import { q } from '../../testing/fakes';
import { routes } from '../app.routes';
import { DesgloseTarifa } from '../core/domain';
import { ClientShipmentsPort, DriverProfilePort } from '../core/ports';
import { ordenarRecientes } from '../core/domain/envio.rules';
import { esDeExtension } from '../core/logging/global-error-handler';
import { DriverProfileStore } from '../features/conductor/state/driver-profile.store';
import { DesgloseTarifaComponent } from '../features/cliente/components/desglose-tarifa.component';
import { InicioClientePage } from '../features/cliente/inicio-cliente.page';
import { SitioCabeceraComponent } from '../features/publico/sitio-cabecera.component';
import { ContadorDirective } from './directives/contador.directive';
import { RevelarDirective } from './directives/revelar.directive';
import { FechaLocalPipe } from './pipes/fecha-local.pipe';
import { LogoComponent } from './ui/logo.component';
import { ModalComponent } from './ui/modal.component';
import { TecladoPinComponent } from './ui/teclado-pin.component';
import { Sondeo } from './util/sondeo';

const observadores: ObservadorFalso[] = [];
class ObservadorFalso {
  static get ultimo(): ObservadorFalso | undefined {
    return observadores.at(-1);
  }
  constructor(readonly avisar: (e: { isIntersecting: boolean }[]) => void) {
    observadores.push(this);
  }
  observe = vi.fn();
  disconnect = vi.fn();
}

describe('piezas compartidas: casos de borde', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('contador: sin movimiento muestra el valor final; con animación espera a verse y anima', async () => {
    @Component({
      changeDetection: ChangeDetectionStrategy.OnPush,
      imports: [ContadorDirective],
      template: `<span [tiContador]="valor()"></span>`,
    })
    class Anfitrion {
      readonly valor = signal(1240);
    }
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const r = await montar(Anfitrion);
    expect(r.el.textContent).toContain('1.240');
    r.fixture.destroy();
    TestBed.resetTestingModule();

    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('IntersectionObserver', ObservadorFalso);
    const cuadros: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => cuadros.push(cb));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const r2 = await montar(Anfitrion);
    expect(r2.el.textContent).toBe('0');
    cuadros.length = 0;
    ObservadorFalso.ultimo?.avisar([{ isIntersecting: false }]);
    expect(cuadros).toHaveLength(0);
    ObservadorFalso.ultimo?.avisar([{ isIntersecting: true }]);
    for (const t of [100, 5000]) cuadros.splice(0).forEach((cb) => cb(performance.now() + t));
    expect(r2.el.textContent).toBe('1.240');
    r2.fixture.destroy();
  });

  it('revelar: una entrada que aún no se ve no lo muestra', async () => {
    @Component({
      changeDetection: ChangeDetectionStrategy.OnPush,
      imports: [RevelarDirective],
      template: `<p tiRevelar>hola</p>`,
    })
    class Anfitrion {}
    vi.stubGlobal('IntersectionObserver', ObservadorFalso);
    const r = await montar(Anfitrion);
    ObservadorFalso.ultimo?.avisar([{ isIntersecting: false }]);
    expect(q(r.el, 'p').classList).not.toContain('visible');
    ObservadorFalso.ultimo?.avisar([{ isIntersecting: true }]);
    expect(q(r.el, 'p').classList).toContain('visible');
  });

  it('modal sin elementos enfocables y Tab en medio de la lista', async () => {
    @Component({
      changeDetection: ChangeDetectionStrategy.OnPush,
      imports: [ModalComponent],
      template: `<ti-modal titulo="Sin botones" [cerrable]="false" />
        <ti-modal titulo="Con botones"
          ><button id="a">A</button><button id="b">B</button></ti-modal
        >`,
    })
    class Anfitrion {}
    const r = await montar(Anfitrion);
    const [vacio, lleno] = Array.from(r.el.querySelectorAll<HTMLElement>('[role="dialog"]'));
    vacio.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    q<HTMLButtonElement>(r.el, '#a').focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    lleno.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
  });

  it('teclado del PIN: el botón borrar y otras teclas se ignoran', async () => {
    const r = await montar(TecladoPinComponent);
    r.c.agregar('1');
    r.c.agregar('2');
    await r.estable();
    q<HTMLButtonElement>(r.el, '[aria-label="Borrar último dígito"]').click();
    expect(r.c.valor()).toBe('1');
    q(r.el, '[role="group"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    expect(r.c.valor()).toBe('1');
  });

  it('fecha con hora, logo sin nombre, desglose sin zona y orden con la misma fecha', async () => {
    expect(new FechaLocalPipe().transform(new Date('2026-11-18T15:30:00'), 'hora')).toMatch(/3:30/);
    const logo = await montar(LogoComponent, { inputs: { conNombre: false } });
    expect(logo.el.textContent?.trim()).toBe('');
    TestBed.resetTestingModule();
    const desglose: DesgloseTarifa = {
      categoria: 'Moto Express',
      banderazo: 2000,
      distancia: 1000,
      tiempo: 500,
      recargoZona: 1500,
      paradas: 0,
      recargoParadas: 0,
      idaYVuelta: false,
      recargoNocturno: 0,
      extras: [],
      recargoAcceso: 0,
      minimoAplicado: false,
      total: 5000,
    };
    const d = await montar(DesgloseTarifaComponent, { inputs: { desglose, abierto: true } });
    expect(d.el.textContent).toContain('Recargo de zona');
    expect(d.el.textContent).not.toContain('Recargo de zona (');
    const fecha = new Date('2026-11-01T10:00:00Z');
    const lista = ordenarRecientes([
      buildEnvio({ id: 1, fechaUltimoCambio: fecha }),
      buildEnvio({ id: 2, fechaUltimoCambio: fecha }),
    ]);
    expect(lista.map((e) => e.id)).toEqual([2, 1]);
    expect(esDeExtension(Object.assign(new Error('x'), { stack: undefined }))).toBe(false);
  });

  it('sondeo: un cambio de visibilidad estando detenido no hace nada; usa el document por defecto', () => {
    const consulta = vi.fn(async () => 1);
    const s = new Sondeo(consulta, { intervaloMs: 1000 });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(consulta).not.toHaveBeenCalled();
    expect(s.estaActivo).toBe(false);
  });

  it('perfil de conductor sin sesión y vehículo sin perfil cargado', async () => {
    configurar({ providers: [{ provide: DriverProfilePort, useValue: { obtener: vi.fn() } }] });
    const store = TestBed.inject(DriverProfileStore);
    expect(await store.cargar()).toBeNull();
    store.registrarVehiculo({ id: 1, placa: 'ABC12D', categoria: 'Moto Express' });
    expect(store.perfil()).toBeNull();
  });

  it('inicio del cliente sin sesión saluda sin nombre; la cabecera pública con sesión ofrece el panel', async () => {
    const r = await montar(InicioClientePage, {
      providers: [{ provide: ClientShipmentsPort, useValue: { listar: vi.fn(async () => []) } }],
    });
    expect(q(r.el, 'p').textContent).not.toContain(',');
    TestBed.resetTestingModule();
    const c = await montar(SitioCabeceraComponent, { usuario: CLIENTE });
    expect(c.el.textContent).toContain('Ir a mi panel');
  });

  it('la ruta de Mi cuenta carga su página', async () => {
    const cuenta = routes.find((r) => r.path === 'cuenta');
    const componente = await (cuenta?.children?.[0].loadComponent as () => Promise<unknown>)();
    expect(componente).toBeTruthy();
    expect(CONDUCTOR).toBeTruthy();
  });
});
