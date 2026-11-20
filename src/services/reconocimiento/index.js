/**
 * Módulo de reconocimiento de residuos.
 *
 * La interfaz SOLO se comunica con este archivo. En la Fase 5 cambiaremos el
 * modelo CLIP por nuestro modelo entrenado sin tocar los componentes visuales.
 *
 * Contrato:
 *   analizarImagen(imagen: Blob, { onProgreso }) => Promise<Resultado>
 *
 *   Resultado = {
 *     estado: 'reconocido' | 'no_reconocido' | 'error',
 *     mensaje: string,
 *     etiqueta?: string,       // p. ej. "Plástico PET (botellas)"
 *     categoria?: string,      // grupo provisional, p. ej. "Posible material reciclable"
 *     confianza?: number,      // 0 a 1, tal como la calcula el modelo
 *     alternativas?: { etiqueta, confianza }[],  // las 3 opciones más probables
 *     aprovechable?: null,     // null = pendiente del catálogo validado (Fase 5)
 *     modelo?: string,
 *     tiempoMs?: number,       // tiempo de análisis (sin contar la descarga)
 *   }
 */
import { CATEGORIAS, GRUPOS } from './categorias.js';
import { MODELO, UMBRAL_CONFIANZA } from './config.js';
import { DATOS_POR_CONSULTA } from './consultas-deteccion.js';

export const reconocimientoDisponible = typeof Worker !== 'undefined';

const POR_ID = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c]));

let worker = null;
let siguienteId = 0;
const pendientes = new Map(); // id -> { resolver, rechazar, onProgreso }

function obtenerWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./ia.worker.js', import.meta.url), { type: 'module' });
  worker.addEventListener('message', ({ data }) => {
    const pendiente = pendientes.get(data.id);
    if (!pendiente) return;
    if (data.tipo === 'progreso') {
      pendiente.onProgreso?.(data);
      return;
    }
    pendientes.delete(data.id);
    if (data.tipo === 'resultado') {
      pendiente.resolver(data);
      return;
    }
    pendiente.rechazar(new Error(data.mensaje));
    if (data.reiniciarWorker) reiniciarWorker(new Error(data.mensaje));
  });
  worker.addEventListener('error', (evento) => {
    // Suele ocurrir si el celular se queda sin memoria al cargar los modelos.
    const error = new Error(
      evento.message || 'El proceso de IA se detuvo inesperadamente (posible falta de memoria del dispositivo)'
    );
    reiniciarWorker(error);
  });
  return worker;
}

/** Cierra el worker (liberando memoria) y rechaza lo pendiente; se recrea al próximo análisis. */
function reiniciarWorker(error) {
  pendientes.forEach((p) => p.rechazar(error));
  pendientes.clear();
  worker?.terminate();
  worker = null;
}

function enviarAlWorker(tipo, imagen, onProgreso, caja) {
  const id = ++siguienteId;
  return new Promise((resolver, rechazar) => {
    pendientes.set(id, { resolver, rechazar, onProgreso });
    obtenerWorker().postMessage({ id, tipo, imagen, caja });
  });
}

const mensajeFallo = (err) =>
  `No se pudo ejecutar el modelo: ${err.message}. Si es la primera vez, revisa la conexión a internet (hay que descargar el modelo).`;

export async function clasificarObjeto({ imagen, caja }, { onProgreso } = {}) {
  try {
    const { etiqueta } = await enviarAlWorker('clasificarObjeto', imagen, onProgreso, caja);
    return { estado: 'reconocido', etiqueta };
  } catch (err) {
    return { estado: 'error', mensaje: mensajeFallo(err) };
  }
}

