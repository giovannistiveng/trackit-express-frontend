import { inject } from '@angular/core';
import { CanActivateFn, Routes } from '@angular/router';
import { DriverProfileStore } from './state/driver-profile.store';

/** Asegura que el perfil del conductor esté cargado antes de entrar. */
const perfilCargado: CanActivateFn = async () => {
  await inject(DriverProfileStore).cargar();
  return true;
};

export const CONDUCTOR_ROUTES: Routes = [
  {
    path: '',
    canActivate: [perfilCargado],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tablero' },
      {
        path: 'ganancias',
        title: 'Mis ganancias · TrackIt Express',
        loadComponent: () => import('./ganancias.page').then((m) => m.GananciasPage),
      },
      {
        path: 'perfil',
        title: 'Mi perfil · TrackIt Express',
        loadComponent: () => import('./perfil.page').then((m) => m.PerfilPage),
      },
      {
        path: 'tablero',
        title: 'Servicios disponibles · TrackIt Express',
        loadComponent: () => import('./tablero.page').then((m) => m.TableroPage),
      },
      {
        path: 'servicio/:id',
        title: 'Servicio en curso · TrackIt Express',
        loadComponent: () => import('./servicio.page').then((m) => m.ServicioPage),
      },
    ],
  },
];
