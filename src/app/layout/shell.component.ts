import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from '../core/auth/session.service';
import { Rol } from '../core/domain';
import { IconoComponent, NombreIcono } from '../shared/ui/icono.component';
import { LogoComponent } from '../shared/ui/logo.component';
import { CampanaComponent } from './campana.component';
import { NotificacionesStore } from './notificaciones.store';

interface Enlace {
  ruta: string;
  texto: string;
  icono: NombreIcono;
  /** false: no aparece en la barra inferior del celular (queda en el menú de usuario). */
  movil?: boolean;
}

export const MENU: Record<Rol, Enlace[]> = {
  '1': [
    { ruta: '/admin/dashboard', texto: 'Panel', icono: 'chart' },
    { ruta: '/admin/envios', texto: 'Envíos', icono: 'package' },
    { ruta: '/admin/conductores', texto: 'Conductores', icono: 'users' },
    { ruta: '/admin/zonas', texto: 'Zonas', icono: 'map-pin' },
    { ruta: '/admin/mensajes', texto: 'Mensajes', icono: 'inbox' },
    { ruta: '/admin/auditoria', texto: 'Auditoría', icono: 'clipboard-list', movil: false },
  ],
  '2': [
    { ruta: '/cliente/nuevo-envio', texto: 'Nuevo envío', icono: 'package' },
    { ruta: '/cliente/envios', texto: 'Mis envíos', icono: 'list' },
  ],
  '3': [
    { ruta: '/conductor/tablero', texto: 'Servicios', icono: 'map' },
    { ruta: '/conductor/ganancias', texto: 'Ganancias', icono: 'wallet' },
    { ruta: '/conductor/perfil', texto: 'Mi perfil', icono: 'user' },
  ],
};

const NOMBRE_ROL: Record<Rol, string> = { '1': 'Administración', '2': 'Cliente', '3': 'Conductor' };

/** Iniciales para el avatar: "Laura Méndez Ríos" → "LM". */
export function iniciales(nombre: string | undefined): string {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
  return (
    partes
      .slice(0, 2)
      .map((p) => p[0])
      .join('') || '?'
  ).toUpperCase();
}

