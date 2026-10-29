import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PlacaComponent } from '../../shared/ui/placa.component';

/** Marco de login y registro: panel de marca a la izquierda (en escritorio) y formulario. */
@Component({
  selector: 'ti-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlacaComponent],
  template: `
    <div class="grid min-h-dvh lg:grid-cols-[1fr_minmax(28rem,36rem)]">
      <aside
        class="relative hidden overflow-hidden bg-monte p-12 text-white lg:flex lg:flex-col lg:justify-between"
      >
        <p class="relative z-10 text-xl font-extrabold" style="font-stretch: 118%">
          TrackIt Express
        </p>
        <div class="relative z-10 mb-24 max-w-md">
          <p class="text-4xl font-extrabold leading-tight" style="font-stretch: 112%">
            De la vereda al casco urbano, con un PIN que solo tú conoces.
          </p>
          <p class="mt-4 text-white/80">
            Cotiza, pide y sigue tus envíos en Fusagasugá, Silvania, Pasca y sus veredas.
          </p>
          <div class="mt-10 flex items-end gap-4">
            <ti-placa valor="4821" etiqueta="Ejemplo de PIN" pie="PIN DE ENTREGA" tamano="grande" />
          </div>
        </div>
        <svg
          class="pointer-events-none absolute bottom-0 left-0 h-28 w-full text-monte-claro"
          viewBox="0 0 800 200"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M0 200 L0 120 L120 60 L210 110 L330 30 L450 105 L560 55 L680 120 L800 70 L800 200 Z"
          />
        </svg>
      </aside>
      <main id="contenido" class="flex flex-col justify-center bg-papel px-4 py-10 sm:px-10">
        <p class="mb-8 font-extrabold text-monte lg:hidden" style="font-stretch: 118%">
          TrackIt Express
        </p>
        <div class="mx-auto w-full max-w-md">
          <h1>{{ titulo() }}</h1>
          @if (subtitulo()) {
            <p class="mt-2 text-piedra">{{ subtitulo() }}</p>
          }
          <div class="mt-8"><ng-content /></div>
        </div>
      </main>
    </div>
  `,
})
export class AuthLayoutComponent {
  readonly titulo = input.required<string>();
  readonly subtitulo = input('');
}
