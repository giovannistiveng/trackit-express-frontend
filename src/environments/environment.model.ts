export type NivelLog = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface AppEnvironment {
  production: boolean;
  /** URL base de la API, por ejemplo https://api.trackit.com.co/api */
  apiBaseUrl: string;
  logs: { nivelMinimo: NivelLog; enviarAlServidor: boolean; consola: boolean };
}
