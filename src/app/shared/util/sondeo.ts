export interface OpcionesSondeo<T> {
  intervaloMs: number;
  /** Si devuelve true tras un resultado, el sondeo se detiene. */
  detenerSi?: (resultado: T) => boolean;
  /** Tope del retroceso exponencial ante errores. */
  maxEsperaMs?: number;
  alResultado?: (resultado: T) => void;
  alError?: (error: unknown, fallosSeguidos: number) => void;
  documento?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
}

/**
 * Ejecuta una consulta periódica: se pausa con la pestaña oculta, aplica retroceso
 * exponencial ante errores (intervalo × 2^fallos, con tope) y se detiene por condición.
 */
export class Sondeo<T> {
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private activo = false;
  private enCurso = false;
  private fallos = 0;
  private readonly doc: OpcionesSondeo<T>['documento'];
  private readonly alCambiarVisibilidad = () => {
    if (!this.activo) return;
    if (this.doc?.visibilityState === 'hidden') this.limpiar();
    else void this.ejecutar();
  };

  constructor(
    private readonly consulta: () => Promise<T>,
    private readonly opciones: OpcionesSondeo<T>,
  ) {
    this.doc = opciones.documento ?? (typeof document !== 'undefined' ? document : undefined);
  }

  get fallosSeguidos(): number {
    return this.fallos;
  }

  get estaActivo(): boolean {
    return this.activo;
  }

  /** Inicia con una consulta inmediata. */
  iniciar(): void {
    if (this.activo) return;
    this.activo = true;
    this.doc?.addEventListener('visibilitychange', this.alCambiarVisibilidad);
    void this.ejecutar();
  }

  detener(): void {
    this.activo = false;
    this.limpiar();
    this.doc?.removeEventListener('visibilitychange', this.alCambiarVisibilidad);
  }

  /** Consulta ya (por ejemplo, botón "Refrescar") y reprograma. */
  refrescar(): Promise<void> {
    return this.ejecutar();
  }

  private async ejecutar(): Promise<void> {
    if (!this.activo || this.enCurso) return;
    this.limpiar();
    this.enCurso = true;
    try {
      const r = await this.consulta();
      this.fallos = 0;
      this.opciones.alResultado?.(r);
      if (this.opciones.detenerSi?.(r)) {
        this.detener();
        return;
      }
    } catch (e) {
      this.fallos++;
      this.opciones.alError?.(e, this.fallos);
    } finally {
      this.enCurso = false;
    }
    this.programar();
  }

  private programar(): void {
    if (!this.activo || this.doc?.visibilityState === 'hidden') return;
    const tope = this.opciones.maxEsperaMs ?? 120_000;
    const espera = Math.min(this.opciones.intervaloMs * 2 ** this.fallos, tope);
    this.temporizador = setTimeout(() => void this.ejecutar(), espera);
  }

  private limpiar(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
  }
}
