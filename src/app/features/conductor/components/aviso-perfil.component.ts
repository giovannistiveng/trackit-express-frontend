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
      @let p = perfil();
      @if (!p) {
        <p class="font-bold">No pudimos cargar tu perfil de conductor</p>
        <p class="mt-1 text-sm">Revisa tu conexión y vuelve a intentarlo en un momento.</p>
      } @else if (p.estadoAprobacion === 'Rechazado') {
        <p class="font-bold">Tu solicitud fue rechazada</p>
        @if (p.motivoRechazo) {
          <p class="mt-1 text-sm">
            <span class="font-semibold">Motivo:</span> {{ p.motivoRechazo }}
          </p>
        }
        <p class="mt-1 text-sm">
          Corrige y vuelve a subir tus documentos; al hacerlo, tu cuenta vuelve a revisión.
        </p>
        @if (conEnlace()) {
          <a routerLink="/conductor/perfil" class="btn-texto mt-2">Ir a mis documentos</a>
        }
      } @else if (p.estadoAprobacion === 'Suspendido') {
        <p class="font-bold">Tu cuenta está en pausa</p>
        @if (p.motivoRechazo) {
          <p class="mt-1 text-sm">{{ p.motivoRechazo }}.</p>
        }
        <p class="mt-1 text-sm">Sube el documento renovado y volverás a revisión.</p>
        @if (conEnlace()) {
          <a routerLink="/conductor/perfil" class="btn-texto mt-2">Ir a mis documentos</a>
        }
      } @else {
        <p class="font-bold">Tu cuenta está en revisión</p>
        @let pendientes = p.requisitos?.pendientes ?? [];
        @if (pendientes.length) {
          <p class="mt-1 text-sm">Para que te aprueben falta:</p>
          <ul class="mt-1 list-disc pl-5 text-sm">
            @for (item of pendientes; track item) {
              <li>{{ item }}</li>
            }
          </ul>
        } @else {
          <p class="mt-1 text-sm">
            Un administrador está revisando tus documentos. Te avisamos apenas te aprueben.
          </p>
        }
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
