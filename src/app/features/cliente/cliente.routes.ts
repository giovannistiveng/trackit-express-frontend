import { Routes } from '@angular/router';

export const CLIENTE_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'inicio' },
  {
    path: 'inicio',
    title: 'Inicio · TrackIt Express',
    loadComponent: () => import('./inicio-cliente.page').then((m) => m.InicioClientePage),
  },
  {
    path: 'nuevo-envio',
    title: 'Nuevo pedido · TrackIt Express',
    loadComponent: () => import('./nuevo-envio.page').then((m) => m.NuevoEnvioPage),
  },
  {
    path: 'envios',
    title: 'Mis pedidos · TrackIt Express',
    loadComponent: () => import('./envios.page').then((m) => m.EnviosPage),
  },
  {
    path: 'envios/:id',
    title: 'Seguimiento · TrackIt Express',
    loadComponent: () => import('./envio-detalle.page').then((m) => m.EnvioDetallePage),
  },
];
