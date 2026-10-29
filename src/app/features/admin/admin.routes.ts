import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    title: 'Panel · TrackIt Express',
    loadComponent: () => import('./dashboard.page').then((m) => m.DashboardPage),
  },
  {
    path: 'envios',
    title: 'Envíos · TrackIt Express',
    loadComponent: () => import('./envios-admin.page').then((m) => m.EnviosAdminPage),
  },
  {
    path: 'conductores',
    title: 'Conductores · TrackIt Express',
    loadComponent: () => import('./conductores.page').then((m) => m.ConductoresPage),
  },
  {
    path: 'zonas',
    title: 'Zonas y tarifas · TrackIt Express',
    loadComponent: () => import('./zonas.page').then((m) => m.ZonasPage),
  },
  {
    path: 'mensajes',
    title: 'Mensajes · TrackIt Express',
    loadComponent: () => import('./mensajes.page').then((m) => m.MensajesPage),
  },
  {
    path: 'auditoria',
    title: 'Auditoría · TrackIt Express',
    loadComponent: () => import('./auditoria.page').then((m) => m.AuditoriaPage),
  },
];
