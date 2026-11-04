// Verifica las reglas de la arquitectura hexagonal del frontend (se ejecuta con `npm run lint`).
//
//   core/domain    → modelos y reglas puras: no depende de Angular ni de ninguna otra capa
//   core/ports     → contratos: solo del dominio (y tipos de rxjs / señales de Angular)
//   core/adapters  → implementaciones de los puertos (HTTP, SSE, push, almacenamiento)
//   core/config    → valores de configuración (app-config) y el registro de qué adaptador
//                    implementa cada puerto (ports.providers = "core/wiring", solo para app.config)
//   features, layout, shared → pantallas y estado: usan puertos, nunca adaptadores
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(raiz, 'src', 'app');

const capa = (archivo) => {
  const r = relative(app, archivo).split(sep).join('/');
  if (r.startsWith('..')) return 'externo';
  if (r.replace(/\.ts$/, '') === 'core/config/ports.providers') return 'core/wiring';
  const [a, b] = r.split('/');
  return a === 'core' ? `core/${b}` : a;
};

/** Para cada capa, las capas internas que NO puede importar. */
const PROHIBIDO = {
  'core/domain': [
    'core/config',
    'core/ports',
    'core/adapters',
    'core/wiring',
    'core/auth',
    'core/http',
    'core/logging',
    'features',
    'layout',
    'shared',
  ],
  'core/ports': [
    'core/config',
    'core/adapters',
    'core/wiring',
    'core/auth',
    'core/http',
    'core/logging',
    'features',
    'layout',
    'shared',
  ],
  'core/adapters': ['core/wiring', 'features', 'layout', 'shared'],
  'core/auth': ['core/adapters', 'core/wiring', 'features', 'layout', 'shared'],
  'core/http': ['core/adapters', 'core/wiring', 'features', 'layout', 'shared'],
  'core/logging': ['core/adapters', 'core/wiring', 'features', 'layout', 'shared'],
  features: ['core/adapters', 'core/wiring', 'layout'],
  layout: ['core/adapters', 'core/wiring'],
  shared: ['core/adapters', 'core/wiring', 'features', 'layout'],
};
/** Librerías externas permitidas en las capas puras. */
const LIBRERIAS = {
  'core/domain': [],
  'core/ports': ['rxjs', '@angular/core'],
};

function* archivos(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* archivos(p);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) yield p;
  }
}

const errores = [];
for (const archivo of archivos(app)) {
  const origen = capa(archivo);
  const codigo = readFileSync(archivo, 'utf8');
  for (const [, ruta] of codigo.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+'([^']+)'/gms)) {
    if (ruta.startsWith('.')) {
      const destino = capa(resolve(dirname(archivo), ruta));
      if (PROHIBIDO[origen]?.includes(destino)) {
        errores.push(
          `${relative(raiz, archivo)}: la capa "${origen}" no puede importar "${destino}" (${ruta})`,
        );
      }
    } else if (origen in LIBRERIAS) {
      const paquete = ruta.startsWith('@')
        ? ruta.split('/').slice(0, 2).join('/')
        : ruta.split('/')[0];
      if (!LIBRERIAS[origen].includes(paquete)) {
        errores.push(
          `${relative(raiz, archivo)}: la capa "${origen}" no puede depender de "${ruta}"`,
        );
      }
    }
  }
}

if (errores.length) {
  console.error(
    `Arquitectura: ${errores.length} dependencia(s) no permitida(s)\n  ${errores.join('\n  ')}`,
  );
  process.exit(1);
}
console.log('Arquitectura hexagonal: sin dependencias prohibidas.');
