import { HttpContextToken } from '@angular/common/http';

/** Marca peticiones cuyo 404 es esperado (no se registra como WARN). */
export const SILENCIAR_404 = new HttpContextToken<boolean>(() => false);
