import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { IconoComponent } from '../../shared/ui/icono.component';
import { LogoComponent } from '../../shared/ui/logo.component';

export const SECCIONES_SITIO = [
  { ancla: 'como-funciona', texto: 'Cómo funciona' },
  { ancla: 'servicios', texto: 'Servicios' },
  { ancla: 'tarifas', texto: 'Tarifas' },
  { ancla: 'conductores', texto: 'Conductores' },
  { ancla: 'contacto', texto: 'Contacto' },
];

/** Cabecera del sitio público: fija, se vuelve sólida al bajar y tiene menú móvil. */
@Component({
  selector: 'ti-sitio-cabecera',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconoComponent, LogoComponent],
  host: { '(window:scroll)': 'alDesplazar()' },
  template: `
    <header
      class="fixed inset-x-0 top-0 z-30 transition-all duration-300"
      [class]="
        solida() || menuAbierto() ? 'bg-papel/90 shadow-[var(--shadow-suave)] backdrop-blur-md' : ''
      "
    >
      <div class="contenedor-ancho flex h-18 items-center gap-6">
        <a routerLink="/" fragment="inicio" aria-label="TrackIt Express, inicio"><ti-logo /></a>
        <nav class="ml-4 hidden items-center gap-1 lg:flex" aria-label="Secciones">
          @for (s of secciones; track s.ancla) {
            <a
              routerLink="/"
              [fragment]="s.ancla"
              class="rounded-lg px-3 py-2 text-sm font-semibold text-piedra transition-colors hover:bg-marca-suave hover:text-marca"
              >{{ s.texto }}</a
            >
          }
        </nav>
        <div class="ml-auto hidden items-center gap-2 sm:flex">
          @if (session.estaAutenticado()) {
            <a [routerLink]="session.inicioDelRol()" class="btn-primario">
              Ir a mi panel <ti-icono nombre="arrow-right" class="size-4" />
            </a>
          } @else {
            <a
              routerLink="/login"
              class="btn rounded-lg font-semibold text-tinta hover:bg-marca-suave"
              >Ingresar</a
            >
            <a routerLink="/registro" class="btn-primario">Crear cuenta</a>
          }
        </div>
        <button
          type="button"
          class="ml-auto grid size-11 place-items-center rounded-lg hover:bg-marca-suave sm:ml-2 lg:hidden"
          [attr.aria-expanded]="menuAbierto()"
          aria-controls="menu-sitio"
          (click)="menuAbierto.set(!menuAbierto())"
        >
          <ti-icono [nombre]="menuAbierto() ? 'x' : 'menu'" class="size-6" />
          <span class="sr-only">{{ menuAbierto() ? 'Cerrar menú' : 'Abrir menú' }}</span>
        </button>
      </div>
      @if (menuAbierto()) {
        <nav
          id="menu-sitio"
          class="border-t border-linea bg-papel px-4 pb-6 pt-2 lg:hidden"
          aria-label="Secciones"
        >
          <ul>
            @for (s of secciones; track s.ancla) {
              <li>
                <a
                  routerLink="/"
                  [fragment]="s.ancla"
                  class="flex min-h-12 items-center justify-between border-b border-linea/60 font-semibold"
                  (click)="menuAbierto.set(false)"
                  >{{ s.texto }} <ti-icono nombre="chevron-right" class="size-4 text-piedra"
                /></a>
              </li>
            }
          </ul>
          <div class="mt-5 grid gap-2">
            @if (session.estaAutenticado()) {
              <a [routerLink]="session.inicioDelRol()" class="btn-primario">Ir a mi panel</a>
            } @else {
              <a routerLink="/registro" class="btn-primario">Crear cuenta</a>
              <a routerLink="/login" class="btn-secundario">Ingresar</a>
            }
          </div>
        </nav>
      }
    </header>
  `,
})
export class SitioCabeceraComponent {
  protected readonly session = inject(SessionService);
  protected readonly secciones = SECCIONES_SITIO;
  protected readonly solida = signal(false);
  protected readonly menuAbierto = signal(false);

  protected alDesplazar(): void {
    this.solida.set(window.scrollY > 12);
  }
}
