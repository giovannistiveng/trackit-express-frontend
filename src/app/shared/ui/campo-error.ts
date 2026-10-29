import { AbstractControl } from '@angular/forms';

/** true si el control es inválido y el usuario ya interactuó con él. */
export function mostrarError(control: AbstractControl | null): boolean {
  return !!control && control.invalid && (control.touched || control.dirty);
}
