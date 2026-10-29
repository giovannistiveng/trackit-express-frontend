import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConexionService } from './conexion.service';

@Component({
  selector: 'ti-banner-conexion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!conexion.enLinea()) {
      <div
        class="sticky top-0 z-30 bg-tinta px-4 py-2 text-center text-sm font-semibold text-white"
        role="status"
      >
        Sin conexión. Lo que hagas se enviará cuando vuelva la red.
      </div>
    }
  `,
})
export class BannerConexionComponent {
  protected readonly conexion = inject(ConexionService);
}
