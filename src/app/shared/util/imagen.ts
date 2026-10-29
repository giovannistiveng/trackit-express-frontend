/** Lado mayor de las fotos que se suben: suficiente para leer un documento y liviano en datos móviles. */
export const LADO_MAXIMO_FOTO = 1600;
export const CALIDAD_JPEG = 0.82;

/** Nombre de archivo con fecha: foto-20261029-143005.jpg */
export function nombreFoto(prefijo = 'foto', fecha = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${prefijo}-${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}-${p(fecha.getHours())}${p(fecha.getMinutes())}${p(fecha.getSeconds())}.jpg`;
}

/** Tamaño final conservando la proporción y sin pasar del lado máximo. */
export function escalar(
  ancho: number,
  alto: number,
  maximo = LADO_MAXIMO_FOTO,
): { ancho: number; alto: number } {
  const mayor = Math.max(ancho, alto);
  if (mayor <= maximo || mayor === 0) return { ancho, alto };
  const f = maximo / mayor;
  return { ancho: Math.round(ancho * f), alto: Math.round(alto * f) };
}

/** Dibuja una fuente (video o imagen) en un canvas y la convierte en un JPEG comprimido. */
export function aJpeg(
  fuente: CanvasImageSource,
  anchoOriginal: number,
  altoOriginal: number,
  nombre: string,
): Promise<File> {
  const { ancho, alto } = escalar(anchoOriginal, altoOriginal);
  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas no disponible'));
  ctx.drawImage(fuente, 0, 0, ancho, alto);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(new File([blob], nombre, { type: 'image/jpeg' }))
          : reject(new Error('No se pudo crear la foto')),
      'image/jpeg',
      CALIDAD_JPEG,
    ),
  );
}

/**
 * Reduce una imagen pesada (por ejemplo, una foto de 12 MP de la galería) antes de subirla.
 * Los PDF y las imágenes pequeñas se devuelven sin cambios. Si algo falla, devuelve el original.
 */
export async function comprimirImagen(archivo: File, umbralBytes = 1_500_000): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(archivo.type) || archivo.size <= umbralBytes) return archivo;
  if (typeof createImageBitmap !== 'function') return archivo;
  try {
    const bitmap = await createImageBitmap(archivo);
    const nombre = archivo.name.replace(/\.\w+$/, '') + '.jpg';
    const salida = await aJpeg(bitmap, bitmap.width, bitmap.height, nombre);
    bitmap.close();
    return salida.size < archivo.size ? salida : archivo;
  } catch {
    return archivo;
  }
}
