/**
 * Web Worker de inteligencia artificial. Ejecuta los modelos sin congelar la
 * interfaz. Todo ocurre dentro del dispositivo: la foto NO se envía a ningún
 * servidor. (La primera vez se DESCARGAN los modelos desde Hugging Face y el
 * motor ONNX desde jsDelivr; luego quedan en la caché del navegador.)
 *
 * Tareas:
 *   'clasificar' -> CLIP sobre la foto completa (Fase 2).
 *   'detectar'   -> OWL-ViT localiza varios objetos (Etapa 1 del escáner).
 *
 * Mensajes que recibe:  { id, tipo: 'clasificar' | 'detectar', imagen: Blob }
 * Mensajes que envía:   { id, tipo: 'progreso', modelo, cargado, total, porcentaje }
 *                       { id, tipo: 'resultado', ... }
 *                       { id, tipo: 'error', mensaje }
 */
import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
  pipeline,
} from '@huggingface/transformers';
import {
  MODELO,
  DTYPE,
  ESCALA_LOGITS,
  MODELO_DETECTOR,
  DTYPE_DETECTOR,
  UMBRAL_DETECCION,
  IOU_DUPLICADOS,
  AREA_MAXIMA_FONDO,
  MAX_OBJETOS,
} from './config.js';
import { CATEGORIAS } from './categorias.js';
import { clasificar, vectoresDesactualizados } from './clasificar.js';
import { filtrarDetecciones } from './detectar.js';
import { TEXTOS_CONSULTA } from './consultas-deteccion.js';
import datosTexto from './embeddings-texto.json';

env.allowLocalModels = false; // los modelos vienen de Hugging Face, no del servidor local

/** Crea un callback que suma el avance de todos los archivos de un modelo. */
function crearProgreso(id, modelo) {
  const archivos = {};
  return (info) => {
    if (info.status !== 'progress' || !info.total) return;
    archivos[info.file] = { cargado: info.loaded, total: info.total };
    const cargado = Object.values(archivos).reduce((s, a) => s + a.cargado, 0);
    const total = Object.values(archivos).reduce((s, a) => s + a.total, 0);
    self.postMessage({ id, tipo: 'progreso', modelo, cargado, total, porcentaje: (cargado / total) * 100 });
  };
}

/** Carga perezosa: cada modelo se descarga solo la primera vez que se necesita. */
function cargaPerezosa(cargar) {
  let promesa = null;
  return (id) => {
    if (!promesa) {
      promesa = cargar(id);
      promesa.catch(() => {
        promesa = null; // si falla (p. ej. sin internet), se puede reintentar
      });
    }
    return promesa;
  };
}

const cargarClip = cargaPerezosa(async (id) => {
  if (vectoresDesactualizados(CATEGORIAS, datosTexto, MODELO)) {
    throw new Error(
      'Las categorías cambiaron y los vectores de texto están desactualizados. Ejecuta "npm run generar-embeddings".'
    );
  }
  const progress_callback = crearProgreso(id, 'clasificador');
  const procesador = await AutoProcessor.from_pretrained(MODELO, { progress_callback });
  const modelo = await CLIPVisionModelWithProjection.from_pretrained(MODELO, {
    dtype: DTYPE,
    device: 'wasm',
    progress_callback,
  });
  return { procesador, modelo };
});

const cargarDetector = cargaPerezosa((id) =>
  pipeline('zero-shot-object-detection', MODELO_DETECTOR, {
    dtype: DTYPE_DETECTOR,
    device: 'wasm',
    progress_callback: crearProgreso(id, 'detector'),
  })
);

async function tareaClasificar(id, imagen) {
  const { procesador, modelo } = await cargarClip(id);
  const inicio = performance.now();
  const imagenCruda = await RawImage.fromBlob(imagen);
  const { image_embeds } = await modelo(await procesador(imagenCruda));
  const ranking = clasificar(image_embeds.data, datosTexto, ESCALA_LOGITS);
  return { ranking, tiempoMs: performance.now() - inicio };
}

async function tareaDetectar(id, imagen) {
  const detector = await cargarDetector(id);
  const inicio = performance.now();
  const imagenCruda = await RawImage.fromBlob(imagen);
  const crudas = await detector(imagenCruda, TEXTOS_CONSULTA, { threshold: UMBRAL_DETECCION });
  const { objetos, descartados } = filtrarDetecciones(crudas, imagenCruda.width, imagenCruda.height, {
    iouDuplicados: IOU_DUPLICADOS,
    areaMaximaFondo: AREA_MAXIMA_FONDO,
    maxObjetos: MAX_OBJETOS,
  });
  return {
    objetos,
    descartados,
    cajasCrudas: crudas.length,
    ancho: imagenCruda.width,
    alto: imagenCruda.height,
    tiempoMs: performance.now() - inicio,
  };
}

const TAREAS = { clasificar: tareaClasificar, detectar: tareaDetectar };

// Las tareas se ejecutan de una en una: el motor WASM no admite sesiones simultáneas.
let cola = Promise.resolve();

self.addEventListener('message', ({ data }) => {
  const tarea = TAREAS[data?.tipo];
  if (!tarea) return;
  const { id, imagen } = data;
  cola = cola.then(async () => {
    try {
      const resultado = await tarea(id, imagen);
      self.postMessage({ id, tipo: 'resultado', ...resultado });
    } catch (err) {
      self.postMessage({ id, tipo: 'error', mensaje: err?.message || String(err) });
    }
  });
});
