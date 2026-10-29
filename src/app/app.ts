import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastsComponent } from './shared/ui/toast.service';
import { BannerConexionComponent } from './layout/banner-conexion.component';

@Component({
  selector: 'ti-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ToastsComponent, BannerConexionComponent],
  template: `
    <a
      href="#contenido"
      class="sr-only-focusable fixed left-2 top-2 z-50 rounded bg-placa px-3 py-2 font-semibold"
      >Saltar al contenido</a
    >
    <ti-banner-conexion />
    <router-outlet />
    <ti-toasts />
  `,
})
export class App {}
