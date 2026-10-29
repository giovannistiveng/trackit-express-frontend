import { Injectable } from '@angular/core';
import { ApiError, SIN_CONEXION, TIEMPO_AGOTADO } from './api-error';

/** Mensajes amigables por error conocido del backend. El orden importa: gana la primera coincidencia. */
const REGLAS: { patron: RegExp; mensaje: string }[] = [
  { patron: /credenciales inválidas/i, mensaje: 'Correo o contraseña incorrectos' },
  {
    patron: /correo ya está registrado/i,
    mensaje: 'Este correo ya tiene una cuenta. Inicia sesión o usa otro correo.',
  },
  { patron: /placa ya está registrada/i, mensaje: 'Esa placa ya está registrada en el sistema.' },
  {
    patron: /no existe (un|el) conductor/i,
    mensaje: 'Tu perfil de conductor aún no está creado. Contacta a soporte.',
  },
  { patron: /file too large/i, mensaje: 'El archivo pesa más de 5 MB. Elige uno más liviano.' },
  {
    patron: /solo se permiten imágenes o pdf|unexpected field/i,
    mensaje: 'Solo se aceptan imágenes JPG o PNG, o archivos PDF.',
  },
  {
    patron: /zona.*(no existe|no encontrada)|no existe.*zona/i,
    mensaje: 'La zona elegida no existe. Elige otra zona.',
  },
  {
    patron: /ya fue tomado por otro conductor|no se puede asignar/i,
    mensaje: 'Este servicio ya fue tomado por otro conductor',
  },
  {
    patron: /pin incorrecto/i,
    mensaje: 'El PIN no coincide. Pídeselo de nuevo al cliente e inténtalo otra vez.',
  },
  { patron: /pin de seguridad es obligatorio/i, mensaje: 'Escribe los 4 dígitos del PIN.' },
  { patron: /evidencia fotográfica/i, mensaje: 'Toma o sube la foto de la entrega.' },
  {
    patron: /ya ha sido validado como entregado|ya tiene una evidencia/i,
    mensaje: 'Este envío ya fue entregado.',
  },
  { patron: /calificación debe estar entre/i, mensaje: 'Elige entre 1 y 5 estrellas.' },
  {
    patron: /solo se pueden calificar envíos/i,
    mensaje: 'Solo puedes calificar un envío entregado.',
  },
  { patron: /envío ya fue calificado/i, mensaje: 'Ya calificaste este envío.' },
  { patron: /conductor ya ha sido aprobado/i, mensaje: 'Este conductor ya estaba aprobado.' },
  { patron: /no existe el envío/i, mensaje: 'No encontramos ese envío.' },
  { patron: /demasiadas peticiones/i, mensaje: 'Demasiados intentos seguidos. Espera un momento.' },
];

export const MENSAJE_GENERICO = 'Algo salió mal. Inténtalo de nuevo en un momento.';

@Injectable({ providedIn: 'root' })
export class ErrorMessageMapper {
  /** Traduce cualquier error a un texto en español apto para el usuario. */
  traducir(error: unknown): string {
    if (!ApiError.esApiError(error)) return MENSAJE_GENERICO;
    if (error.codigoInterno === SIN_CONEXION)
      return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
    if (error.codigoInterno === TIEMPO_AGOTADO)
      return 'El servidor tardó demasiado en responder. Inténtalo de nuevo.';
    const regla = REGLAS.find((r) => r.patron.test(error.message));
    if (regla) return regla.mensaje;
    if (error.status === 401 || error.status === 403)
      return 'Tu sesión terminó. Inicia sesión otra vez.';
    if (error.status === 404) return 'No encontramos lo que buscas.';
    return MENSAJE_GENERICO;
  }
}
