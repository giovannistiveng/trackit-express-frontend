import { Injectable, computed, inject, signal } from '@angular/core';
import { Rol, Sesion, Usuario, leerExpiracionJwt } from '../domain';
import { LoggerPort, SessionStoragePort } from '../ports';
import { LoggerService } from '../logging/logger.service';

export const CLAVE_SESION = 'trackit.session';

export type MotivoCierre = 'manual' | 'expirada' | 'rechazada';

/** Ruta de inicio de cada rol. */
export const INICIO_POR_ROL: Record<Rol, string> = {
  '1': '/admin',
  '2': '/cliente',
  '3': '/conductor',
};

/** Estado de sesión con signals. Guarda { token, user } en localStorage (trackit.session). */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly storage = inject(SessionStoragePort);
  private readonly log = inject(LoggerPort);
  private readonly loggerService = inject(LoggerService, { optional: true });

  private readonly sesion = signal<Sesion | null>(null);
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  /** Último motivo de cierre automático (para mostrar un aviso en /login). */
  readonly ultimoCierre = signal<MotivoCierre | null>(null);

  readonly usuario = computed<Usuario | null>(() => this.sesion()?.usuario ?? null);
  readonly token = computed<string | null>(() => this.sesion()?.token ?? null);
  readonly rol = computed<Rol | null>(() => this.sesion()?.usuario.rol ?? null);
  readonly estaAutenticado = computed(() => this.sesion() !== null);

  /** Restaura la sesión guardada. Si el token ya venció, la descarta. */
  restaurar(ahora = Date.now()): void {
    const crudo = this.storage.leer(CLAVE_SESION);
    if (!crudo) return;
    try {
      const datos = JSON.parse(crudo) as { token?: string; user?: Usuario };
      if (!datos.token || !datos.user) throw new Error('incompleta');
      const expiraEn = leerExpiracionJwt(datos.token);
      if (expiraEn === null || expiraEn <= ahora) {
        this.storage.borrar(CLAVE_SESION);
        this.ultimoCierre.set('expirada');
        this.log.info('Sesion', 'Sesión guardada vencida al arrancar; se cierra');
        return;
      }
      this.aplicar({ token: datos.token, usuario: datos.user, expiraEn }, ahora);
    } catch {
      this.storage.borrar(CLAVE_SESION);
    }
  }

  /** Inicia sesión con lo que devolvió el login. Devuelve false si el token no es válido. */
  iniciar(usuario: Usuario, token: string, ahora = Date.now()): boolean {
    const expiraEn = leerExpiracionJwt(token);
    if (expiraEn === null || expiraEn <= ahora) {
      this.log.warn('Sesion', 'El token recibido no tiene una expiración válida');
      return false;
    }
    this.storage.guardar(CLAVE_SESION, JSON.stringify({ token, user: usuario }));
    this.ultimoCierre.set(null);
    this.aplicar({ token, usuario, expiraEn }, ahora);
    this.log.info('Sesion', `Inicio de sesión (rol ${usuario.rol})`);
    return true;
  }

  cerrar(motivo: MotivoCierre = 'manual'): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    const habia = this.sesion() !== null;
    this.sesion.set(null);
    this.storage.borrar(CLAVE_SESION);
    this.loggerService?.establecerUsuario(undefined);
    void limpiarCacheDeDatos();
    if (motivo !== 'manual') this.ultimoCierre.set(motivo);
    if (habia) this.log.info('Sesion', `Cierre de sesión (${motivo})`);
  }

  inicioDelRol(): string {
    const rol = this.rol();
    return rol ? INICIO_POR_ROL[rol] : '/login';
  }

  private aplicar(sesion: Sesion, ahora: number): void {
    this.sesion.set(sesion);
    this.loggerService?.establecerUsuario(sesion.usuario.id);
    if (this.temporizador) clearTimeout(this.temporizador);
    // setTimeout admite como máximo ~24,8 días
    const espera = Math.min(sesion.expiraEn - ahora, 2_147_000_000);
    this.temporizador = setTimeout(() => this.cerrar('expirada'), espera);
  }
}

/** Borra la caché de datos del Service Worker (trae el PIN): no debe sobrevivir a la sesión. */
export async function limpiarCacheDeDatos(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const claves = await caches.keys();
    await Promise.all(claves.filter((k) => k.includes(':data:')).map((k) => caches.delete(k)));
  } catch {
    /* sin acceso a Cache Storage */
  }
}
