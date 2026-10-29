import { Pipe, PipeTransform } from '@angular/core';

const FORMATO = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function formatearCop(valor: number | null | undefined): string {
  return valor === null || valor === undefined || Number.isNaN(valor) ? '' : FORMATO.format(valor);
}

/** 39500 → "$ 39.500" */
@Pipe({ name: 'cop' })
export class CopPipe implements PipeTransform {
  transform(valor: number | null | undefined): string {
    return formatearCop(valor);
  }
}
