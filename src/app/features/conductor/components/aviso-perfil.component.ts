import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PerfilConductor } from '../../../core/domain';

/** Explica por qué el conductor aún no puede tomar servicios. */
@Component({
  selector: 'ti-aviso-perfil',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="rounded-2xl border border-placa/60 bg-aviso-suave p-5" role="status">
      @if (!perfil() || perfil()?.idConductor === null) {
        <p class="font-bold">Tu perfil de conductor aún no está creado</p>
        <p class="mt-1 text-sm">
          Sin perfil no puedes registrar vehículo, subir documentos ni tomar servicios. Contacta a
          soporte para activarlo.
        </p>
      } @else if (perfil()?.estadoAprobacion === 'Rechazado') {
        <p class="font-bold">Tu solicitud fue rechazada</p>
        <p class="mt-1 text-sm">
          Revisa y vuelve a subir tus documentos; el equipo los revisará otra vez.
        </p>
        @if (conEnlace()) {
          <a routerLink="/conductor/perfil" class="btn-texto mt-2">Ir a mis documentos</a>
        }
      } @else {
        <p class="font-bold">Tu cuenta está en revisión</p>
        <p class="mt-1 text-sm">
          Podrás tomar servicios cuando un administrador apruebe tus documentos (cédula, SOAT y
          licencia).
        </p>
        @if (conEnlace()) {
          <a routerLink="/conductor/perfil" class="btn-texto mt-2">Revisar mis documentos</a>
        }
      }
    </div>
  `,
})
export class AvisoPerfilComponent {
  readonly perfil = input<PerfilConductor | null>(null);
  readonly conEnlace = input(true);
}
