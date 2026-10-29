import { ApiError, SIN_CONEXION, TIEMPO_AGOTADO } from './api-error';
import { ErrorMessageMapper, MENSAJE_GENERICO } from './error-message.mapper';

describe('ErrorMessageMapper', () => {
  const m = new ErrorMessageMapper();
  const t = (status: number, msg: string) => m.traducir(new ApiError(status, msg));

  it.each([
    ['Credenciales inválidas', 'Correo o contraseña incorrectos'],
    [
      'El correo ya está registrado',
      'Este correo ya tiene una cuenta. Inicia sesión o usa otro correo.',
    ],
    ['La placa ya está registrada', 'Esa placa ya está registrada en el sistema.'],
    [
      'No existe un conductor con id 4',
      'Tu perfil de conductor aún no está creado. Contacta a soporte.',
    ],
    [
      'No existe el conductor con id 77',
      'Tu perfil de conductor aún no está creado. Contacta a soporte.',
    ],
    ['File too large', 'El archivo pesa más de 5 MB. Elige uno más liviano.'],
    ['Solo se permiten imágenes o PDF', 'Solo se aceptan imágenes JPG o PNG, o archivos PDF.'],
    ['Zona no encontrada', 'La zona elegida no existe. Elige otra zona.'],
    [
      'Este envío ya fue tomado por otro conductor',
      'Este servicio ya fue tomado por otro conductor',
    ],
    [
      'El envío ya está en estado Asignado y no se puede asignar',
      'Este servicio ya fue tomado por otro conductor',
    ],
    ['PIN incorrecto', 'El PIN no coincide. Pídeselo de nuevo al cliente e inténtalo otra vez.'],
    [
      'El PIN de seguridad es obligatorio para validar la entrega',
      'Escribe los 4 dígitos del PIN.',
    ],
    ['La evidencia fotográfica (url_foto) es obligatoria', 'Toma o sube la foto de la entrega.'],
    ['Este envío ya ha sido validado como entregado', 'Este envío ya fue entregado.'],
    ['Este envío ya tiene una evidencia de entrega registrada', 'Este envío ya fue entregado.'],
    ['La calificación debe estar entre 1 y 5 estrellas', 'Elige entre 1 y 5 estrellas.'],
    [
      'Solo se pueden calificar envíos que ya fueron entregados',
      'Solo puedes calificar un envío entregado.',
    ],
    ['Este envío ya fue calificado', 'Ya calificaste este envío.'],
    ['Este conductor ya ha sido aprobado previamente', 'Este conductor ya estaba aprobado.'],
    ['No existe el envío con id 99', 'No encontramos ese envío.'],
    [
      'Demasiadas peticiones, intenta más tarde',
      'Demasiados intentos seguidos. Espera un momento.',
    ],
  ])('debería traducir "%s"', (backend, esperado) => expect(t(400, backend)).toBe(esperado));

  it('debería usar el genérico para mensajes desconocidos o errores que no son ApiError', () => {
    expect(t(500, 'Error interno del servidor')).toBe(MENSAJE_GENERICO);
    expect(m.traducir(new Error('x'))).toBe(MENSAJE_GENERICO);
  });

  it('debería explicar sin conexión, tiempo agotado, sesión y 404 genérico', () => {
    expect(m.traducir(new ApiError(0, 'x', SIN_CONEXION))).toContain('No hay conexión');
    expect(m.traducir(new ApiError(408, 'x', TIEMPO_AGOTADO))).toContain('tardó demasiado');
    expect(t(401, 'jwt expired')).toContain('sesión terminó');
    expect(t(404, 'Not Found')).toBe('No encontramos lo que buscas.');
  });
});
