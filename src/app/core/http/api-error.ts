/** Error normalizado de cualquier petición a la API. */
export class ApiError extends Error {
  constructor(
    /** Código HTTP. 0 = sin conexión, 408 = tiempo de espera agotado. */
    public readonly status: number,
    /** Texto técnico del campo error del backend (no se muestra tal cual al usuario). */
    message: string,
    public readonly codigoInterno?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static esApiError(e: unknown): e is ApiError {
    return e instanceof ApiError;
  }
}

export const SIN_CONEXION = 'SIN_CONEXION';
export const TIEMPO_AGOTADO = 'TIEMPO_AGOTADO';
