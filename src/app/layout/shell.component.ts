import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from '../core/auth/session.service';
import { Rol } from '../core/domain';

interface Enlace {
  ruta: string;
  texto: string;
}

const MENU: Record<Rol, Enlace[]> = {
  '1': [
    { ruta: '/admin/conductores', texto: 'Conductores' },
    { ruta: '/admin/dashboard', texto: 'Métricas' },
    { ruta: '/admin/auditoria', texto: 'Auditoría' },
  ],
  '2': [
    { ruta: '/cliente/nuevo-envio', texto: 'Nuevo envío' },
    { ruta: '/cliente/envios', texto: 'Mis envíos' },
  ],
  '3': [
    { ruta: '/conductor/tablero', texto: 'Servicios' },
    { ruta: '/conductor/perfil', texto: 'Mi perfil' },
  ],
};

const NOMBRE_ROL: Record<Rol, string> = { '1': 'Administración', '2': 'Cliente', '3': 'Conductor' };

/** Marco de las secciones autenticadas: cabecera, navegación del rol y contenido. */
@Component({
  selector: 'ti-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="bg-marca text-white">
      <div class="contenedor-ancho flex min-h-16 items-center gap-4">
        <a
          [routerLink]="session.inicioDelRol()"
          class="flex items-center gap-2 font-extrabold"
          style="font-stretch: 118%"
        >
          <span
            class="grid size-8 place-items-center rounded-md border-2 border-tinta bg-placa text-sm text-tinta"
            aria-hidden="true"
            >TE</span
          >
          <span>TrackIt Express</span>
        </a>
        <nav class="ml-6 hidden gap-1 sm:flex" aria-label="Principal">
          @for (e of enlaces(); track e.ruta) {
            <a
              [routerLink]="e.ruta"
              routerLinkActive="bg-white/15"
              ariaCurrentWhenActive="page"
              class="flex min-h-11 items-center rounded-lg px-3 font-semibold text-white/90 hover:bg-white/10"
              >{{ e.texto }}</a
            >
          }
        </nav>
        <div class="ml-auto flex items-center gap-3 text-sm">
          <span class="hidden text-right leading-tight md:block">
            <span class="block font-semibold">{{ session.usuario()?.nombre }}</span>
            <span class="text-white/70">{{ nombreRol() }}</span>
          </span>
          <button
            type="button"
            class="min-h-11 rounded-lg px-3 font-semibold hover:bg-white/10"
            (click)="salir()"
          >
            Salir
          </button>
        </div>
      </div>
    </header>

    <main id="contenido" class="pb-10 pt-6 sm:pb-12" tabindex="-1">
      <router-outlet />
    </main>

    <nav
      class="nav-movil fixed inset-x-0 bottom-0 z-20 border-t border-linea bg-papel sm:hidden"
      aria-label="Principal móvil"
    >
      <ul class="flex">
        @for (e of enlaces(); track e.ruta) {
          <li class="flex-1">
            <a
              [routerLink]="e.ruta"
              routerLinkActive="!text-marca !border-marca"
              ariaCurrentWhenActive="page"
              class="flex min-h-14 items-center justify-center border-t-[3px] border-transparent px-2 text-sm font-semibold text-piedra"
              >{{ e.texto }}</a
            >
          </li>
        }
      </ul>
    </nav>
  `,
})
export class ShellComponent {
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);
  protected readonly enlaces = computed(() => {
    const rol = this.session.rol();
    return rol ? MENU[rol] : [];
  });
  protected readonly nombreRol = computed(() => {
    const rol = this.session.rol();
    return rol ? NOMBRE_ROL[rol] : '';
  });

  protected salir(): void {
    this.session.cerrar('manual');
    void this.router.navigate(['/login']);
  }
}