/** Marco de las secciones autenticadas: cabecera, notificaciones, menú del usuario y navegación del rol. */
@Component({
  selector: 'ti-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IconoComponent,
    LogoComponent,
    CampanaComponent,
  ],
  host: {
    '(document:click)': 'alClicFuera($event)',
    '(document:keydown.escape)': 'menuUsuario.set(false)',
  },
  template: `
    <header class="sticky top-0 z-30 border-b border-linea/80 bg-papel/90 backdrop-blur-md">
      <div class="contenedor-ancho flex h-16 items-center gap-3">
        <a [routerLink]="session.inicioDelRol()" aria-label="TrackIt Express, inicio de tu panel"
          ><ti-logo
        /></a>
        <nav class="ml-6 hidden items-center gap-1 md:flex" aria-label="Principal">
          @for (e of enlaces(); track e.ruta) {
            <a
              [routerLink]="e.ruta"
              routerLinkActive="!bg-marca-suave !text-marca"
              ariaCurrentWhenActive="page"
              class="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-piedra transition-colors hover:bg-niebla hover:text-tinta"
            >
              <ti-icono [nombre]="e.icono" class="size-[1.1rem]" /> {{ e.texto }}
            </a>
          }
        </nav>
        <div class="ml-auto flex items-center gap-1">
          <ti-campana />
          <div class="relative" #menu>
            <button
              type="button"
              class="flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-niebla"
              [attr.aria-expanded]="menuUsuario()"
              aria-controls="menu-usuario"
              (click)="menuUsuario.set(!menuUsuario())"
            >
              <span
                class="grid size-9 place-items-center rounded-full bg-marca text-sm font-bold text-white"
                >{{ inicialesUsuario() }}</span
              >
              <span class="hidden text-left leading-tight lg:block">
                <span class="block text-sm font-semibold">{{ session.usuario()?.nombre }}</span>
                <span class="block text-xs text-piedra">{{ nombreRol() }}</span>
              </span>
              <ti-icono nombre="chevron-down" class="hidden size-4 text-piedra lg:block" />
              <span class="sr-only">Menú de la cuenta</span>
            </button>
            @if (menuUsuario()) {
              <div
                id="menu-usuario"
                class="tarjeta absolute right-0 top-13 z-40 w-64 overflow-hidden py-2 shadow-[var(--shadow-elevada)] animate-[var(--animate-aparecer)]"
              >
                <div class="border-b border-linea px-4 pb-3 pt-1">
                  <p class="truncate font-semibold">{{ session.usuario()?.nombre }}</p>
                  <p class="truncate text-sm text-piedra">{{ session.usuario()?.correo }}</p>
                </div>
                <a
                  routerLink="/cuenta"
                  class="flex min-h-11 items-center gap-3 px-4 hover:bg-crema"
                  (click)="menuUsuario.set(false)"
                >
                  <ti-icono nombre="user-round" class="text-piedra" /> Mi cuenta
                </a>
                @for (e of soloEnMenu(); track e.ruta) {
                  <a
                    [routerLink]="e.ruta"
                    class="flex min-h-11 items-center gap-3 px-4 hover:bg-crema md:hidden"
                    (click)="menuUsuario.set(false)"
                  >
                    <ti-icono [nombre]="e.icono" class="text-piedra" /> {{ e.texto }}
                  </a>
                }
                <a
                  routerLink="/inicio"
                  class="flex min-h-11 items-center gap-3 px-4 hover:bg-crema"
                  (click)="menuUsuario.set(false)"
                >
                  <ti-icono nombre="home" class="text-piedra" /> Sitio web
                </a>
                <button
                  type="button"
                  class="flex min-h-11 w-full items-center gap-3 px-4 text-alerta hover:bg-alerta-suave"
                  (click)="salir()"
                >
                  <ti-icono nombre="log-out" /> Cerrar sesión
                </button>
              </div>
            }
          </div>
        </div>
      </div>
    </header>

    <main id="contenido" class="pb-10 pt-6 sm:pb-14 sm:pt-8" tabindex="-1">
      <router-outlet />
    </main>

    <nav
      class="nav-movil fixed inset-x-0 bottom-0 z-20 border-t border-linea bg-papel/95 backdrop-blur md:hidden"
      aria-label="Principal móvil"
    >
      <ul class="flex pb-[env(safe-area-inset-bottom)]">
        @for (e of enlacesMovil(); track e.ruta) {
          <li class="flex-1">
            <a
              [routerLink]="e.ruta"
              routerLinkActive="!text-marca [&>span]:!bg-marca-suave"
              ariaCurrentWhenActive="page"
              class="flex min-h-15 flex-col items-center justify-center gap-0.5 px-1 text-[0.7rem] font-semibold text-piedra"
            >
              <span class="grid h-7 w-12 place-items-center rounded-full transition-colors"
                ><ti-icono [nombre]="e.icono"
              /></span>
              {{ e.texto }}
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
})
export class ShellComponent implements OnInit, OnDestroy {
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly notificaciones = inject(NotificacionesStore);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly menuUsuario = signal(false);

  protected readonly enlaces = computed(() => {
    const rol = this.session.rol();
    return rol ? MENU[rol] : [];
  });
  protected readonly enlacesMovil = computed(() => this.enlaces().filter((e) => e.movil !== false));
  protected readonly soloEnMenu = computed(() => this.enlaces().filter((e) => e.movil === false));
  protected readonly nombreRol = computed(() => {
    const rol = this.session.rol();
    return rol ? NOMBRE_ROL[rol] : '';
  });
  protected readonly inicialesUsuario = computed(() => iniciales(this.session.usuario()?.nombre));

  ngOnInit(): void {
    if (this.session.estaAutenticado()) this.notificaciones.iniciar();
  }

  ngOnDestroy(): void {
    this.notificaciones.detener();
  }

  protected salir(): void {
    this.menuUsuario.set(false);
    this.notificaciones.detener();
    this.session.cerrar('manual');
    void this.router.navigate(['/login']);
  }

  protected alClicFuera(ev: MouseEvent): void {
    if (!this.menuUsuario()) return;
    const menu = this.el.nativeElement.querySelector('#menu-usuario')?.parentElement;
    if (menu && !menu.contains(ev.target as Node)) this.menuUsuario.set(false);
  }
}
