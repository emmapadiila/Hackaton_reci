// Con centroides normalizados, el producto escalar da el mismo orden que el coseno.
export function predecirTaco(vector, clases) {
  let mejor = null;
  let mejorSimilitud = -Infinity;
  for (const clase of clases) {
    const similitud = clase.vector.reduce((suma, peso, i) => suma + peso * vector[i], 0);
    if (similitud > mejorSimilitud) {
      mejor = clase;
      mejorSimilitud = similitud;
    }
  }
  return mejor;
}
