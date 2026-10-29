// Verifica el umbral de 90 % en core/domain y core/adapters/http (el builder de Angular
// solo admite umbrales globales). Se ejecuta después de `ng test --coverage`.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const UMBRAL = 90;
const CARPETAS = [
  ['src', 'app', 'core', 'domain'].join(sep),
  ['src', 'app', 'core', 'adapters', 'http'].join(sep),
];
const METRICAS = ['lines', 'statements', 'functions', 'branches'];

function buscar(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      const r = buscar(p);
      if (r) return r;
    } else if (n === 'coverage-summary.json') return p;
  }
  return null;
}

const archivo = buscar('coverage');
if (!archivo) {
  console.error('No se encontró coverage-summary.json. Ejecuta primero: ng test --coverage');
  process.exit(1);
}
const resumen = JSON.parse(readFileSync(archivo, 'utf8'));
let falla = false;
for (const carpeta of CARPETAS) {
  const total = Object.fromEntries(METRICAS.map((m) => [m, { covered: 0, total: 0 }]));
  for (const [ruta, datos] of Object.entries(resumen)) {
    if (ruta === 'total' || !ruta.includes(carpeta + sep)) continue;
    for (const m of METRICAS) {
      total[m].covered += datos[m].covered;
      total[m].total += datos[m].total;
    }
  }
  const linea = METRICAS.map((m) => {
    const pct = total[m].total ? (100 * total[m].covered) / total[m].total : 100;
    if (pct < UMBRAL) falla = true;
    return `${m} ${pct.toFixed(1)} %`;
  }).join(' · ');
  console.log(`${carpeta}: ${linea}`);
}
if (falla) {
  console.error(`Cobertura por debajo del ${UMBRAL} % en dominio o adaptadores HTTP.`);
  process.exit(1);
}
console.log(`Umbral del ${UMBRAL} % cumplido en dominio y adaptadores HTTP.`);
