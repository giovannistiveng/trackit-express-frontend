import { inject } from '@angular/core';
import { APP_CONFIG } from '../../config/app-config';

/** Construye URLs absolutas de la API a partir de environment.apiBaseUrl. */
export function apiUrl(): (ruta: string) => string {
  const base = inject(APP_CONFIG).apiBaseUrl.replace(/\/$/, '');
  return (ruta: string) => `${base}${ruta.startsWith('/') ? ruta : '/' + ruta}`;
}
