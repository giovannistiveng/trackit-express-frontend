import { Injectable, computed, inject, signal } from '@angular/core';
import { SessionService } from '../../../core/auth/session.service';
import { PerfilConductor, Vehiculo } from '../../../core/domain';
import { DriverProfilePort, LoggerPort } from '../../../core/ports';

/** Perfil del conductor autenticado (id, aprobación, motivo de rechazo y vehículo). */
@Injectable({ providedIn: 'root' })
export class DriverProfileStore {
  private readonly puerto = inject(DriverProfilePort);
  private readonly session = inject(SessionService);
  private readonly log = inject(LoggerPort);

  readonly perfil = signal<PerfilConductor | null>(null);
  readonly cargando = signal(false);
  readonly error = signal(false);
  readonly idConductor = computed(() => this.perfil()?.idConductor ?? null);
  readonly aprobado = computed(() => this.perfil()?.estadoAprobacion === 'Aprobado');
  private usuarioCargado: number | null = null;

  async cargar(forzar = false): Promise<PerfilConductor | null> {
    const usuario = this.session.usuario();
    if (!usuario) return null;
    if (!forzar && this.perfil() && this.usuarioCargado === usuario.id) return this.perfil();
    this.cargando.set(true);
    this.error.set(false);
    try {
      const p = await this.puerto.obtener();
      this.perfil.set(p);
      this.usuarioCargado = usuario.id;
      return p;
    } catch (e) {
      this.error.set(true);
      this.log.warn('PerfilConductor', 'No se pudo cargar el perfil del conductor', e);
      return null;
    } finally {
      this.cargando.set(false);
    }
  }

  registrarVehiculo(v: Vehiculo): void {
    this.perfil.update((p) => (p ? { ...p, vehiculo: v } : p));
  }
}
