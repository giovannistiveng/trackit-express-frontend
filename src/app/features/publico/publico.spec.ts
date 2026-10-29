import { CLIENTE } from '../../../testing/fixtures';
import { botonPorTexto, escribir, q, rechaza } from '../../../testing/fakes';
import { montar } from '../../../testing/pantallas';
import { ApiError } from '../../core/http/api-error';
import { EstadisticasPublicas } from '../../core/domain';
import { PublicSitePort } from '../../core/ports';
import { InicioPage } from './inicio.page';
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

  it('la calculadora suma la tarifa base de la zona y $1.000 por km', async () => {
    const { el, estable } = await montarInicio();
    const texto = () => q(el, '#tarifas').textContent?.replace(/\s+/g, ' ') ?? '';
    expect(texto()).toContain('$ 13.000'); // 5.000 + 8 km
    const select = q<HTMLSelectElement>(el, '#calc-zona');
    select.value = select.options[1].value;
    select.dispatchEvent(new Event('change'));
    const km = q<HTMLInputElement>(el, '#calc-km');
    km.value = '20';
    km.dispatchEvent(new Event('input'));
    await estable();
    expect(texto()).toContain('$ 32.000'); // 12.000 + 20 km
    expect(texto()).toContain('Silvania');
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
