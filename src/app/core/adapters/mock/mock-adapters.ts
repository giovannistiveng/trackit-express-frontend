import { Injectable, inject } from '@angular/core';
import {
  ConductorPostulante,
  Envio,
  FiltroAuditoria,
  MetricasAdmin,
  Pagina,
  PerfilConductor,
  RegistroAuditoria,
  Ubicacion,
  Usuario,
  Zona,
} from '../../domain';
import {
  AdminMetricsPort,
  ClientShipmentsPort,
  DriverApplicantsPort,
  DriverBoardPort,
  DriverProfilePort,
  EvidenceStoragePort,
  LocationTransportPort,
  RouteStartPort,
  ZonesPort,
} from '../../ports';
import { APP_CONFIG } from '../../config/app-config';
import { ApiError } from '../../http/api-error';
import {
  METRICAS_SEMILLA,
  ZONAS_SEMBRADAS,
  auditoriaSemilla,
  postulantesSemilla,
} from './seed-data';

/** Pausa breve para que el modo demo se sienta como una red real. */
const pausa = (ms = 150) => new Promise<void>((r) => setTimeout(r, ms));

function envioDemo(id: number, parcial: Partial<Envio> = {}): Envio {
  const fecha = new Date(Date.now() - id * 60_000);
  return {
    id,
    origen: 'Casco Urbano',
    destino: 'Silvania',
    tipoCarga: 'Documentos',
    tarifa: 39500,
    estado: 'Pendiente',
    idCliente: 1,
    idConductor: null,
    idZona: 1,
    historial: [{ estado: 'Pendiente', fecha }],
    fechaUltimoCambio: fecha,
    ...parcial,
  };
}

@Injectable({ providedIn: 'root' })
export class MockZonesAdapter implements ZonesPort {
  async listar(): Promise<Zona[]> {
    await pausa(50);
    return ZONAS_SEMBRADAS.map((z) => ({ ...z }));
  }
}

@Injectable({ providedIn: 'root' })
export class MockDriverProfileAdapter implements DriverProfilePort {
  async obtener(usuario: Usuario): Promise<PerfilConductor> {
    await pausa(50);
    return { idConductor: usuario.id, estadoAprobacion: 'Aprobado' };
  }
}

@Injectable({ providedIn: 'root' })
export class MockClientShipmentsAdapter implements ClientShipmentsPort {
  private readonly envios = new Map<number, Envio[]>();

  async listar(idCliente: number): Promise<Envio[]> {
    await pausa();
    return [...(this.envios.get(idCliente) ?? [])].sort((a, b) => b.id - a.id);
  }

  async recordar(idCliente: number, idEnvio: number): Promise<void> {
    const lista = this.envios.get(idCliente) ?? [];
    if (!lista.some((e) => e.id === idEnvio)) lista.push(envioDemo(idEnvio, { idCliente }));
    this.envios.set(idCliente, lista);
  }
}

@Injectable({ providedIn: 'root' })
export class MockDriverBoardAdapter implements DriverBoardPort {
  async disponibles(): Promise<Envio[]> {
    await pausa();
    return [
      envioDemo(103, {
        origen: 'Vereda Pekín, finca El Recreo',
        destino: 'Casco Urbano, Cra. 6 #8-20',
        tarifa: 14500,
        tipoCarga: 'Mercancía General',
      }),
      envioDemo(102, {
        origen: 'Parque principal',
        destino: 'Pasca, plaza',
        tarifa: 51000,
        tipoCarga: 'Carga Pesada',
        idZona: 5,
      }),
      envioDemo(101),
    ];
  }
}

@Injectable({ providedIn: 'root' })
export class MockRouteStartAdapter implements RouteStartPort {
  async iniciar(idEnvio: number): Promise<Envio> {
    await pausa();
    return envioDemo(idEnvio, {
      estado: 'En Ruta',
      idConductor: 1,
      historial: [
        { estado: 'Pendiente', fecha: new Date(Date.now() - 120_000) },
        { estado: 'Asignado', fecha: new Date(Date.now() - 60_000) },
        { estado: 'En Ruta', fecha: new Date() },
      ],
    });
  }
}

@Injectable({ providedIn: 'root' })
export class MockDriverApplicantsAdapter implements DriverApplicantsPort {
  private readonly demo = inject(APP_CONFIG).demo;
  private readonly lista = postulantesSemilla(this.demo.conductores[0]?.idConductor);

  async listarPendientes(): Promise<ConductorPostulante[]> {
    await pausa();
    return this.lista
      .filter((p) => p.estadoAprobacion !== 'Aprobado')
      .map((p) => ({ ...p, documentos: [...p.documentos] }));
  }
}

/** Brecha 7 sin Cloudinary configurado: genera una URL simulada (el backend solo guarda el texto). */
@Injectable({ providedIn: 'root' })
export class MockEvidenceAdapter implements EvidenceStoragePort {
  async subir(idEnvio: number, foto: File): Promise<string> {
    await pausa(300);
    const ext = foto.type === 'image/png' ? 'png' : 'jpg';
    return `https://demo.trackit.local/evidencias/envio-${idEnvio}-${Date.now()}.${ext}`;
  }
}

/** Ubicación en memoria (útil para probar la cola sin backend). */
@Injectable({ providedIn: 'root' })
export class MockLocationAdapter implements LocationTransportPort {
  private readonly ultimas = new Map<number, Ubicacion>();
  /** En pruebas: fuerza fallos de red. */
  fallar = false;

  async enviar(idEnvio: number, u: Ubicacion): Promise<void> {
    if (this.fallar) throw new ApiError(0, 'Sin conexión', 'SIN_CONEXION');
    this.ultimas.set(idEnvio, u);
  }

  async ultima(idEnvio: number): Promise<Ubicacion | null> {
    return this.ultimas.get(idEnvio) ?? null;
  }
}

@Injectable({ providedIn: 'root' })
export class MockAdminMetricsAdapter implements AdminMetricsPort {
  private readonly registros = auditoriaSemilla();

  async metricas(): Promise<MetricasAdmin> {
    await pausa();
    return structuredClone(METRICAS_SEMILLA);
  }

  async auditoria(f: FiltroAuditoria): Promise<Pagina<RegistroAuditoria>> {
    await pausa();
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
