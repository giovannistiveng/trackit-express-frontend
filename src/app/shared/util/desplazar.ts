/**
 * Desplaza la página hasta el elemento con ese id (suave). No hace nada si no existe o si el
 * navegador no soporta `scrollIntoView` (p. ej. jsdom en pruebas).
 */
export function desplazarA(id: string, bloque: ScrollLogicalPosition = 'nearest'): void {
  const el = document.getElementById(id);
  if (typeof el?.scrollIntoView === 'function')
    el.scrollIntoView({ behavior: 'smooth', block: bloque });
}
