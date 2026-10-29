import { InjectionToken } from '@angular/core';
import { AppEnvironment, FeatureFlags } from '../../../environments/environment.model';
import { environment } from '../../../environments/environment';

export const APP_CONFIG = new InjectionToken<AppEnvironment>('APP_CONFIG', {
  providedIn: 'root',
  factory: () => environment,
});

export type FeatureName = keyof FeatureFlags;
