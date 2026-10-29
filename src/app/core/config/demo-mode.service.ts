import { Injectable, computed, inject } from '@angular/core';
import { APP_CONFIG, FeatureName } from './app-config';

export const DESCRIPCION_FLAGS: Record<FeatureName, string> = {
  conductorMe: 'Perfil de conductor',
  zonasEndpoint: 'Listado de zonas',
  clienteEnviosEndpoint: 'Historial del cliente',
  disponiblesEndpoint: 'Tablero del conductor',
  iniciarRutaEndpoint: 'Iniciar ruta',
  pendientesEndpoint: 'Conductores pendientes',
  evidenciaUpload: 'Subida de la foto de entrega',
  ubicacion: 'Ubicación en vivo',
  reputacion: 'Reputación',
  motivoRechazo: 'Motivo de rechazo',
  adminDashboard: 'Panel administrativo',
  categoriaEnvio: 'Categoría del envío',
};

@Injectable({ providedIn: 'root' })
export class DemoModeService {
  private readonly config = inject(APP_CONFIG);
  readonly flags = this.config.features;
  /** Flags apagados (funciones con adaptador simulado o alternativo). */
  readonly simulados = computed(() =>
    (Object.keys(this.flags) as FeatureName[])
      .filter((f) => !this.flags[f])
      .map((f) => ({ flag: f, descripcion: DESCRIPCION_FLAGS[f] })),
  );
  readonly mostrarInsignia = !this.config.production;

  activo(flag: FeatureName): boolean {
    return this.flags[flag];
  }
}
