import { Routes } from '@angular/router';

export const CLIENTE_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'envios' },
  {
    path: 'nuevo-envio',
    title: 'Nuevo envío · TrackIt Express',
    loadComponent: () => import('./nuevo-envio.page').then((m) => m.NuevoEnvioPage),
  },
  {
    path: 'envios',
    title: 'Mis envíos · TrackIt Express',
    loadComponent: () => import('./envios.page').then((m) => m.EnviosPage),
  },
  {
    path: 'envios/:id',
    title: 'Seguimiento · TrackIt Express',
    loadComponent: () => import('./envio-detalle.page').then((m) => m.EnvioDetallePage),
  },
];
