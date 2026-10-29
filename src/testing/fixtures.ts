import { CambioEstado, Envio, EstadoEnvio, Usuario } from '../app/core/domain';
import { ApiEnvio } from '../app/core/adapters/http/backend.types';

/** Respuestas reales del backend (Apéndice A del prompt maestro). */
export const API = {
  registro: {
    message: 'Usuario registrado exitosamente',
    user: { id: 1, correo: 'cli@t.co', nombre: 'Cli' },
  },
  login: (token: string) => ({
    message: 'Inicio de sesión exitoso',
    user: { id: 1, nombre: 'Cli', correo: 'cli@t.co', rol: '2' },
    token,
  }),
  cotizar: {
    message: 'Tarifa calculada exitosamente',
    distancia_km: 34.5,
    tarifa_base: 5000,
    tarifa_total: 39500,
    moneda: 'COP',
  },
  crear: {
    message: 'Solicitud de envío creada exitosamente',
    envio: {
      id_envio: 2,
      origen: 'Casco Urbano',
      destino: 'Silvania',
      tipo_carga: 'Documentos',
      tarifa: 39500,
      pin_seguridad: '6175',
      estado: 'Pendiente',
      id_cliente: 1,
      id_zona: 1,
    },
  },
  aceptar: {
    message: 'Servicio asignado exitosamente',
    envio: {
      id_envio: 1,
      origen: 'Casco Urbano',
      destino: 'Silvania',
      tipo_carga: 'Documentos',
      tarifa: 5000,
      pin_seguridad: '6647',
      estado: 'Asignado',
      id_cliente: 1,
      id_conductor: 1,
      id_zona: 1,
    },
  },
  validar: {
    message: 'Validación de entrega exitosa',
    envio: {
      id_envio: 1,
      estado: 'Entregado',
      origen: 'Casco Urbano',
      destino: 'Silvania',
      url_foto: 'https://x/y.jpg',
    },
  },
  calificar: {
    message: 'Calificación registrada exitosamente',
    envio: { id_envio: 1, calificacion: 4.5, estado: 'Entregado' },
  },
  trazabilidad: {
    message: 'Trazabilidad del envío',
    envio: {
      id_envio: 1,
      origen: 'Casco Urbano',
      destino: 'Silvania',
      tipo_carga: 'Documentos',
      tarifa: 5000,
      pin_seguridad: '6647',
      estado: 'Entregado',
      id_cliente: 1,
      id_conductor: 1,
      id_zona: 1,
      ultimo_cambio_estado: 'Entregado',
      fecha_ultimo_cambio: '2026-10-29T07:03:31.748Z',
      historial_estado: [
        { estado: 'Entregado', fecha: '2026-10-29T07:03:31.748Z' },
        { estado: 'Asignado', fecha: '2026-10-29T07:03:31.710Z' },
        { estado: 'Pendiente', fecha: '2026-10-29T07:03:31.612Z' },
      ],
    } satisfies ApiEnvio,
  },
  aprobar: {
    message: 'Conductor aprobado exitosamente',
    driver: { id_conductor: 1, nombre: 'Con', correo: 'con@t.co', estado_aprobacion: 'Aprobado' },
  },
  errores: {
    pin: { error: 'PIN incorrecto' },
    calificado: { error: 'Este envío ya fue calificado' },
    aprobado: { error: 'Este conductor ya ha sido aprobado previamente' },
    evidencia: { error: 'La evidencia fotográfica (url_foto) es obligatoria' },
    envio404: { error: 'No existe el envío con id 99' },
    conductor404: { error: 'No existe el conductor con id 77' },
    correo: { error: 'El correo ya está registrado', statusCode: 400 },
  },
};

export function apiEnvio(parcial: Partial<ApiEnvio> = {}): ApiEnvio {
  return { ...API.trazabilidad.envio, ...parcial };
}

export function buildEnvio(parcial: Partial<Envio> & { estado?: EstadoEnvio } = {}): Envio {
  const estado = parcial.estado ?? 'Pendiente';
  const orden: EstadoEnvio[] = ['Pendiente', 'Asignado', 'En Ruta', 'Entregado'];
  const base = new Date('2026-10-29T07:00:00Z').getTime();
  const historial: CambioEstado[] = orden
    .slice(0, orden.indexOf(estado) + 1)
    .map((e, i) => ({ estado: e, fecha: new Date(base + i * 60_000) }));
  return {
    id: 1,
    origen: 'Casco Urbano',
    destino: 'Silvania',
    tipoCarga: 'Documentos',
    tarifa: 39500,
    idCliente: 1,
    idConductor: estado === 'Pendiente' ? null : 1,
    idZona: 1,
    pin: '6647',
    historial,
    fechaUltimoCambio: historial.at(-1)?.fecha,
    ...parcial,
    estado,
  };
}

export const CLIENTE: Usuario = { id: 1, nombre: 'Cli', correo: 'cli@t.co', rol: '2' };
export const CONDUCTOR: Usuario = { id: 2, nombre: 'Con', correo: 'con@t.co', rol: '3' };
export const ADMIN: Usuario = { id: 9, nombre: 'Adm', correo: 'adm@t.co', rol: '1' };

/** JWT sin firma válida (el frontend solo lee exp). */
export function crearJwt(expSegundos: number, payload: Record<string, unknown> = {}): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ userId: 1, role: '2', exp: expSegundos, ...payload })}.firma`;
}

export function jwtVigente(): string {
  return crearJwt(Math.floor(Date.now() / 1000) + 3600);
}
