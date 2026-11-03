import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, Router, Routes } from '@angular/router';
import { authGuard, invitadoGuard, roleGuard } from './core/auth/guards';
import { SessionService } from './core/auth/session.service';
import { ROL } from './core/domain';
import { ShellComponent } from './layout/shell.component';
import { NoEncontradaComponent } from './layout/no-encontrada.component';

export const routes: Routes = [
  {
    // Visitantes: sitio público. Con sesión iniciada: directo al panel del rol (también al abrir la PWA).
    path: '',
    pathMatch: 'full',
    canActivate: [
      () => {
        const session = inject(SessionService);
        return session.estaAutenticado() ? inject(Router).parseUrl(session.inicioDelRol()) : true;
      },
    ],
    title: 'TrackIt Express · Envíos en Fusagasugá y la región del Sumapaz',
    loadComponent: () => import('./features/publico/inicio.page').then((m) => m.InicioPage),
  },
  {
    path: 'inicio',
    title: 'TrackIt Express · Envíos en Fusagasugá y la región del Sumapaz',
    loadComponent: () => import('./features/publico/inicio.page').then((m) => m.InicioPage),
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
    path: 'olvide-contrasena',
    canActivate: [invitadoGuard],
    title: 'Recuperar contraseña · TrackIt Express',
    loadComponent: () =>
      import('./features/auth/recuperacion.pages').then((m) => m.OlvideContrasenaPage),
  },
  {
    path: 'restablecer-contrasena',
    title: 'Nueva contraseña · TrackIt Express',
    loadComponent: () =>
      import('./features/auth/recuperacion.pages').then((m) => m.RestablecerContrasenaPage),
  },
  {
    path: 'verificar-correo',
    title: 'Verificar correo · TrackIt Express',
    loadComponent: () =>
      import('./features/auth/recuperacion.pages').then((m) => m.VerificarCorreoPage),
  },
  {
    // Enlace público para quien recibe el envío (sin cuenta)
    path: 'seguimiento/:token',
    title: 'Seguimiento de envío · TrackIt Express',
    loadComponent: () =>
      import('./features/publico/seguimiento.page').then((m) => m.SeguimientoPublicoPage),
  },
  {
    // Enlaces de las notificaciones push: llevan al envío según el rol
    path: 'envios/:id',
    canActivate: [
      authGuard,
      (ruta: ActivatedRouteSnapshot) => {
        const session = inject(SessionService);
        const id = ruta.paramMap.get('id');
        const chat = ruta.queryParamMap.get('chat') ? '?chat=1' : '';
        const rol = session.rol();
        const destino =
          rol === ROL.CLIENTE
            ? `/cliente/envios/${id}${chat}`
            : rol === ROL.CONDUCTOR
              ? `/conductor/servicio/${id}${chat}`
              : '/admin/envios';
        return inject(Router).parseUrl(destino);
      },
    ],
    children: [],
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
    path: 'cuenta',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        title: 'Mi cuenta · TrackIt Express',
        loadComponent: () => import('./features/cuenta/cuenta.page').then((m) => m.CuentaPage),
      },
    ],
  },
  {
    path: 'admin',
    component: ShellComponent,
    canActivate: [authGuard, roleGuard([ROL.ADMIN])],
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  { path: '**', title: 'Página no encontrada · TrackIt Express', component: NoEncontradaComponent },
];
