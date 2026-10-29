/** Genera CSV (separador coma, comillas dobles escapadas, BOM para Excel). */
export function aCsv(encabezados: string[], filas: (string | number)[][]): string {
  const celda = (v: string | number) => {
    const t = String(v);
    return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '﻿' + [encabezados, ...filas].map((f) => f.map(celda).join(',')).join('\r\n');
}

export function descargarArchivo(
  nombre: string,
  contenido: string,
  tipo = 'text/csv;charset=utf-8',
): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
