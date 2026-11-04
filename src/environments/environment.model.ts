import { NivelLog } from '../app/core/domain/models';

export type { NivelLog };

export interface AppEnvironment {
  production: boolean;
  /** URL base de la API, por ejemplo https://api.trackit.com.co/api */
  apiBaseUrl: string;
  logs: { nivelMinimo: NivelLog; enviarAlServidor: boolean; consola: boolean };
}
