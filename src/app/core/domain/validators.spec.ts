import {
  esContrasenaValida,
  esCoordenadaValida,
  esCorreoValido,
  esIdValido,
  esNombreValido,
  esPinValido,
  esPlacaValida,
  limpiarTexto,
  nombreCompleto,
  normalizarPlaca,
  requisitosContrasena,
  validarArchivo,
} from './validators';

describe('validadores de dominio', () => {
  describe('placa', () => {
    it.each(['ABC123', 'ABC12D'])('debería aceptar %s', (p) => expect(esPlacaValida(p)).toBe(true));
    it('debería normalizar abc123 a mayúsculas y aceptarla', () => {
      expect(normalizarPlaca(' abc-12 3 ')).toBe('ABC123');
      expect(esPlacaValida('abc123')).toBe(true);
    });
    it.each(['AB1234', 'ABCD12', '', 'ABC1234'])('debería rechazar "%s"', (p) =>
      expect(esPlacaValida(p)).toBe(false),
    );
  });

  describe('PIN', () => {
    it('debería aceptar 1234', () => expect(esPinValido('1234')).toBe(true));
    it.each(['123', '12345', '12a4', ''])('debería rechazar "%s"', (p) =>
      expect(esPinValido(p)).toBe(false),
    );
  });

  describe('contraseña', () => {
    it('debería rechazar una sin mayúscula', () =>
      expect(esContrasenaValida('clave1234')).toBe(false));
    it('debería rechazar una sin número', () =>
      expect(esContrasenaValida('ClaveSegura')).toBe(false));
    it('debería rechazar una de menos de 8 caracteres', () =>
      expect(esContrasenaValida('Cl4ve')).toBe(false));
    it('debería aceptar una válida', () => expect(esContrasenaValida('Clave1234')).toBe(true));
    it('debería informar cada requisito por separado', () =>
      expect(requisitosContrasena('abc')).toEqual({
        longitud: false,
        mayuscula: false,
        numero: false,
      }));
  });

  describe('correo y nombre', () => {
    it('debería aceptar correos válidos y rechazar inválidos', () => {
      expect(esCorreoValido('ana@correo.co')).toBe(true);
      expect(esCorreoValido('ana@correo')).toBe(false);
      expect(esCorreoValido('   ')).toBe(false);
      expect(esCorreoValido(`${'a'.repeat(175)}@x.com`)).toBe(false);
    });
    it('debería aceptar tildes y ñ en el nombre', () =>
      expect(esNombreValido('José Peña Ñúñez')).toBe(true));
    it('debería rechazar números en el nombre', () => expect(esNombreValido('Ana 2')).toBe(false));
    it('debería rechazar nombres de 121 caracteres', () =>
      expect(esNombreValido('a'.repeat(121))).toBe(false));
    it('debería aceptar exactamente 120 caracteres', () =>
      expect(esNombreValido('a'.repeat(120))).toBe(true));
    it('debería unir nombres y apellidos limpiando espacios', () =>
      expect(nombreCompleto(' Ana  María ', 'Gómez ')).toBe('Ana María Gómez'));
    it('debería colapsar espacios', () => expect(limpiarTexto('  a   b ')).toBe('a b'));
  });

  describe('archivo', () => {
    const tipos = ['image/jpeg', 'application/pdf'];
    it('debería aceptar un tipo permitido dentro del tamaño', () =>
      expect(validarArchivo({ type: 'image/jpeg', size: 10 }, tipos)).toBeNull());
    it('debería rechazar un tipo no permitido', () =>
      expect(validarArchivo({ type: 'text/plain', size: 10 }, tipos)).toBe('tipo'));
    it('debería rechazar más de 5 MB', () =>
      expect(validarArchivo({ type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 }, tipos)).toBe(
        'tamano',
      ));
    it('debería indicar vacío sin archivo', () =>
      expect(validarArchivo(null, tipos)).toBe('vacio'));
  });

  describe('ids y coordenadas', () => {
    it.each([
      ['1', true],
      [5, true],
      ['abc', false],
      ['0', false],
      ['1.5', false],
      ['', false],
      [-3, false],
    ])('esIdValido(%s) = %s', (v, r) => expect(esIdValido(v)).toBe(r));
    it('debería validar rangos de latitud y longitud', () => {
      expect(esCoordenadaValida(4.33, -74.36)).toBe(true);
      expect(esCoordenadaValida(91, 0)).toBe(false);
      expect(esCoordenadaValida(0, -181)).toBe(false);
      expect(esCoordenadaValida(Number.NaN, 0)).toBe(false);
    });
  });
});
