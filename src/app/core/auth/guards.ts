import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Rol } from '../domain';
import { SessionService } from './session.service';

/** Exige sesión iniciada. */
export const authGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  return session.estaAutenticado() ? true : inject(Router).createUrlTree(['/login']);
};

/** Exige uno de los roles dados; si el usuario tiene otro rol, lo lleva a su propio inicio. */
export function roleGuard(roles: Rol[]): CanActivateFn {
  return () => {
    const session = inject(SessionService);
    const router = inject(Router);
    const rol = session.rol();
    if (!rol) return router.createUrlTree(['/login']);
    return roles.includes(rol) ? true : router.parseUrl(session.inicioDelRol());
  };
}

/** Para /login y /registro: si ya hay sesión, va al inicio del rol. */
export const invitadoGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  return session.estaAutenticado() ? inject(Router).parseUrl(session.inicioDelRol()) : true;
};
