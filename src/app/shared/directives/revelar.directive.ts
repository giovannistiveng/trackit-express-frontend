import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';

/**
 * Hace aparecer el elemento (sube y se aclara) cuando entra en pantalla.
 * Uso: <section tiRevelar [retraso]="120">. Respeta prefers-reduced-motion (lo resuelve el CSS).
 */
@Directive({ selector: '[tiRevelar]', host: { class: 'revelar' } })
export class RevelarDirective implements OnInit, OnDestroy {
  readonly retraso = input(0);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private observador: IntersectionObserver | null = null;

  ngOnInit(): void {
    const nodo = this.el.nativeElement;
    nodo.style.setProperty('--retraso', `${this.retraso()}ms`);
    if (typeof IntersectionObserver === 'undefined') {
      nodo.classList.add('visible');
      return;
    }
    this.observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) {
            nodo.classList.add('visible');
            this.observador?.disconnect();
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    this.observador.observe(nodo);
  }

  ngOnDestroy(): void {
    this.observador?.disconnect();
  }
}
