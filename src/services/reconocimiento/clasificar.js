/**
 * Matemática de la clasificación zero-shot de CLIP (sin dependencias, se
 * puede usar en el navegador y en Node).
 *
 * 1. Normalizamos el vector de la imagen.
 * 2. Para cada categoría, tomamos la MAYOR similitud (coseno) entre la imagen
 *    y cada una de sus descripciones.
 * 3. Multiplicamos por la escala de CLIP (100) y aplicamos softmax para obtener
 *    una confianza entre 0 y 1 por categoría (suman 1).
 */
export function normalizar(vector) {
  let suma = 0;
  for (const v of vector) suma += v * v;
  const norma = Math.sqrt(suma) || 1;
  return Array.from(vector, (v) => v / norma);
}

function productoPunto(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * @param {Float32Array|number[]} vectorImagen  salida `image_embeds` del modelo de visión
 * @param {{categorias: {id: string, vectores: number[][]}[]}} datosTexto  vectores precalculados
 * @returns {{id: string, similitud: number, confianza: number}[]} ordenado de mayor a menor
 */
export function clasificar(vectorImagen, datosTexto, escala = 100) {
  const imagen = normalizar(vectorImagen);

  const puntajes = datosTexto.categorias.map((c) => {
    const similitud = Math.max(...c.vectores.map((v) => productoPunto(imagen, v)));
    return { id: c.id, similitud, logit: escala * similitud };
  });

  const maximo = Math.max(...puntajes.map((p) => p.logit));
  const exponenciales = puntajes.map((p) => Math.exp(p.logit - maximo));
  const total = exponenciales.reduce((a, b) => a + b, 0);

  return puntajes
    .map((p, i) => ({ id: p.id, similitud: p.similitud, confianza: exponenciales[i] / total }))
    .sort((a, b) => b.confianza - a.confianza);
}

/** Verifica que los vectores precalculados correspondan a las categorías actuales. */
export function vectoresDesactualizados(categorias, datosTexto, modelo) {
  if (!datosTexto?.categorias || datosTexto.modelo !== modelo) return true;
  const actual = JSON.stringify(categorias.map((c) => [c.id, c.descripciones]));
  const guardado = JSON.stringify(datosTexto.categorias.map((c) => [c.id, c.descripciones]));
  return actual !== guardado;
}
