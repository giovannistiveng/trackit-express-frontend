import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../../shared/ui/logo.component';
import { SECCIONES_SITIO } from './sitio-cabecera.component';

@Component({
  selector: 'ti-sitio-pie',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LogoComponent],
  template: `
    <footer class="bg-noche text-white/75">
      <div class="contenedor-ancho grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <ti-logo [claro]="true" />
          <p class="mt-4 max-w-sm text-sm leading-relaxed">
            Envíos y mandados en Fusagasugá, sus veredas y los municipios vecinos, con PIN de
            entrega y seguimiento en el mapa.
          </p>
        </div>
        <nav aria-label="Secciones del sitio">
          <p class="mb-3 text-sm font-bold text-white">El servicio</p>
          <ul class="space-y-2 text-sm">
            @for (s of secciones; track s.ancla) {
              <li>
                <a routerLink="/" [fragment]="s.ancla" class="hover:text-white">{{ s.texto }}</a>
              </li>
            }
          </ul>
        </nav>
        <nav aria-label="Cuenta">
          <p class="mb-3 text-sm font-bold text-white">Tu cuenta</p>
          <ul class="space-y-2 text-sm">
            <li><a routerLink="/registro" class="hover:text-white">Crear cuenta</a></li>
            <li><a routerLink="/login" class="hover:text-white">Ingresar</a></li>
            <li>
              <a
                routerLink="/registro"
                [queryParams]="{ rol: 'conductor' }"
                class="hover:text-white"
                >Trabaja como conductor</a
              >
            </li>
          </ul>
        </nav>
      </div>
      <div class="border-t border-white/10">
        <div
          class="contenedor-ancho flex flex-col gap-2 py-5 text-xs sm:flex-row sm:justify-between"
        >
          <p>© {{ anio }} TrackIt Express · Fusagasugá, Cundinamarca</p>
          <p>
            Mapas ©
            <a
              href="https://www.openstreetmap.org/copyright"
              class="underline hover:text-white"
              target="_blank"
              rel="noopener"
              >colaboradores de OpenStreetMap</a
            >
          </p>
        </div>
      </div>
    </footer>
  `,
})
export class SitioPieComponent {
  protected readonly secciones = SECCIONES_SITIO;
  protected readonly anio = new Date().getFullYear();
}
