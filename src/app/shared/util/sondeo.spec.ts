import { Sondeo } from './sondeo';

function documentoFalso() {
  let oyente: (() => void) | null = null;
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (_: string, fn: () => void) => (oyente = fn),
    removeEventListener: () => (oyente = null),
  };
  return { doc, cambiar: (v: DocumentVisibilityState) => ((doc.visibilityState = v), oyente?.()) };
}

describe('Sondeo', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debería consultar de inmediato y luego cada intervalo', async () => {
    const consulta = vi.fn().mockResolvedValue('Pendiente');
    const { doc } = documentoFalso();
    const s = new Sondeo(consulta, { intervaloMs: 10_000, documento: doc as never });
    s.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(consulta).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(consulta).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(consulta).toHaveBeenCalledTimes(3);
    s.detener();
  });

  it('debería pausarse con la pestaña oculta y reanudar al volver', async () => {
    const consulta = vi.fn().mockResolvedValue('x');
    const { doc, cambiar } = documentoFalso();
    const s = new Sondeo(consulta, { intervaloMs: 10_000, documento: doc as never });
    s.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    cambiar('hidden');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(consulta).toHaveBeenCalledTimes(1);
    cambiar('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(consulta).toHaveBeenCalledTimes(2);
    s.detener();
  });

  it('debería detenerse cuando se cumple la condición (Entregado)', async () => {
    const consulta = vi.fn().mockResolvedValueOnce('En Ruta').mockResolvedValue('Entregado');
    const s = new Sondeo(consulta, {
      intervaloMs: 10_000,
      detenerSi: (r) => r === 'Entregado',
      documento: documentoFalso().doc as never,
    });
    s.iniciar();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(s.estaActivo).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(consulta).toHaveBeenCalledTimes(2);
  });

  it('debería aplicar retroceso exponencial ante errores y reiniciarlo al recuperarse', async () => {
    const errores: number[] = [];
    const consulta = vi
      .fn()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValue('ok');
    const s = new Sondeo(consulta, {
      intervaloMs: 1000,
      alError: (_e, n) => errores.push(n),
      documento: documentoFalso().doc as never,
    });
    s.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.fallosSeguidos).toBe(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(consulta).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(consulta).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(consulta).toHaveBeenCalledTimes(3);
    expect(s.fallosSeguidos).toBe(0);
    expect(errores).toEqual([1, 2]);
    s.detener();
  });

  it('refrescar consulta ya y no duplica si ya está activo', async () => {
    const consulta = vi.fn().mockResolvedValue('x');
    const s = new Sondeo(consulta, {
      intervaloMs: 15_000,
      documento: documentoFalso().doc as never,
    });
    s.iniciar();
    s.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    await s.refrescar();
    expect(consulta).toHaveBeenCalledTimes(2);
    s.detener();
    await s.refrescar();
    expect(consulta).toHaveBeenCalledTimes(2);
  });
});
