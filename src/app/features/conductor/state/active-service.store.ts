import { Injectable, inject } from '@angular/core';
import { esActivo } from '../../../core/domain';
import { DriverServicePort, KeyValueStorePort } from '../../../core/ports';

/**
 * RN_OP_002: un conductor solo puede tener un servicio activo. El backend aún no lo valida
 * ni expone los servicios del conductor, así que se recuerda localmente y se verifica con GET.
 */
@Injectable({ providedIn: 'root' })
export class ActiveServiceStore {
  private readonly store = inject(KeyValueStorePort);
  private readonly servicios = inject(DriverServicePort);

  static clave(idConductor: number): string {
    return `trackit.servicioActivo.${idConductor}`;
  }

  async guardar(idConductor: number, idEnvio: number): Promise<void> {
    await this.store.set(ActiveServiceStore.clave(idConductor), idEnvio);
  }

  async limpiar(idConductor: number): Promise<void> {
    await this.store.remove(ActiveServiceStore.clave(idConductor));
  }

  /** Id del servicio activo, o null si no hay (o si ya se entregó). */
  async actual(idConductor: number): Promise<number | null> {
    const id = await this.store.get<number>(ActiveServiceStore.clave(idConductor));
    if (!id) return null;
    try {
      const envio = await this.servicios.obtener(id);
      if (envio.idConductor === idConductor && esActivo(envio.estado)) return id;
    } catch {
      return id; // sin red: se asume que sigue activo
    }
    await this.limpiar(idConductor);
    return null;
  }
}
