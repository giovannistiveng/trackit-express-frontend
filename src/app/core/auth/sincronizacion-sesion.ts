import { Injectable, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastService } from '../../shared/ui/toast.service';
import { CLAVE_SESION, SessionService } from './session.service';

/**
 * Escucha los cambios de sesión hechos en otras pestañas (evento "storage") y lleva esta
 * pestaña al estado nuevo, con un aviso. Así nunca se trabaja con dos cuentas mezcladas.
 */
@Injectable({ providedIn: 'root' })
export class SincronizacionSesion implements OnDestroy {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly alCambiar = (ev: StorageEvent) => {
    if (ev.key === CLAVE_SESION || ev.key === null) this.aplicar();
  };

  iniciar(): void {
    window.addEventListener('storage', this.alCambiar);
  }

  ngOnDestroy(): void {
    window.removeEventListener('storage', this.alCambiar);
  }

  aplicar(): void {
    const resultado = this.session.sincronizarDesdeOtraPestana();
    if (resultado === 'cerrada') {
      this.toast.mostrar('Cerraste sesión en otra pestaña.');
      void this.router.navigate(['/login']);
    } else if (resultado === 'otra-cuenta') {
      this.toast.mostrar(
        `Iniciaste sesión como ${this.session.usuario()?.nombre} en otra pestaña. Para probar dos cuentas a la vez usa otro navegador o una ventana privada.`,
      );
      void this.router.navigateByUrl(this.session.inicioDelRol());
    }
  }
}