/**
 * Detecta VARIOS objetos en la foto (Etapa 1).
 *
 * Resultado = {
 *   estado: 'detectado' | 'sin_objetos' | 'error',
 *   mensaje: string,
 *   objetos: { numero, caja: {x, y, ancho, alto}, puntuacion, consulta, descripcion }[],
 *              // `caja` en píxeles de la imagen ORIGINAL (ancho × alto)
 *   ancho, alto,          // tamaño real de la imagen analizada
 *   descartados: { duplicados, fondo, pequenos, exceso },
 *   cajasCrudas: number,  // cajas que entregó el detector antes de filtrar
 *   modelo, tiempoMs,
 * }
 * La `puntuacion` del detector NO es una probabilidad calibrada.
 */
export async function detectarObjetos(imagen, { onProgreso } = {}) {
  if (!reconocimientoDisponible) {
    return { estado: 'error', objetos: [], mensaje: 'Este navegador no permite ejecutar los modelos de IA.' };
  }
  let r;
  try {
    r = await enviarAlWorker('detectar', imagen, onProgreso);
  } catch (err) {
    return { estado: 'error', objetos: [], mensaje: mensajeFallo(err) };
  }
  const objetos = r.objetos.map((o) => {
    const datos = DATOS_POR_CONSULTA[o.consulta];
    const descripcion = datos?.descripcion ?? o.consulta;
    const alternativas = (o.consultasAlternativas ?? []).map(
      (consulta) => DATOS_POR_CONSULTA[consulta]?.descripcion ?? consulta
    );
    return {
      ...o,
      ...datos,
      descripcion,
      alternativas: [...new Set(alternativas)].filter((etiqueta) => etiqueta !== descripcion).slice(0, 2),
    };
  });
  return {
    estado: objetos.length > 0 ? 'detectado' : 'sin_objetos',
    mensaje:
      objetos.length > 0
        ? `El detector encontró ${objetos.length} ${objetos.length === 1 ? 'objeto' : 'objetos'}.`
        : 'El detector no encontró objetos en esta foto. Prueba con más luz, un fondo despejado y los residuos separados entre sí.',
    objetos,
    ancho: r.ancho,
    alto: r.alto,
    descartados: r.descartados,
    cajasCrudas: r.cajasCrudas,
    modelo: 'OWL-ViT B/32 (preentrenado, vocabulario abierto)',
    tiempoMs: r.tiempoMs,
  };
}

export async function analizarImagen(imagen, { onProgreso } = {}) {
  if (!reconocimientoDisponible) {
    return { estado: 'error', mensaje: 'Este navegador no permite ejecutar el modelo de reconocimiento.' };
  }

  let respuesta;
  try {
    respuesta = await enviarAlWorker('clasificar', imagen, onProgreso);
  } catch (err) {
    return { estado: 'error', mensaje: mensajeFallo(err) };
  }

  const alternativas = respuesta.ranking.slice(0, 3).map((r) => ({
    etiqueta: POR_ID[r.id]?.nombre ?? r.id,
    confianza: r.confianza,
  }));
  const mejor = respuesta.ranking[0];
  const categoria = POR_ID[mejor.id];
  const base = {
    alternativas,
    confianza: mejor.confianza,
    modelo: 'CLIP ViT-B/32 (preentrenado, sin ajuste a residuos locales)',
    tiempoMs: respuesta.tiempoMs,
    aprovechable: null,
  };

  if (mejor.id === 'ninguno') {
    return {
      ...base,
      estado: 'no_reconocido',
      mensaje: 'La foto no parece mostrar uno de los residuos de la lista. Acércate al residuo, usa buena luz y vuelve a intentarlo.',
    };
  }
  if (mejor.confianza < UMBRAL_CONFIANZA) {
    return {
      ...base,
      estado: 'no_reconocido',
      mensaje: `El modelo no está seguro (confianza menor al ${Math.round(UMBRAL_CONFIANZA * 100)} %). Revisa las opciones más probables o toma otra foto.`,
    };
  }
  return {
    ...base,
    estado: 'reconocido',
    etiqueta: categoria?.nombre ?? mejor.id,
    categoria: GRUPOS[categoria?.grupo] ?? '—',
    mensaje: 'Resultado de un modelo general que puede equivocarse. Verifica visualmente el material.',
  };
}

export { MODELO };
