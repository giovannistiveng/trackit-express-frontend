import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Pruebas de punta a punta (E2E) de TrackIt Express.
 *
 * Playwright levanta solo el backend (puerto 3300, con e2e/backend.env) y el frontend
 * (ng serve --configuration e2e, puerto 4300). El backend debe estar clonado al lado:
 *   Proyecto Track It/
 *     trackit-express-backend/    ← E2E_BACKEND_DIR si está en otro lugar
 *     trackit-express-frontend/
 *
 *   npm run e2e            todas las pruebas, sin ventana
 *   npm run e2e:ui         modo interactivo
 *   npm run e2e:reporte    abre el último reporte HTML
 */
const CI = !!process.env['CI'];
const BACKEND = path.resolve(
  process.env['E2E_BACKEND_DIR'] ?? path.join(__dirname, '..', 'trackit-express-backend'),
);
const ENV_BACKEND = path.join(__dirname, 'e2e', 'backend.env');

// Conexión a PostgreSQL: si no viene en el entorno, se toma del .env del backend (usuario, clave,
// servidor y puerto). La base sigue siendo trackit_e2e (e2e/backend.env), separada de la de desarrollo.
const envDesarrollo = path.join(BACKEND, '.env');
if (existsSync(envDesarrollo)) {
  const valores = parseEnv(readFileSync(envDesarrollo, 'utf8'));
  for (const clave of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_SSL']) {
    if (process.env[clave] === undefined && valores[clave]) process.env[clave] = valores[clave];
  }
}
const nodeConEnv = (script: string) => `node --env-file="${ENV_BACKEND}" ${script}`;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  outputDir: 'e2e/resultados',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: [['list'], ['html', { outputFolder: 'e2e/reporte', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4300',
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Con un Chrome externo (E2E_CHROME) puede no haber ffmpeg para grabar video
    video: process.env['E2E_CHROME'] ? 'off' : 'retain-on-failure',
    serviceWorkers: 'block',
    // Solo para entornos sin descarga de navegadores: ruta a un Chrome/Chromium ya instalado
    launchOptions: process.env['E2E_CHROME'] ? { executablePath: process.env['E2E_CHROME'] } : {},
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] }, testIgnore: '**/*.movil.e2e.ts' },
    { name: 'celular', use: { ...devices['Pixel 7'] }, testMatch: '**/*.movil.e2e.ts' },
  ],
  webServer: [
    {
      name: 'backend',
      cwd: BACKEND,
      // Crea la base si falta, compila, aplica el esquema y levanta la API
      command: [
        nodeConEnv(`"${path.join(__dirname, 'e2e', 'apoyo', 'crear-base.mjs')}" "${BACKEND}"`),
        'npm run build',
        nodeConEnv('dist/infrastructure/database/cli.js preparar'),
        nodeConEnv('dist/infrastructure/http/server.js'),
      ].join(' && '),
      url: 'http://localhost:3300/health',
      reuseExistingServer: !CI,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      name: 'frontend',
      command: 'npx ng serve --configuration e2e',
      url: 'http://localhost:4300',
      reuseExistingServer: !CI,
      timeout: 240_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
