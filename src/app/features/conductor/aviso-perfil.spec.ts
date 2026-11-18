import { TestBed } from '@angular/core/testing';
import { montar } from '../../../testing/pantallas';
import { PerfilConductor } from '../../core/domain';
import { AvisoPerfilComponent } from './components/aviso-perfil.component';

const BASE: PerfilConductor = {
  idConductor: 1,
  estadoAprobacion: 'Pendiente',
  motivoRechazo: null,
};

async function ver(perfil: PerfilConductor | null, conEnlace = true) {
  const r = await montar(AvisoPerfilComponent, { inputs: { perfil, conEnlace } });
  const texto = r.el.textContent?.replaceAll(/\s+/g, ' ') ?? '';
  const enlace = !!r.el.querySelector('a');
  TestBed.resetTestingModule();
  return { texto, enlace };
}

describe('AvisoPerfilComponent', () => {
  it('explica cada estado con o sin motivo y con o sin enlace', async () => {
    expect((await ver(null)).texto).toContain('No pudimos cargar tu perfil');
    const rechazado = await ver({
      ...BASE,
      estadoAprobacion: 'Rechazado',
      motivoRechazo: 'Foto borrosa',
    });
    expect(rechazado.texto).toContain('Motivo: Foto borrosa');
    expect(rechazado.enlace).toBe(true);
    const rechazadoSin = await ver({ ...BASE, estadoAprobacion: 'Rechazado' }, false);
    expect(rechazadoSin.texto).not.toContain('Motivo:');
    expect(rechazadoSin.enlace).toBe(false);
    const pausa = await ver({
      ...BASE,
      estadoAprobacion: 'Suspendido',
      motivoRechazo: 'SOAT vencido',
    });
    expect(pausa.texto).toContain('Tu cuenta está en pausa');
    expect(pausa.texto).toContain('SOAT vencido.');
    expect(pausa.enlace).toBe(true);
    const pausaSin = await ver({ ...BASE, estadoAprobacion: 'Suspendido' }, false);
    expect(pausaSin.enlace).toBe(false);
    const faltan = await ver({
      ...BASE,
      requisitos: { completo: false, pendientes: ['Falta SOAT'], items: [] },
    });
    expect(faltan.texto).toContain('Falta SOAT');
    const revision = await ver(BASE, false);
    expect(revision.texto).toContain('Un administrador está revisando');
    expect(revision.enlace).toBe(false);
  });
});
