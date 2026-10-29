import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { authGuard, invitadoGuard, roleGuard } from './core/auth/guards';
import { SessionService } from './core/auth/session.service';
import { ROL } from './core/domain';
import { ShellComponent } from './layout/shell.component';
import { NoEncontradaComponent } from './layout/no-encontrada.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [() => inject(Router).parseUrl(inject(SessionService).inicioDelRol())],
    children: [],
  },
  {
    path: 'login',
    canActivate: [invitadoGuard],
    title: 'Iniciar sesión · TrackIt Express',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'registro',
    canActivate: [invitadoGuard],
    title: 'Crear cuenta · TrackIt Express',
    loadComponent: () => import('./features/auth/registro.page').then((m) => m.RegistroPage),
  },
  {
    path: 'cliente',
    component: ShellComponent,
    canActivate: [authGuard, roleGuard([ROL.CLIENTE])],
    loadChildren: () => import('./features/cliente/cliente.routes').then((m) => m.CLIENTE_ROUTES),
  },
  {
    path: 'conductor',
    component: ShellComponent,
    canActivate: [authGuard, roleGuard([ROL.CONDUCTOR])],
    loadChildren: () =>
      import('./features/conductor/conductor.routes').then((m) => m.CONDUCTOR_ROUTES),
  },
  {
    path: 'admin',
    component: ShellComponent,
    canActivate: [authGuard, roleGuard([ROL.ADMIN])],
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  { path: '**', title: 'Página no encontrada · TrackIt Express', component: NoEncontradaComponent },
];
