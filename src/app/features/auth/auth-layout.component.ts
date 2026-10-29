import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IlustracionHeroComponent } from '../../shared/ilustraciones/hero.component';
import { IconoComponent } from '../../shared/ui/icono.component';
import { LogoComponent } from '../../shared/ui/logo.component';

/** Marco de login y registro: panel de marca con la ilustración (en escritorio) y el formulario. */
@Component({
  selector: 'ti-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IlustracionHeroComponent, IconoComponent, LogoComponent],
  template: `
    <div class="grid min-h-dvh lg:grid-cols-[1fr_minmax(28rem,36rem)]">
      <aside
        class="relative hidden overflow-hidden bg-marca p-12 text-white lg:flex lg:flex-col lg:justify-between"
      >
        <div
          class="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:24px_24px]"
        ></div>
        <a routerLink="/" class="relative z-10 w-fit" aria-label="Ir al inicio de TrackIt Express"
          ><ti-logo [claro]="true"
        /></a>
        <div class="relative z-10 max-w-lg animate-[var(--animate-aparecer)]">
          <p class="text-4xl leading-tight font-extrabold" style="font-stretch: 112%">
            De la vereda al casco urbano, con un PIN que solo tú conoces.
          </p>
          <p class="mt-4 text-white/85">
            Cotiza, pide y sigue tus envíos en Fusagasugá, Silvania, Pasca y sus veredas.
          </p>
          <div class="mt-10 overflow-hidden rounded-[2rem] shadow-2xl ring-4 ring-white/15">
            <ti-ilustracion-hero />
          </div>
        </div>
        <ul class="relative z-10 flex gap-6 text-sm font-semibold text-white/85">
          <li class="flex items-center gap-2">
            <ti-icono nombre="shield-check" class="size-4" /> Conductores verificados
          </li>
          <li class="flex items-center gap-2">
            <ti-icono nombre="radar" class="size-4" /> Seguimiento en vivo
          </li>
        </ul>
      </aside>
      <main id="contenido" class="flex flex-col bg-papel px-4 py-8 sm:px-10">
        <div class="flex items-center justify-between">
          <a routerLink="/" class="lg:hidden" aria-label="Ir al inicio de TrackIt Express"
            ><ti-logo
          /></a>
          <a routerLink="/" class="btn-texto ml-auto text-sm"
            ><ti-icono nombre="arrow-left" class="size-4" /> Volver al inicio</a
          >
        </div>
        <div class="mx-auto my-auto w-full max-w-md animate-[var(--animate-aparecer)] py-8">
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
