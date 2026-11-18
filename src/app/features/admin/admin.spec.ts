import { TestBed } from '@angular/core/testing';
import { botonPorTexto, elegir, escribir, q, rechaza } from '../../../testing/fakes';
import { ADMIN } from '../../../testing/fixtures';
import { montar } from '../../../testing/pantallas';
import { ApiError } from '../../core/http/api-error';
import { ConductorPostulante, Requisito } from '../../core/domain';
import { AdminMetricsPort, ApprovalPort, DriverApplicantsPort } from '../../core/ports';
import { FakeAdminMetrics } from '../../../testing/admin-fake';
import { ToastService } from '../../shared/ui/toast.service';
import { AuditoriaPage, TAMANO_PAGINA } from './auditoria.page';
import { ConductoresPage, esPdf } from './conductores.page';
import { DashboardPage } from './dashboard.page';

const REQ = (r: Partial<Requisito> & Pick<Requisito, 'tipo' | 'estado'>): Requisito => ({
  nombre: r.tipo,
  ayuda: '',
  obligatorio: true,
  vence: false,
  verificar: null,
  documento: null,
  ...r,
});

function postulantes(): ConductorPostulante[] {
  return [
    {
      idConductor: 1,
      nombre: 'Camilo Rojas',
      correo: 'c@t.co',
      estadoAprobacion: 'Pendiente',
      vehiculo: { placa: 'ABC12D', categoria: 'Moto Express' },
      documentos: [
        { id: 11, tipo: 'Cédula', urlArchivo: 'https://x/c.jpg' },
        { id: 12, tipo: 'SOAT', urlArchivo: 'https://x/s.pdf' },
      ],
      requisitos: {
        completo: true,
        pendientes: [],
        items: [
          REQ({
            tipo: 'Cédula',
            estado: 'aprobado',
            documento: {
              id: 11,
              tipo: 'Cédula',
              urlArchivo: 'https://x/c.jpg',
              estado: 'Aprobado',
            },
          }),
          REQ({
            tipo: 'SOAT',
            estado: 'aprobado',
            vence: true,
            verificar: { fuente: 'RUNT', url: 'https://www.runt.gov.co' },
            documento: {
              id: 12,
              tipo: 'SOAT',
              urlArchivo: 'https://x/s.pdf',
              estado: 'Aprobado',
              fechaVencimiento: '2027-03-01',
              diasParaVencer: 200,
            },
          }),
        ],
      },
      consultas: [{ fuente: 'Procuraduría', url: 'https://apps.procuraduria.gov.co' }],
    },
    {
      idConductor: 2,
      nombre: 'Luz Quintero',
      correo: 'l@t.co',
      estadoAprobacion: 'Pendiente',
      vehiculo: null,
      documentos: [{ id: 21, tipo: 'Licencia', urlArchivo: 'https://x/l.jpg' }],
      requisitos: {
        completo: false,
        pendientes: ['Licencia en revisión', 'Falta Cédula'],
        items: [
          REQ({ tipo: 'Cédula', estado: 'falta' }),
          REQ({
            tipo: 'Licencia',
            estado: 'pendiente',
            vence: true,
            documento: {
              id: 21,
              tipo: 'Licencia',
              urlArchivo: 'https://x/l.jpg',
              estado: 'Pendiente',
              fechaVencimiento: '2026-12-01',
              diasParaVencer: 10,
            },
          }),
          REQ({ tipo: 'Tecnomecánica', estado: 'falta', obligatorio: false }),
        ],
      },
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
        revisarDocumento: vi.fn(async () => undefined),
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

  const tarjeta = (el: HTMLElement, nombre: string) =>
    Array.from(el.querySelectorAll('ul.space-y-5 > li')).find((t) =>
      t.textContent?.includes(nombre),
    ) as HTMLElement;
  const texto = (n: Element) => n.textContent?.replace(/\s+/g, ' ') ?? '';

  it('lista cada conductor con su vehículo, avance y requisitos con la fuente oficial', async () => {
    const { el } = await montarPagina();
    expect(el.querySelectorAll('ul.space-y-5 > li')).toHaveLength(2);
    const camilo = texto(tarjeta(el, 'Camilo'));
    expect(camilo).toContain('ABC12D');
    expect(camilo).toContain('2/2');
    expect(camilo).toContain('RUNT');
    expect(camilo).toContain('Procuraduría');
    const luz = texto(tarjeta(el, 'Luz'));
    expect(luz).toContain('Sin vehículo registrado');
    expect(luz).toContain('0/2');
    expect(luz).toContain('No lo ha subido.');
    expect(luz).toContain('No aplica o no lo ha subido.');
    expect(luz).toContain('Vence el 2026-12-01 (en 10 días)');
    expect(luz).toContain('Falta: Licencia en revisión; Falta Cédula');
    expect(
      botonPorTexto(tarjeta(el, 'Luz'), 'Aprobar conductor') as HTMLButtonElement,
    ).toHaveProperty('disabled', true);
  });

  it('revisa un documento: exige motivo para rechazar y aprueba con la fecha corregida', async () => {
    const { el, p, estable } = await montarPagina();
    botonPorTexto(tarjeta(el, 'Luz'), 'Revisar').click();
    await estable();
    const dialogo = q(el, '[role="dialog"]');
    expect(q<HTMLImageElement>(dialogo, 'img').alt).toBe('Licencia de Luz Quintero');
    botonPorTexto(dialogo, 'Rechazar documento').click();
    await estable();
    expect(q(dialogo, '[role="alert"]').textContent).toContain('Escribe el motivo');
    expect(p.aprobacion.revisarDocumento).not.toHaveBeenCalled();
    escribir(q(el, '#rev-vence'), '2027-01-15');
    await estable();
    botonPorTexto(q(el, '[role="dialog"]'), 'Aprobar documento').click();
    await estable();
    expect(p.aprobacion.revisarDocumento).toHaveBeenCalledWith(21, true, {
      motivo: '',
      fechaVencimiento: '2027-01-15',
    });
    expect(p.lista.listarPendientes).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it('rechaza un documento con motivo y muestra el error del backend', async () => {
    const p = puertos();
    p.aprobacion.revisarDocumento.mockImplementationOnce(rechaza(new ApiError(500, 'x')));
    const { el, estable } = await montarPagina(p);
    q<HTMLButtonElement>(el, '[aria-label="Revisar SOAT de Camilo Rojas"]').click();
    await estable();
    expect(q<HTMLAnchorElement>(el, '[role="dialog"] a').href).toBe('https://x/s.pdf');
    expect(texto(q(el, '[role="dialog"]'))).toContain('Compara los datos con RUNT');
    escribir(q(el, '#rev-motivo'), 'Póliza de otra placa');
    await estable();
    botonPorTexto(q(el, '[role="dialog"]'), 'Rechazar documento').click();
    await estable();
    expect(q(el, '[role="dialog"] [role="alert"]').textContent).toContain('Algo salió mal');
    botonPorTexto(q(el, '[role="dialog"]'), 'Rechazar documento').click();
    await estable();
    expect(p.aprobacion.revisarDocumento).toHaveBeenLastCalledWith(12, false, {
      motivo: 'Póliza de otra placa',
      fechaVencimiento: '2027-03-01',
    });
  });

  it('Dado que apruebo, entonces el estado pasa a Aprobado y sale de la lista', async () => {
    const { el, p, estable } = await montarPagina();
    botonPorTexto(tarjeta(el, 'Camilo'), 'Aprobar conductor').click();
    await estable();
    botonPorTexto(q(el, '[role="dialog"]'), 'Aprobar').click();
    await estable();
    expect(p.aprobacion.decidir).toHaveBeenCalledWith(1, true, undefined);
    expect(tarjeta(el, 'Camilo')).toBeUndefined();
  });

  it('Dado que rechazo, entonces exige un motivo que verá el conductor y pasa a Rechazado', async () => {
    const { el, p, estable } = await montarPagina();
    botonPorTexto(tarjeta(el, 'Luz'), 'Rechazar').click();
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
    expect(tarjeta(el, 'Luz').textContent).toContain('Rechazado');
  });

  it('Dado que ya estaba aprobado, entonces informa y refresca', async () => {
    const p = puertos();
    p.aprobacion.decidir.mockImplementation(
      rechaza(new ApiError(400, 'Este conductor ya ha sido aprobado previamente')),
    );
    const { el, estable } = await montarPagina(p);
    p.lista.listarPendientes.mockImplementation(async () => [postulantes()[1]]);
    const toast = vi.spyOn(TestBed.inject(ToastService), 'mostrar');
    botonPorTexto(tarjeta(el, 'Camilo'), 'Aprobar conductor').click();
    await estable();
    botonPorTexto(q(el, '[role="dialog"]'), 'Aprobar').click();
    await estable();
    expect(toast).toHaveBeenCalledWith('Este conductor ya estaba aprobado.');
    expect(p.lista.listarPendientes).toHaveBeenCalledTimes(2);
    expect(tarjeta(el, 'Camilo')).toBeUndefined();
  });

  it('debería explicar un 404 al decidir', async () => {
    const p = puertos();
    p.aprobacion.decidir.mockImplementation(
      rechaza(new ApiError(404, 'No existe el conductor con id 1')),
    );
    const { el, estable } = await montarPagina(p);
    botonPorTexto(tarjeta(el, 'Camilo'), 'Aprobar conductor').click();
    await estable();
    botonPorTexto(q(el, '[role="dialog"]'), 'Aprobar').click();
    await estable();
    expect(q(el, '[role="dialog"] [role="alert"]').textContent).toContain('ya no existe');
  });

  it('con un backend anterior arma los requisitos con los documentos y muestra el motivo previo', async () => {
    const p = puertos();
    p.lista.listarPendientes.mockImplementation(async () => [
      {
        ...postulantes()[1],
        requisitos: undefined,
        estadoAprobacion: 'Rechazado',
        motivoRechazo: 'SOAT vencido',
      },
    ]);
    const { el } = await montarPagina(p);
    const luz = texto(tarjeta(el, 'Luz'));
    expect(luz).toContain('Motivo: SOAT vencido');
    expect(luz).toContain('Por revisar');
  });

  it('debería mostrar otros errores, vacío y error de carga', async () => {
    const p = puertos();
    p.aprobacion.decidir.mockImplementation(rechaza(new ApiError(500, 'x')));
    const { el, estable } = await montarPagina(p);
    botonPorTexto(tarjeta(el, 'Camilo'), 'Aprobar conductor').click();
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
    expect(el.textContent).toContain('No hay conductores ni documentos esperando revisión.');
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
