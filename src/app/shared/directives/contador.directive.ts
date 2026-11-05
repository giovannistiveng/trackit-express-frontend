import { Directive, ElementRef, OnDestroy, effect, inject, input } from '@angular/core';

const formato = new Intl.NumberFormat('es-CO');

/**
 * Cuenta desde 0 hasta el valor cuando el número entra en pantalla (1,2 s, con desaceleración).
 * Uso: <span [tiContador]="1240" decimales="1" sufijo="+"></span>
 */
@Directive({ selector: '[tiContador]' })
export class ContadorDirective implements OnDestroy {
  readonly tiContador = input.required<number>();
  readonly decimales = input(0);
  readonly sufijo = input('');
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private observador: IntersectionObserver | null = null;
  private cuadro = 0;

  constructor() {
    effect(() => this.preparar(this.tiContador()));
  }

  ngOnDestroy(): void {
    this.observador?.disconnect();
    cancelAnimationFrame(this.cuadro);
  }

  private texto(n: number): string {
    const d = this.decimales();
    const valor = d > 0 ? n.toFixed(d).replace('.', ',') : formato.format(Math.round(n));
    return `${valor}${this.sufijo()}`;
  }

  private preparar(meta: number): void {
    const nodo = this.el.nativeElement;
    const sinMovimiento =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (
      sinMovimiento ||
      typeof IntersectionObserver === 'undefined' ||
      typeof requestAnimationFrame === 'undefined'
    ) {
      nodo.textContent = this.texto(meta);
      return;
    }
    nodo.textContent = this.texto(0);
    this.observador?.disconnect();
    this.observador = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) {
        this.observador?.disconnect();
        this.animar(meta);
      }
    });
    this.observador.observe(nodo);
  }

  private animar(meta: number): void {
    const inicio = performance.now();
    const duracion = 1200;
    const paso = (t: number) => {
      const p = Math.min(1, (t - inicio) / duracion);
      const suave = 1 - Math.pow(1 - p, 3);
      this.el.nativeElement.textContent = this.texto(meta * suave);
      if (p < 1) this.cuadro = requestAnimationFrame(paso);
    };
    this.cuadro = requestAnimationFrame(paso);
  }
}
