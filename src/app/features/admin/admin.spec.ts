import { TestBed } from '@angular/core/testing';
import { botonPorTexto, elegir, escribir, q, rechaza } from '../../../testing/fakes';
import { ADMIN } from '../../../testing/fixtures';
import { montar } from '../../../testing/pantallas';
import { ApiError } from '../../core/http/api-error';
import { ConductorPostulante } from '../../core/domain';
import { AdminMetricsPort, ApprovalPort, DriverApplicantsPort } from '../../core/ports';
import { FakeAdminMetrics } from '../../../testing/admin-fake';
import { ToastService } from '../../shared/ui/toast.service';
import { AuditoriaPage, TAMANO_PAGINA } from './auditoria.page';
import { ConductoresPage, esPdf } from './conductores.page';
import { DashboardPage } from './dashboard.page';

function postulantes(): ConductorPostulante[] {
  return [
    {
      idConductor: 1,
      nombre: 'Camilo Rojas',
      correo: 'c@t.co',
      estadoAprobacion: 'Pendiente',
      documentos: [
        { tipo: 'Cédula', urlArchivo: 'https://x/c.jpg' },
        { tipo: 'SOAT', urlArchivo: 'https://x/s.pdf' },
      ],
    },
    {
      idConductor: 2,
      nombre: 'Luz Quintero',
      correo: 'l@t.co',
      estadoAprobacion: 'Pendiente',
      documentos: [],
    },
  ];
}

