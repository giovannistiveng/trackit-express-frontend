import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  ErrorHandler,
  LOCALE_ID,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { SessionService } from './core/auth/session.service';
import { providePorts } from './core/config/ports.providers';
import { apiInterceptor } from './core/http/api.interceptor';
import { GlobalErrorHandler } from './core/logging/global-error-handler';
import { LoggerPort } from './core/ports';

registerLocaleData(localeEsCo);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    { provide: LOCALE_ID, useValue: 'es-CO' },
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    // El orden importa: auth ve los ApiError ya normalizados por apiInterceptor
    provideHttpClient(withInterceptors([authInterceptor, apiInterceptor])),
    providePorts(),
    provideAppInitializer(() => {
      inject(SessionService).restaurar();
      inject(LoggerPort).info('App', 'Aplicación iniciada');
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
