/**
 * Post-procesamiento de las cajas del detector (funciones puras, sin dependencias).
 *
 * 1. Ajusta cada caja a los bordes de la imagen.
 * 2. Descarta cajas "de fondo" (casi toda la foto) si hay otros objetos.
 * 3. Elimina duplicados: el detector suele marcar el mismo objeto varias veces
 *    (con consultas distintas o cajas casi iguales). Nos quedamos con la de
 *    mayor puntuación y guardamos las etiquetas alternativas de las cajas solapadas.
 * 4. Numera los objetos en orden de lectura (de arriba abajo, de izquierda a derecha).
 */

/** Convierte {xmin, ymin, xmax, ymax} en {x, y, ancho, alto} dentro de la imagen. */
export function ajustarCaja(caja, anchoImagen, altoImagen) {
  const x1 = Math.max(0, Math.min(caja.xmin, anchoImagen));
  const y1 = Math.max(0, Math.min(caja.ymin, altoImagen));
  const x2 = Math.max(0, Math.min(caja.xmax, anchoImagen));
  const y2 = Math.max(0, Math.min(caja.ymax, altoImagen));
  return { x: x1, y: y1, ancho: x2 - x1, alto: y2 - y1 };
}

/** Intersección sobre unión: 0 = no se tocan, 1 = idénticas. */
export function iou(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.ancho, b.x + b.ancho) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.alto, b.y + b.alto) - Math.max(a.y, b.y));
  const interseccion = ix * iy;
  const union = a.ancho * a.alto + b.ancho * b.alto - interseccion;
  return union > 0 ? interseccion / union : 0;
}

/**
 * @param {{score:number,label:string,box:{xmin,ymin,xmax,ymax}}[]} detecciones  salida cruda del detector
 * @returns {{ objetos: object[], descartados: { duplicados: number, fondo: number, pequenos: number, exceso: number } }}
 */
export function filtrarDetecciones(
  detecciones,
  anchoImagen,
  altoImagen,
  { iouDuplicados = 0.5, areaMaximaFondo = 0.85, maxObjetos = 20, areaMinima = 0.002 } = {}
) {
  const areaImagen = anchoImagen * altoImagen;
  const descartados = { duplicados: 0, fondo: 0, pequenos: 0, exceso: 0 };

  let candidatos = detecciones
    .map((d) => ({ consulta: d.label, puntuacion: d.score, caja: ajustarCaja(d.box, anchoImagen, altoImagen) }))
    .filter((d) => {
      const ok = d.caja.ancho * d.caja.alto >= areaMinima * areaImagen;
      if (!ok) descartados.pequenos++;
      return ok;
    })
    .sort((a, b) => b.puntuacion - a.puntuacion);

  // Cajas de fondo: solo se descartan si existe al menos otro objeto más pequeño.
  const esFondo = (d) => (d.caja.ancho * d.caja.alto) / areaImagen > areaMaximaFondo;
  if (candidatos.some((d) => !esFondo(d))) {
    candidatos = candidatos.filter((d) => {
      if (esFondo(d)) descartados.fondo++;
      return !esFondo(d);
    });
  }

  // NMS independiente de la consulta: una caja visible y sus posibles etiquetas.
  const conservados = [];
  for (const d of candidatos) {
    const principal = conservados.find((c) => iou(c.caja, d.caja) > iouDuplicados);
    if (principal) {
      descartados.duplicados++;
      if (principal.consulta !== d.consulta) principal.consultasAlternativas.add(d.consulta);
      continue;
    }
    conservados.push({ ...d, consultasAlternativas: new Set() });
  }

  if (conservados.length > maxObjetos) {
    descartados.exceso = conservados.length - maxObjetos;
    conservados.length = maxObjetos; // quedan los de mayor puntuación
  }

  // Orden de lectura: franjas horizontales de 1/6 de la altura, luego de izquierda a derecha.
  const franja = altoImagen / 6;
  conservados.sort((a, b) => {
    const fa = Math.floor((a.caja.y + a.caja.alto / 2) / franja);
    const fb = Math.floor((b.caja.y + b.caja.alto / 2) / franja);
    return fa - fb || a.caja.x - b.caja.x;
  });

  return {
    // `posibleFondo`: la caja cubre casi toda la foto. Puede ser un residuo
    // fotografiado de cerca... o el fondo (mesa, tela). No lo damos por seguro.
    objetos: conservados.map(({ consultasAlternativas, ...d }, i) => ({
      numero: i + 1,
      ...d,
      posibleFondo: esFondo(d),
      consultasAlternativas: [...consultasAlternativas],
    })),
    descartados,
  };
}
