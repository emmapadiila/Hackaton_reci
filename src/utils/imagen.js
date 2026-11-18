/** Tamaño máximo aceptado para imágenes subidas desde la galería. */
export const TAMANO_MAXIMO_MB = 15;

/**
 * Toma el fotograma actual del <video> y lo devuelve como Blob JPEG.
 * La foto se guarda sin efecto espejo, tal como la ve la cámara.
 */
export function capturarFotograma(video, { tipo = 'image/jpeg', calidad = 0.9 } = {}) {
  const ancho = video?.videoWidth;
  const alto = video?.videoHeight;
  if (!ancho || !alto) {
    return Promise.reject(new Error('La cámara todavía no está lista. Espera un momento.'));
  }

  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  canvas.getContext('2d').drawImage(video, 0, 0, ancho, alto);

  return new Promise((resolver, rechazar) => {
    canvas.toBlob(
      (blob) => (blob ? resolver(blob) : rechazar(new Error('No se pudo generar la fotografía.'))),
      tipo,
      calidad
    );
  });
}

/** Devuelve un mensaje de error si el archivo no sirve, o null si es válido. */
export function validarArchivoImagen(archivo) {
  if (!archivo) return 'No se seleccionó ningún archivo.';
  if (!archivo.type.startsWith('image/')) return 'El archivo seleccionado no es una imagen.';
  if (archivo.size > TAMANO_MAXIMO_MB * 1024 * 1024) {
    return `La imagen pesa más de ${TAMANO_MAXIMO_MB} MB. Elige una más liviana.`;
  }
  return null;
}
