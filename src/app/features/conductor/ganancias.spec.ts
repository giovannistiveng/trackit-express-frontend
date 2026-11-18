import { CONDUCTOR, buildEnvio } from '../../../testing/fixtures';
import { botonPorTexto, q, rechaza } from '../../../testing/fakes';
import { montar } from '../../../testing/pantallas';
import { ApiError } from '../../core/http/api-error';
import { DriverStatsPort } from '../../core/ports';
import { ResumenConductor } from '../../core/domain';
import { GananciasPage } from './ganancias.page';

function puerto() {
  return {
    resumen: vi.fn(async (): Promise<ResumenConductor> => ({
      completados: 4,
      ingresosTotal: 126400,
      ingresosMes: 63200,
      calificacionPromedio: 4.5,
      totalCalificaciones: 2,
      servicioActivo: 7,
    })),
    historial: vi.fn(async () => [
      buildEnvio({
        id: 3,
        estado: 'Entregado',
        gananciaConductor: 31600,
        calificacion: 4,
        comentario: 'Muy puntual',
      }),
      buildEnvio({ id: 2, estado: 'Cancelado' }),
    ]),
  };
}

describe('GananciasPage', () => {
  it('muestra el resumen, el servicio activo y el historial con calificación', async () => {
    const p = puerto();
    const { el, estable } = await montar(GananciasPage, {
      usuario: CONDUCTOR,
      providers: [{ provide: DriverStatsPort, useValue: p }],
    });
    await estable();
    const texto = el.textContent?.replaceAll(/\s+/g, ' ') ?? '';
    expect(texto).toContain('63.200');
    expect(texto).toContain('$ 126.400');
    expect(texto).toContain('$ 31.600'); // promedio por entrega
    expect(texto).toContain('2 opiniones');
    expect(texto).toContain('Tienes el servicio #7 en curso');
    expect(texto).toContain('+ $ 31.600');
    expect(texto).toContain('“Muy puntual”');
    expect(q(el, '[aria-label="4 de 5 estrellas"]').textContent).toContain('★★★★☆');
    expect(el.querySelectorAll('ul > li')).toHaveLength(2);
  });

  it('sin servicios invita a buscar y muestra errores con Reintentar', async () => {
    const p = puerto();
    p.resumen.mockImplementationOnce(rechaza(new ApiError(500, 'x')));
    p.historial.mockImplementation(async () => []);
    const { el, estable } = await montar(GananciasPage, {
      usuario: CONDUCTOR,
      providers: [{ provide: DriverStatsPort, useValue: p }],
    });
    await estable();
    expect(q(el, '[role="alert"]')).toBeTruthy();
    p.resumen.mockImplementation(async () => ({
      completados: 0,
      ingresosTotal: 0,
      ingresosMes: 0,
      calificacionPromedio: null,
      totalCalificaciones: 1,
      servicioActivo: null,
    }));
    botonPorTexto(el, /Reintentar/).click();
    await estable();
    expect(el.textContent).toContain('Aún no has terminado servicios.');
    expect(el.textContent).toContain('1 opinión');
  });
});

describe('GananciasPage: casos de borde', () => {
  it('saldo en contra, sin semanas anteriores, entrega sin ganancia registrada y calificación sin comentario', async () => {
    const p = {
      ...puerto(),
      historial: vi.fn(async () => [
        buildEnvio({
          id: 5,
          estado: 'Entregado',
          tarifa: 20000,
          gananciaConductor: undefined,
          calificacion: 5,
          comentario: null,
        }),
      ]),
      billetera: vi.fn(async () => ({
        pendiente: {
          servicios: 1,
          gananciaNequi: 0,
          cobradoEfectivo: 30000,
          comisionEfectivo: 6000,
          saldo: -6000,
        },
        movimientos: [],
        liquidaciones: [],
      })),
    };
    const { el, estable } = await montar(GananciasPage, {
      usuario: CONDUCTOR,
      providers: [{ provide: DriverStatsPort, useValue: p }],
    });
    await estable();
    const texto = el.textContent?.replaceAll(/\s+/g, ' ') ?? '';
    expect(texto).toContain('Debes a la plataforma');
    expect(texto).not.toContain('Semanas anteriores');
    expect(texto).toContain('+ $ 20.000');
    expect(texto).not.toContain('“');
  });
});
