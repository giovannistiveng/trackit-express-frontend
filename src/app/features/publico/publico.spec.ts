import { CLIENTE } from '../../../testing/fixtures';
import { botonPorTexto, escribir, q, rechaza } from '../../../testing/fakes';
import { montar } from '../../../testing/pantallas';
import { ApiError } from '../../core/http/api-error';
import { EstadisticasPublicas } from '../../core/domain';
import { PublicSitePort } from '../../core/ports';
import { InicioPage, TARIFAS_REFERENCIA } from './inicio.page';
import { SitioCabeceraComponent } from './sitio-cabecera.component';

const ZONAS = [
  { id: 1, nombre: 'Casco Urbano', tarifaBase: 5000 },
  { id: 4, nombre: 'Silvania', tarifaBase: 12000 },
];

function sitio(estadisticas: Partial<EstadisticasPublicas> = {}) {
  return {
    estadisticas: vi.fn(async () => ({
      enviosEntregados: 1240,
      conductoresActivos: 0,
      zonasCubiertas: 5,
      calificacionPromedio: 4.8,
      ...estadisticas,
    })),
    zonas: vi.fn(async () => ZONAS),
    tarifas: vi.fn(async () => ({
      tarifas: TARIFAS_REFERENCIA,
      recargoNocturno: 0.2,
      horarioNocturno: '20:00 a 5:59',
    })),
    contactar: vi.fn(async () => undefined),
  };
}

async function montarInicio(s = sitio(), usuario: typeof CLIENTE | null = null) {
  const r = await montar(InicioPage, {
    usuario,
    providers: [{ provide: PublicSitePort, useValue: s }],
  });
  await r.estable();
  return { ...r, s };
}