describe('CU-011 ConductoresPage', () => {
  function puertos() {
    return {
      lista: { listarPendientes: vi.fn(async () => postulantes()) },
      aprobacion: {
        decidir: vi.fn(async (id: number, aprobado: boolean) => ({
          ...postulantes()[0],
          idConductor: id,
          estadoAprobacion: aprobado ? 'Aprobado' : 'Rechazado',
        })),
      },
    };
  }

  async function montarPagina(p = puertos()) {
    const r = await montar(ConductoresPage, {
      usuario: ADMIN,
      providers: [
        { provide: DriverApplicantsPort, useValue: p.lista },
        { provide: ApprovalPort, useValue: p.aprobacion },
      ],
    });
    await r.estable();
    return { ...r, p };
  }

  const fila = (el: HTMLElement, nombre: string) =>
    Array.from(el.querySelectorAll('tbody tr')).find((t) =>
      t.textContent?.includes(nombre),
    ) as HTMLElement;

  it('debería listar postulantes con miniaturas y abrir el visor de imagen o PDF', async () => {
    const { el, estable } = await montarPagina();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(fila(el, 'Luz').textContent).toContain('Sin documentos');
    q<HTMLButtonElement>(el, '[aria-label="Ver Cédula de Camilo Rojas"]').click();
    await estable();
    expect(q<HTMLImageElement>(el, '[role="dialog"] img').alt).toBe('Cédula de Camilo Rojas');
    botonPorTexto(q(el, '[role="dialog"]'), '✕').click();
    await estable();
    q<HTMLButtonElement>(el, '[aria-label="Ver SOAT de Camilo Rojas"]').click();
    await estable();
    expect(q<HTMLAnchorElement>(el, '[role="dialog"] a').href).toBe('https://x/s.pdf');
  });

  it('Dado que apruebo, entonces el estado pasa a Aprobado y la fila sale de pendientes', async () => {
    const { el, p, estable } = await montarPagina();
    botonPorTexto(fila(el, 'Camilo'), 'Aprobar').click();
    await estable();
    botonPorTexto(q(el, '[role="dialog"]'), 'Aprobar').click();
    await estable();
    expect(p.aprobacion.decidir).toHaveBeenCalledWith(1, true, undefined);
    expect(fila(el, 'Camilo')).toBeUndefined();
  });

  it('Dado que rechazo, entonces exige un motivo que verá el conductor y pasa a Rechazado', async () => {
    const { el, p, estable } = await montarPagina();
    botonPorTexto(fila(el, 'Luz'), 'Rechazar').click();
    await estable();
    const dialogo = q(el, '[role="dialog"]');
    expect(dialogo.textContent).toContain('El conductor lo verá en su perfil');
    botonPorTexto(dialogo, 'Rechazar').click();
    await estable();
    expect(dialogo.textContent).toContain('Escribe el motivo del rechazo.');
    expect(p.aprobacion.decidir).not.toHaveBeenCalled();
    escribir(q(el, '#motivo'), 'SOAT vencido');
    await estable();
    botonPorTexto(q(el, '[role="dialog"]'), 'Rechazar').click();
    await estable();
    expect(p.aprobacion.decidir).toHaveBeenCalledWith(2, false, 'SOAT vencido');
    expect(fila(el, 'Luz').textContent).toContain('Rechazado');
  });

  it('Dado que ya estaba aprobado, entonces informa y refresca', async () => {
    const p = puertos();
    p.aprobacion.decidir.mockImplementation(
      rechaza(new ApiError(400, 'Este conductor ya ha sido aprobado previamente')),
    );
    const { el, estable } = await montarPagina(p);
    p.lista.listarPendientes.mockImplementation(async () => [postulantes()[1]]);
    const toast = vi.spyOn(TestBed.inject(ToastService), 'mostrar');
    botonPorTexto(fila(el, 'Camilo'), 'Aprobar').click();
    await estable();
    botonPorTexto(q(el, '[role="dialog"]'), 'Aprobar').click();
    await estable();
    expect(toast).toHaveBeenCalledWith('Este conductor ya estaba aprobado.');
    expect(p.lista.listarPendientes).toHaveBeenCalledTimes(2);
    expect(fila(el, 'Camilo')).toBeUndefined();
  });

  it('debería explicar un 404 al decidir', async () => {
    const p = puertos();
    p.aprobacion.decidir.mockImplementation(
      rechaza(new ApiError(404, 'No existe el conductor con id 1')),
    );
    const { el, estable } = await montarPagina(p);
    botonPorTexto(fila(el, 'Camilo'), 'Aprobar').click();
    await estable();
    botonPorTexto(q(el, '[role="dialog"]'), 'Aprobar').click();
    await estable();
    expect(q(el, '[role="dialog"] [role="alert"]').textContent).toContain('ya no existe');
  });

  it('debería mostrar el motivo de un rechazo previo', async () => {
    const p = puertos();
    p.lista.listarPendientes.mockImplementation(async () => [
      { ...postulantes()[1], estadoAprobacion: 'Rechazado', motivoRechazo: 'SOAT vencido' },
    ]);
    const { el } = await montarPagina(p);
    expect(fila(el, 'Luz').textContent).toContain('Motivo: SOAT vencido');
  });

  it('debería mostrar otros errores, vacío y error de carga', async () => {
    const p = puertos();
    p.aprobacion.decidir.mockImplementation(rechaza(new ApiError(500, 'x')));
    const { el, estable } = await montarPagina(p);
    botonPorTexto(fila(el, 'Camilo'), 'Aprobar').click();
    await estable();
    botonPorTexto(q(el, '[role="dialog"]'), 'Aprobar').click();
    await estable();
    expect(q(el, '[role="dialog"]').textContent).toContain('Algo salió mal');
    botonPorTexto(q(el, '[role="dialog"]'), 'Cancelar').click();
    p.lista.listarPendientes.mockImplementation(rechaza(new ApiError(500, 'x')));
    botonPorTexto(el, 'Refrescar').click();
    await estable();
    expect(q(el, '[role="alert"]').textContent).toContain('Algo salió mal');
    p.lista.listarPendientes.mockImplementation(async () => []);
    botonPorTexto(el, 'Reintentar').click();
    await estable();
    expect(el.textContent).toContain('No hay conductores esperando aprobación.');
  });

  it('esPdf reconoce PDF con query o hash', () => {
    expect(esPdf('a.pdf')).toBe(true);
    expect(esPdf('a.PDF?x=1')).toBe(true);
    expect(esPdf('a.jpg')).toBe(false);
  });
});

