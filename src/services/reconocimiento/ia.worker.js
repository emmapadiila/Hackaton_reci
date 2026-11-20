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
import modeloTaco from './modelo-taco.json';
import { predecirTaco } from './predecir-taco.js';

env.allowLocalModels = false; // los modelos vienen de Hugging Face, no del servidor local

/*
 * Motor ONNX: usamos la compilación WASM ESTÁNDAR en lugar de la "asyncify"
 * que Transformers.js elige por defecto en el navegador. La "asyncify" no
 * implementa la conversión a `double` que usa OWL-ViT (nodo /class_head/Cast),
 * y fallaba con: "Could not find an implementation for Cast(13)…".
 * Verificado: la estándar carga OWL-ViT y CLIP. Además pesa menos (14 MB vs 27 MB).
 */
const onnx = env.backends.onnx;
if (onnx?.wasm && onnx.versions?.web) {
  const base = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${onnx.versions.web}/dist/`;
  onnx.wasm.wasmPaths = {
    mjs: `${base}ort-wasm-simd-threaded.mjs`,
    wasm: `${base}ort-wasm-simd-threaded.wasm`,
  };
}

/** Marca un error de CARGA de modelo: el worker debe reiniciarse (ver index.js). */
class ErrorDeCarga extends Error {}
const conCargaSegura = (cargar) => async (id) => {
  try {
    return await cargar(id);
  } catch (err) {
    throw new ErrorDeCarga(err?.message || String(err));
  }
};

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

const cargarClip = cargaPerezosa(conCargaSegura(async (id) => {
  const progress_callback = crearProgreso(id, 'clasificador');
  const procesador = await AutoProcessor.from_pretrained(MODELO, { progress_callback });
  const modelo = await CLIPVisionModelWithProjection.from_pretrained(MODELO, {
    dtype: DTYPE,
    device: 'wasm',
    progress_callback,
  });
  return { procesador, modelo };
}));

const cargarDetector = cargaPerezosa(conCargaSegura((id) =>
  pipeline('zero-shot-object-detection', MODELO_DETECTOR, {
    dtype: DTYPE_DETECTOR,
    device: 'wasm',
    progress_callback: crearProgreso(id, 'detector'),
  })
));

async function tareaClasificar(id, imagen) {
  if (vectoresDesactualizados(CATEGORIAS, datosTexto, MODELO)) {
    throw new Error(
      'Las categorías cambiaron y los vectores de texto están desactualizados. Ejecuta "npm run generar-embeddings".'
    );
  }
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

async function tareaClasificarObjeto(id, imagen, caja) {
  if (modeloTaco.modelo !== MODELO || modeloTaco.dtype !== DTYPE) {
    throw new Error('El clasificador TACO requiere los pesos CLIP usados durante el entrenamiento.');
  }
  const { procesador, modelo } = await cargarClip(id);
  const original = await RawImage.fromBlob(imagen);
  const { x, y, ancho, alto } = caja;
  const recorte = await original.crop([
    Math.floor(x), Math.floor(y), Math.ceil(x + ancho) - 1, Math.ceil(y + alto) - 1,
  ]);
  const { image_embeds } = await modelo(await procesador(recorte));
  const mejor = predecirTaco(image_embeds.data, modeloTaco.clases);
  return { etiqueta: mejor.etiqueta };
}

const TAREAS = {
  clasificar: tareaClasificar,
  detectar: tareaDetectar,
  clasificarObjeto: tareaClasificarObjeto,
};

// Las tareas se ejecutan de una en una: el motor WASM no admite sesiones simultáneas.
let cola = Promise.resolve();

self.addEventListener('message', ({ data }) => {
  const tarea = TAREAS[data?.tipo];
  if (!tarea) return;
  const { id, imagen, caja } = data;
  cola = cola.then(async () => {
    try {
      const resultado = await tarea(id, imagen, caja);
      self.postMessage({ id, tipo: 'resultado', ...resultado });
    } catch (err) {
      // Si falló la CARGA de un modelo, Transformers.js deja "envenenada" su cadena
      // interna de carga y los demás modelos también fallarían: pedimos reiniciar el worker.
      self.postMessage({
        id,
        tipo: 'error',
        mensaje: err?.message || String(err),
        reiniciarWorker: err instanceof ErrorDeCarga,
      });
    }
  });
});
