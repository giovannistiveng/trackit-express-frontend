import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../core/auth/session.service';

@Component({
  selector: 'ti-no-encontrada',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <main id="contenido" class="contenedor py-20">
      <p class="text-6xl font-extrabold text-monte" style="font-stretch: 125%">404</p>
      <h1 class="mt-2">Esta dirección no lleva a ningún lado</h1>
      <p class="mt-3 text-piedra">Revisa el enlace o vuelve al inicio.</p>
      <a class="btn-primario mt-6" [routerLink]="session.inicioDelRol()">Ir al inicio</a>
    </main>
  `,
})
export class NoEncontradaComponent {
  protected readonly session = inject(SessionService);
}
