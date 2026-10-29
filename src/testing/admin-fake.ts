import { FiltroAuditoria, MetricasAdmin, Pagina, RegistroAuditoria } from '../app/core/domain';
import { AdminMetricsPort } from '../app/core/ports';

export const METRICAS_PRUEBA: MetricasAdmin = {
  enviosTotales: 248,
  enviosActivos: 12,
  entregados: 230,
  cancelados: 6,
  ingresosCop: 4_862_000,
  conductoresAprobados: 18,
  conductoresPendientes: 3,
  calificacionPromedio: 4.6,
  porZona: [
    { zona: 'Casco Urbano', envios: 120 },
    { zona: 'Vereda Pekín', envios: 40 },
    { zona: 'Vereda Novillero', envios: 30 },
    { zona: 'Silvania', envios: 38 },
    { zona: 'Pasca', envios: 20 },
  ],
  porEstado: [
    { estado: 'Pendiente', envios: 4 },
    { estado: 'Asignado', envios: 5 },
    { estado: 'En Ruta', envios: 3 },
    { estado: 'Entregado', envios: 230 },
    { estado: 'Cancelado', envios: 6 },
  ],
};

const ACCIONES = ['Inicio de sesión', 'Envío creado', 'Servicio aceptado', 'Entrega validada'];

/** Doble en memoria del puerto de administración: 64 registros de auditoría. */
export class FakeAdminMetrics implements AdminMetricsPort {
  readonly registros: RegistroAuditoria[] = Array.from({ length: 64 }, (_, i) => ({
    id: i + 1,
    fecha: new Date(Date.UTC(2026, 9, 29, 12, 0) - i * 60_000),
    usuario: `usuario${i % 5}@t.co`,
    accion: ACCIONES[i % ACCIONES.length],
    entidad: 'Envío',
    detalle: `Detalle ${i + 1}`,
  }));

  async metricas(): Promise<MetricasAdmin> {
    return structuredClone(METRICAS_PRUEBA);
  }

  async auditoria(f: FiltroAuditoria): Promise<Pagina<RegistroAuditoria>> {
    const texto = f.texto?.trim().toLowerCase();
    const filtrados = this.registros.filter(
      (r) =>
        (!f.accion || r.accion === f.accion) &&
        (!texto ||
          `${r.usuario} ${r.accion} ${r.entidad} ${r.detalle}`.toLowerCase().includes(texto)),
    );
    const inicio = (f.pagina - 1) * f.tamano;
    return {
      items: filtrados.slice(inicio, inicio + f.tamano),
      total: filtrados.length,
      pagina: f.pagina,
      tamano: f.tamano,
    };
  }
}
