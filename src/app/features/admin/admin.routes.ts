import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'conductores' },
  {
    path: 'conductores',
    title: 'Conductores · TrackIt Express',
    loadComponent: () => import('./conductores.page').then((m) => m.ConductoresPage),
  },
  {
    path: 'dashboard',
    title: 'Métricas · TrackIt Express',
    loadComponent: () => import('./dashboard.page').then((m) => m.DashboardPage),
  },
  {
    path: 'auditoria',
    title: 'Auditoría · TrackIt Express',
    loadComponent: () => import('./auditoria.page').then((m) => m.AuditoriaPage),
  },
];
