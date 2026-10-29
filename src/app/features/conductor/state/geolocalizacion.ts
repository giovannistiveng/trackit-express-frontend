import { InjectionToken } from '@angular/core';

export type Geo = Pick<Geolocation, 'watchPosition' | 'clearWatch'>;

/** navigator.geolocation detrás de un token para poder probar con un doble. */
export const GEOLOCALIZACION = new InjectionToken<Geo | null>('GEOLOCALIZACION', {
  providedIn: 'root',
  factory: () =>
    typeof navigator !== 'undefined' && 'geolocation' in navigator ? navigator.geolocation : null,
});
