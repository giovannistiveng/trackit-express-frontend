import {
  ConductorPostulante,
  EstadoEnvio,
  MetricasAdmin,
  RegistroAuditoria,
  Zona,
} from '../../domain';

/** Zonas creadas por database/seed.sql en una base limpia. */
export const ZONAS_SEMBRADAS: Zona[] = [
  { id: 1, nombre: 'Casco Urbano', tarifaBase: 5000 },
  { id: 2, nombre: 'Vereda Pekín', tarifaBase: 8000 },
  { id: 3, nombre: 'Vereda Novillero', tarifaBase: 9000 },
  { id: 4, nombre: 'Silvania', tarifaBase: 12000 },
  { id: 5, nombre: 'Pasca', tarifaBase: 12000 },
];

export const LUGARES_FRECUENTES = [
  'Casco Urbano',
  'Vereda Pekín',
  'Vereda Novillero',
  'Silvania',
  'Pasca',
  'Bogotá',
];

/** Postulantes simulados (brecha 6). El primero usa el id del conductor demo para poder aprobarlo de verdad. */
export function postulantesSemilla(idDemo: number | undefined): ConductorPostulante[] {
  const doc = (n: string) => `https://res.cloudinary.com/demo/image/upload/sample.jpg#${n}`;
  return [
    {
      idConductor: idDemo ?? 1,
      nombre: 'Camilo Andrés Rojas Pérez',
      correo: 'camilo.rojas@correo.co',
      estadoAprobacion: 'Pendiente',
      documentos: [
        { tipo: 'Cédula', urlArchivo: doc('cedula') },
        { tipo: 'SOAT', urlArchivo: doc('soat') },
        { tipo: 'Licencia', urlArchivo: doc('licencia') },
      ],
    },
    {
      idConductor: 902,
      nombre: 'Luz Marina Quintero',
      correo: 'luzma.quintero@correo.co',
      estadoAprobacion: 'Pendiente',
      documentos: [
        { tipo: 'Cédula', urlArchivo: doc('cedula-2') },
        { tipo: 'Licencia', urlArchivo: 'https://example.org/licencia-luz.pdf' },
      ],
    },
    {
      idConductor: 903,
      nombre: 'Jhon Fredy Castañeda',
      correo: 'jhonf.castaneda@correo.co',
      estadoAprobacion: 'Rechazado',
      documentos: [{ tipo: 'SOAT', urlArchivo: doc('soat-3') }],
    },
  ];
}

export const METRICAS_SEMILLA: MetricasAdmin = {
  enviosTotales: 248,
  enviosActivos: 17,
  entregados: 231,
  ingresosCop: 4_862_000,
  conductoresAprobados: 14,
  conductoresPendientes: 3,
  calificacionPromedio: 4.6,
  porZona: [
    { zona: 'Casco Urbano', envios: 121 },
    { zona: 'Vereda Pekín', envios: 38 },
    { zona: 'Vereda Novillero', envios: 27 },
    { zona: 'Silvania', envios: 41 },
    { zona: 'Pasca', envios: 21 },
  ],
  porEstado: (
    [
      ['Pendiente', 6],
      ['Asignado', 5],
      ['En Ruta', 6],
      ['Entregado', 231],
    ] as [EstadoEnvio, number][]
  ).map(([estado, envios]) => ({ estado, envios })),
};

const ACCIONES = [
  'Inicio de sesión',
  'Envío creado',
  'Servicio aceptado',
  'Entrega validada',
  'Conductor aprobado',
  'Calificación',
];
const USUARIOS = [
  'admin@trackit.com.co',
  'ana.gomez@correo.co',
  'camilo.rojas@correo.co',
  'luzma.quintero@correo.co',
];

export function auditoriaSemilla(base = new Date('2026-10-29T15:00:00Z')): RegistroAuditoria[] {
  return Array.from({ length: 64 }, (_, i) => {
    const accion = ACCIONES[i % ACCIONES.length];
    return {
      id: 64 - i,
      fecha: new Date(base.getTime() - i * 47 * 60_000),
      usuario: USUARIOS[(i * 7) % USUARIOS.length],
      accion,
      entidad: accion.includes('Conductor')
        ? 'Conductor'
        : accion === 'Inicio de sesión'
          ? 'Usuario'
          : 'Envío',
      detalle:
        accion === 'Inicio de sesión'
          ? 'Acceso desde navegador móvil'
          : `Registro #${200 + ((i * 13) % 50)}`,
    };
  });
}
