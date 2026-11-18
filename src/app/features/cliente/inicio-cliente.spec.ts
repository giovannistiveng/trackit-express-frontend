import { Subject } from 'rxjs';
import { CLIENTE, buildEnvio } from '../../../testing/fixtures';
import { q, rechaza } from '../../../testing/fakes';
import { montar } from '../../../testing/pantallas';
import { ApiError } from '../../core/http/api-error';
import { ClientShipmentsPort, EventosPort } from '../../core/ports';
import { InicioClientePage, saludo } from './inicio-cliente.page';

describe('InicioClientePage', () => {
  function puertos(
    envios = [
      buildEnvio({ id: 3, estado: 'En Ruta', tipoServicio: 'trasteo', destino: 'Silvania' }),
      buildEnvio({ id: 2, estado: 'Entregado', tipoServicio: 'mercado', tarifa: 9000 }),
      buildEnvio({ id: 1, estado: 'Cancelado' }),
    ],
  ) {
    const cambios = new Subject<number>();
    return {
      envios: { listar: vi.fn(async () => envios) },
      eventos: { cambiosEnvio: () => cambios.asObservable(), notificaciones: () => new Subject() },
      cambios,
    };
  }

  async function montarInicio(p = puertos()) {
    const r = await montar(InicioClientePage, {
      usuario: CLIENTE,
      providers: [
        { provide: ClientShipmentsPort, useValue: p.envios },
        { provide: EventosPort, useValue: p.eventos },
      ],
    });
    await r.estable();
    return { ...r, p };
  }

  it('saluda, ofrece los cinco servicios y muestra lo que va en curso y lo que puede repetir', async () => {
    const { el } = await montarInicio();
    const texto = el.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(texto).toContain(CLIENTE.nombre.split(' ')[0]);
    expect(el.querySelectorAll('ul[aria-label="Servicios"] a')).toHaveLength(5);
    expect(q<HTMLAnchorElement>(el, '#servicio-insumos').href).toContain('servicio=insumos');
    expect(q(el, '[aria-labelledby="titulo-curso"]').textContent).toContain('En camino');
    expect(q(el, '[aria-labelledby="titulo-curso"]').textContent).toContain(
      'Trasteo #3 hacia Silvania',
    );
    expect(q<HTMLAnchorElement>(el, '[aria-label="Repetir el pedido 2"]').href).toContain(
      'repetir=2',
    );
    expect(texto).not.toContain('Repetir el pedido 1');
  });

  it('recarga al cambiar un pedido y sigue funcionando si el historial falla', async () => {
    const p = puertos([]);
    const { el, estable } = await montarInicio(p);
    expect(el.querySelector('[aria-labelledby="titulo-curso"]')).toBeNull();
    expect(el.querySelector('[aria-labelledby="titulo-recientes"]')).toBeNull();
    p.envios.listar.mockImplementation(rechaza(new ApiError(0, 'x')));
    p.cambios.next(9);
    await estable();
    expect(p.envios.listar).toHaveBeenCalledTimes(2);
    expect(el.querySelectorAll('ul[aria-label="Servicios"] a')).toHaveLength(5);
  });

  it('el saludo depende de la hora de Colombia', () => {
    expect(saludo(new Date('2026-11-17T13:00:00Z'))).toBe('Buenos días');
    expect(saludo(new Date('2026-11-17T20:00:00Z'))).toBe('Buenas tardes');
    expect(saludo(new Date('2026-11-18T02:00:00Z'))).toBe('Buenas noches');
  });
});