describe('E7-HU2 DashboardPage', () => {
  it('debería mostrar KPI y gráficos, y Reintentar ante error', async () => {
    const m = new FakeAdminMetrics();
    const metricas = vi.fn<() => Promise<unknown>>(rechaza(new ApiError(500, 'x')));
    const { el, estable } = await montar(DashboardPage, {
      usuario: ADMIN,
      providers: [{ provide: AdminMetricsPort, useValue: { metricas, auditoria: vi.fn() } }],
    });
    await estable();
    expect(q(el, '[role="alert"]')).toBeTruthy();
    metricas.mockImplementation(() => m.metricas());
    botonPorTexto(el, 'Reintentar').click();
    await new Promise((r) => setTimeout(r, 200));
    await estable();
    const texto = el.textContent?.replace(/\s/g, ' ') ?? '';
    expect(texto).toContain('Envíos totales');
    expect(texto).toContain('248');
    expect(texto).toContain('$ 4.862.000');
    expect(texto).not.toContain('Datos de ejemplo');
    expect(el.querySelectorAll('#titulo-zona + ul li')).toHaveLength(5);
  });
});

describe('E7-HU2 AuditoriaPage', () => {
  async function montarAuditoria() {
    const m = new FakeAdminMetrics();
    const auditoria = vi.fn((f: Parameters<FakeAdminMetrics['auditoria']>[0]) => m.auditoria(f));
    const r = await montar(AuditoriaPage, {
      usuario: ADMIN,
      providers: [{ provide: AdminMetricsPort, useValue: { metricas: vi.fn(), auditoria } }],
    });
    const esperar = async () => {
      await new Promise((res) => setTimeout(res, 200));
      await r.estable();
    };
    await esperar();
    return { ...r, auditoria, esperar };
  }

  it('debería paginar de 15 en 15', async () => {
    const { el, auditoria, esperar } = await montarAuditoria();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(TAMANO_PAGINA);
    expect(el.textContent).toContain('64 registros · página 1 de 5');
    expect(botonPorTexto(el, 'Anterior').disabled).toBe(true);
    botonPorTexto(el, 'Siguiente').click();
    await esperar();
    expect(auditoria).toHaveBeenLastCalledWith({
      texto: undefined,
      accion: undefined,
      pagina: 2,
      tamano: 15,
    });
    expect(el.textContent).toContain('página 2 de 5');
  });

  it('debería filtrar por texto y acción, y mostrar vacío', async () => {
    const { el, auditoria, esperar } = await montarAuditoria();
    escribir(q(el, '#texto'), 'zzz-nada');
    botonPorTexto(el, 'Filtrar').click();
    await esperar();
    expect(el.textContent).toContain('Ningún registro coincide');
    escribir(q(el, '#texto'), '');
    elegir(q(el, '#accion'), 2);
    await esperar();
    expect(auditoria).toHaveBeenLastCalledWith(
      expect.objectContaining({ accion: 'Envío creado', pagina: 1 }),
    );
  });

  it('debería exportar a CSV todos los registros del filtro', async () => {
    const { el, auditoria, esperar } = await montarAuditoria();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    botonPorTexto(el, 'Exportar CSV').click();
    await esperar();
    expect(auditoria).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 1, tamano: 64 }));
    expect(click).toHaveBeenCalled();
  });

  it('debería mostrar error si falla la carga', async () => {
    const { el, auditoria, esperar } = await montarAuditoria();
    auditoria.mockImplementation(rechaza(new ApiError(500, 'x')));
    botonPorTexto(el, 'Siguiente').click();
    await esperar();
    expect(q(el, '[role="alert"]')).toBeTruthy();
    botonPorTexto(el, 'Exportar CSV');
  });
});
