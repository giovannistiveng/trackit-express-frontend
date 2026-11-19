import { randomInt } from 'node:crypto';
import { APIRequestContext, Page, expect, request } from '@playwright/test';

/**
 * Ayudantes para preparar datos por la API (más rápido y estable que hacerlo por la interfaz)
 * y para iniciar sesión en el navegador. Cada prueba crea sus propios usuarios con correos únicos,
 * así las pruebas no dependen unas de otras ni del orden en que corren.
 */
export const API = 'http://localhost:3300/api';
export const CLAVE = 'Prueba2026A';
export const ADMIN = { correo: 'admin@trackit.com.co', clave: 'Admin2026*' };

/** Imagen JPEG mínima (el backend revisa la firma del archivo). */
export const JPG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9,
]);

/** Parque principal de Fusagasugá y un destino cercano, dentro de la cobertura. */
export const ORIGEN = {
  nombre: 'Parque principal',
  detalle: 'Parque principal, Fusagasugá, Cundinamarca',
  coords: { lat: 4.3369, lon: -74.3638 },
};
export const DESTINO = {
  nombre: 'Barrio Balmoral',
  detalle: 'Barrio Balmoral, Fusagasugá, Cundinamarca',
  coords: { lat: 4.345, lon: -74.37 },
};

export interface Usuario {
  nombre: string;
  correo: string;
  token: string;
  id: number;
}

let contador = 0;
/** Sufijo único por ejecución y por llamada. */
export function unico(): string {
  contador += 1;
  return `${Date.now().toString(36)}${process.pid.toString(36)}${contador}`;
}

export async function nuevaApi(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: `${API}/` });
}

async function cuerpo<T>(
  respuesta: { ok(): boolean; status(): number; json(): Promise<unknown>; text(): Promise<string> },
  que: string,
): Promise<T> {
  if (!respuesta.ok())
    throw new Error(`${que}: HTTP ${respuesta.status()} ${await respuesta.text()}`);
  return (await respuesta.json()) as T;
}

export async function iniciarSesionApi(
  api: APIRequestContext,
  correo: string,
  clave = CLAVE,
): Promise<{ token: string; id: number }> {
  const r = await cuerpo<{ token: string; user: { id: number } }>(
    await api.post('auth/login', { data: { correo, password: clave } }),
    'login',
  );
  return { token: r.token, id: r.user.id };
}

/** Registra un usuario (2 = cliente, 3 = conductor) y devuelve su sesión. */
export async function crearUsuario(
  api: APIRequestContext,
  rol: 2 | 3,
  nombre: string,
): Promise<Usuario> {
  const correo = `e2e.${rol === 2 ? 'cliente' : 'conductor'}.${unico()}@trackit.test`;
  await cuerpo(
    await api.post('auth/register', { data: { nombre, correo, password: CLAVE, id_rol: rol } }),
    'registro',
  );
  return { nombre, correo, ...(await iniciarSesionApi(api, correo)) };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Nombre único solo con letras (los nombres no admiten números). */
export function nombreUnico(base: string): string {
  return `${base} ${Array.from({ length: 6 }, () => String.fromCodePoint(97 + randomInt(26))).join('')}`;
}

/** Conductor con vehículo y los seis documentos subidos, esperando la revisión del administrador. */
export async function crearConductorPendiente(
  api: APIRequestContext,
  categoria: 'Moto Express' | 'Furgoneta' = 'Moto Express',
  nombre = 'Jhon Conductor',
): Promise<Usuario & { placa: string }> {
  const conductor = await crearUsuario(api, 3, nombre);
  const letra = () => String.fromCodePoint(65 + randomInt(26));
  const digitos = (cuantos: number) => String(randomInt(10 ** cuantos)).padStart(cuantos, '0');
  const placa = `${letra()}${letra()}${letra()}${categoria === 'Moto Express' ? digitos(2) + letra() : digitos(3)}`;
  await cuerpo(
    await api.post('vehicles/register', {
      headers: auth(conductor.token),
      data: { placa, categoria },
    }),
    'vehículo',
  );

  const vence = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
  for (const tipo of [
    'Cédula',
    'Selfie',
    'Licencia',
    'SOAT',
    'Tarjeta de propiedad',
    'Antecedentes',
  ]) {
    const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
      tipo_documento: tipo,
      archivo: { name: 'doc.jpg', mimeType: 'image/jpeg', buffer: JPG },
    };
    if (tipo === 'Licencia' || tipo === 'SOAT') multipart['fecha_vencimiento'] = vence;
    await cuerpo(
      await api.post('documentos/upload', { headers: auth(conductor.token), multipart }),
      `documento ${tipo}`,
    );
  }
  return { ...conductor, placa };
}

/** Conductor con vehículo, documentos revisados y aprobado por el administrador. */
export async function crearConductorAprobado(
  api: APIRequestContext,
  categoria: 'Moto Express' | 'Furgoneta' = 'Moto Express',
): Promise<Usuario & { placa: string }> {
  const conductor = await crearConductorPendiente(api, categoria);

  const admin = await iniciarSesionApi(api, ADMIN.correo, ADMIN.clave);
  const pendientes = await cuerpo<
    { id_conductor: number; correo: string; documentos: { id: number }[] }[]
  >(await api.get('conductores/pendientes', { headers: auth(admin.token) }), 'pendientes');
  const yo = pendientes.find((p) => p.correo === conductor.correo);
  if (!yo) throw new Error('El conductor no aparece entre los pendientes');
  for (const d of yo.documentos) {
    await cuerpo(
      await api.patch(`admin/documentos/${d.id}`, {
        headers: auth(admin.token),
        data: { aprobado: true },
      }),
      'revisar documento',
    );
  }
  await cuerpo(
    await api.post('conductores/aprobar', {
      headers: auth(admin.token),
      data: { driverId: yo.id_conductor, approved: true },
    }),
    'aprobar',
  );
  return conductor;
}

export interface EnvioCreado {
  id_envio: number;
  pin_seguridad: string;
  codigo_recogida: string;
  tarifa: number;
}

/** Envío en efectivo del parque principal a Balmoral. */
export async function crearEnvio(
  api: APIRequestContext,
  cliente: Usuario,
  extra: Record<string, unknown> = {},
): Promise<EnvioCreado> {
  const r = await cuerpo<{ envio: EnvioCreado }>(
    await api.post('envios/crear', {
      headers: auth(cliente.token),
      data: {
        origen: ORIGEN.detalle,
        destino: DESTINO.detalle,
        origen_coords: ORIGEN.coords,
        destino_coords: DESTINO.coords,
        tipo_carga: 'Documentos',
        categoria: 'Moto Express',
        ...extra,
      },
    }),
    'crear envío',
  );
  return r.envio;
}

/** Inicia sesión por la pantalla de login y espera a salir de ella. */
export async function iniciarSesion(page: Page, correo: string, clave = CLAVE): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(clave);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/**
 * Sugerencias de dirección fijas: en E2E el backend corre con GEO_MODO=sin-red (no consulta
 * OpenStreetMap), así que el buscador de direcciones se simula con dos lugares conocidos.
 */
export async function simularBuscadorDirecciones(page: Page): Promise<void> {
  await page.route('**/api/geo/buscar**', async (ruta) => {
    const q = new URL(ruta.request().url()).searchParams.get('q')?.toLowerCase() ?? '';
    const lugares = [ORIGEN, DESTINO].filter((l) =>
      l.nombre.toLowerCase().includes(q.split(' ')[0] ?? ''),
    );
    await ruta.fulfill({ json: { resultados: lugares.length > 0 ? lugares : [ORIGEN, DESTINO] } });
  });
}
