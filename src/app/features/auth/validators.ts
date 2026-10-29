import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { esContrasenaValida, esCorreoValido, esNombreValido } from '../../core/domain';

export const correoValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  !c.value || esCorreoValido(String(c.value)) ? null : { correo: true };

export const nombreValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  !c.value || esNombreValido(String(c.value)) ? null : { nombre: true };

export const contrasenaValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  !c.value || esContrasenaValida(String(c.value)) ? null : { contrasena: true };

/** Valida en el grupo que password y confirmar coincidan. */
export const coincidenValidator: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
  const a = g.get('password')?.value as string | undefined;
  const b = g.get('confirmar')?.value as string | undefined;
  return a && b && a !== b ? { noCoinciden: true } : null;
};