describe('InicioPage (sitio público)', () => {
  it('debería mostrar todas las secciones con anclas para la navegación', async () => {
    const { el } = await montarInicio();
    for (const id of [
      'inicio',
      'como-funciona',
      'servicios',
      'tarifas',
      'conductores',
      'contacto',
    ]) {
      expect(el.querySelector('#' + id)).toBeTruthy();
    }
    expect(el.querySelector('h1')?.textContent).toContain('De la vereda al casco urbano');
    expect(el.querySelectorAll('#como-funciona ol > li')).toHaveLength(4);
    expect(el.querySelectorAll('#servicios article')).toHaveLength(4);
    expect(el.querySelectorAll('details')).toHaveLength(6);
    expect(el.querySelector('ti-ilustracion-hero svg title')?.textContent).toContain('mensajero');
  });

  it('solo muestra cifras reales mayores que cero', async () => {
    const { el } = await montarInicio();
    const cifras = el.querySelector(
      'section[aria-label="TrackIt Express en cifras"]',
    ) as HTMLElement;
    const textos = cifras.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(textos).toContain('envíos entregados');
    expect(textos).toContain('1.240');
    expect(textos).toContain('4,8 ★');
    expect(textos).not.toContain('conductores verificados');
  });

  it('sin cifras ni zonas (backend caído) sigue funcionando', async () => {
    const s = sitio();
    s.estadisticas.mockImplementation(rechaza(new ApiError(0, 'x')));
    s.zonas.mockImplementation(rechaza(new ApiError(0, 'x')));
    const { el } = await montarInicio(s);
    expect(el.querySelector('section[aria-label="TrackIt Express en cifras"]')).toBeNull();
    expect(el.textContent).toContain('Las tarifas no están disponibles');
  });

  it('la calculadora usa la tarifa del vehículo, la distancia, el tiempo y el recargo de la zona', async () => {
    const { el, estable } = await montarInicio();
    const texto = () => q(el, '#tarifas').textContent?.replace(/\s+/g, ' ') ?? '';
    // Moto: 2.000 + 5 km × 700 + 10 min × 50 = 6.000 + recargo 5.000
    expect(texto()).toContain('$ 11.000');
    const zona = q<HTMLSelectElement>(el, '#calc-zona');
    zona.value = zona.options[1].value;
    zona.dispatchEvent(new Event('change'));
    const km = q<HTMLInputElement>(el, '#calc-km');
    km.value = '20';
    km.dispatchEvent(new Event('input'));
    await estable();
    // 2.000 + 14.000 + 40 min × 50 = 18.000 + recargo 12.000
    expect(texto()).toContain('$ 30.000');
    const vehiculo = q<HTMLSelectElement>(el, '#calc-vehiculo');
    vehiculo.value = 'Camioneta';
    vehiculo.dispatchEvent(new Event('change'));
    await estable();
    // 10.000 + 32.000 + 4.800 = 46.800 + 12.000
    expect(texto()).toContain('$ 58.800');
    expect(texto()).toContain('recargo $ 12.000');
  });

  it('si las tarifas no cargan usa las de referencia', async () => {
    const s = sitio();
    s.tarifas.mockImplementation(rechaza(new ApiError(0, 'x')));
    const { el } = await montarInicio(s);
    expect(q(el, '#tarifas').textContent?.replace(/\s+/g, ' ')).toContain('$ 11.000');
  });

  it('el formulario de contacto valida, envía y confirma', async () => {
    const { el, s, estable } = await montarInicio();
    botonPorTexto(el, /Enviar mensaje/).click();
    await estable();
    expect(el.textContent).toContain('Escribe tu nombre.');
    expect(s.contactar).not.toHaveBeenCalled();
    escribir(q(el, '#c-nombre'), 'Tienda La Esquina');
    escribir(q(el, '#c-correo'), 'tienda@ejemplo.co');
    q<HTMLSelectElement>(el, '#c-asunto').value = 'Empresas';
    q(el, '#c-asunto').dispatchEvent(new Event('change'));
    escribir(q(el, '#c-mensaje'), 'Queremos enviar pedidos diarios.');
    botonPorTexto(el, /Enviar mensaje/).click();
    await estable();
    expect(s.contactar).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Tienda La Esquina',
        correo: 'tienda@ejemplo.co',
        asunto: 'Empresas',
      }),
    );
    expect(q(el, '[role="status"]').textContent).toContain('¡Mensaje enviado!');
    botonPorTexto(el, 'Enviar otro mensaje').click();
    await estable();
    expect(el.querySelector('#c-nombre')).toBeTruthy();
  });

  it('muestra el error del backend al enviar el contacto', async () => {
    const s = sitio();
    s.contactar.mockImplementation(
      rechaza(new ApiError(429, 'Demasiadas peticiones, intenta más tarde')),
    );
    const { el, estable } = await montarInicio(s);
    escribir(q(el, '#c-nombre'), 'Ana Ruiz');
    escribir(q(el, '#c-correo'), 'ana@x.co');
    escribir(q(el, '#c-mensaje'), 'Necesito ayuda con un envío.');
    botonPorTexto(el, /Enviar mensaje/).click();
    await estable();
    expect(q(el, '#contacto [role="alert"]').textContent).toContain('Demasiados intentos');
  });

  it('con sesión iniciada ofrece ir al panel', async () => {
    const { el } = await montarInicio(sitio(), CLIENTE);
    expect(el.textContent).toContain('Ir a mi panel');
  });
});

describe('SitioCabeceraComponent', () => {
  it('abre y cierra el menú móvil y se vuelve sólida al bajar', async () => {
    const { el, estable } = await montar(SitioCabeceraComponent);
    const boton = q<HTMLButtonElement>(el, '[aria-controls="menu-sitio"]');
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    boton.click();
    await estable();
    expect(el.querySelectorAll('#menu-sitio li')).toHaveLength(5);
    (q(el, '#menu-sitio a') as HTMLAnchorElement).click();
    await estable();
    expect(el.querySelector('#menu-sitio')).toBeNull();
    Object.defineProperty(window, 'scrollY', { value: 200, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    await estable();
    expect(q(el, 'header').className).toContain('backdrop-blur-md');
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });
});
