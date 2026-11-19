/**
 * Crea la base de datos de E2E (DB_NAME) si todavía no existe, para no depender de psql.
 * Usa el driver `pg` del backend. Uso: node --env-file=e2e/backend.env e2e/apoyo/crear-base.mjs <carpeta-backend>
 */
import { createRequire } from 'node:module';
import path from 'node:path';

const backend = process.argv[2];
const { Client } = createRequire(path.join(backend, 'package.json'))('pg');
const nombre = process.env.DB_NAME ?? 'trackit_e2e';
if (!/^\w+$/.test(nombre)) throw new Error(`Nombre de base inválido: ${nombre}`);

const cliente = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'postgres',
});
try {
  await cliente.connect();
  const existe = await cliente.query('SELECT 1 FROM pg_database WHERE datname = $1', [nombre]);
  if (existe.rowCount === 0) {
    await cliente.query(`CREATE DATABASE "${nombre}"`);
    console.log(`Base ${nombre} creada.`);
  }
} catch (error) {
  console.error(
    `No se pudo preparar la base ${nombre} en ${process.env.DB_HOST}:${process.env.DB_PORT} ` +
      `con el usuario ${process.env.DB_USER}: ${error.message}\n` +
      '¿Está encendido PostgreSQL? Si tu usuario o clave no son postgres/postgres, define DB_USER y DB_PASSWORD.',
  );
  process.exitCode = 1;
} finally {
  await cliente.end().catch(() => undefined);
}
