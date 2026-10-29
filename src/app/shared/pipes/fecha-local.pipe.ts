import { Pipe, PipeTransform } from '@angular/core';

const FECHA = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
const HORA = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true });

/** Fecha UTC del backend en hora local: "29 oct 2026, 2:03 a. m." */
export function formatearFechaLocal(valor: Date | string | null | undefined): string {
  if (!valor) return '';
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  return `${FECHA.format(d).replace(/ de /g, ' ').replace('.', '')}, ${HORA.format(d)}`;
}

@Pipe({ name: 'fechaLocal' })
export class FechaLocalPipe implements PipeTransform {
  transform(valor: Date | string | null | undefined): string {
    return formatearFechaLocal(valor);
  }
}
