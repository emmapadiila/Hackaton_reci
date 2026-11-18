/**
 * Configuración del reconocimiento (Fase 2: modelo preentrenado, SIN entrenamiento propio).
 *
 * Modelo: CLIP ViT-B/32 (OpenAI), convertido a ONNX para Transformers.js.
 *   https://huggingface.co/Xenova/clip-vit-base-patch32
 * CLIP compara la imagen con descripciones de texto ("clasificación zero-shot").
 * NO fue entrenado con residuos de Villas de San Pablo: sus resultados son una
 * aproximación que debemos medir con fotos reales.
 */
export const MODELO = 'Xenova/clip-vit-base-patch32';

// 'q8' = versión comprimida (~89 MB el modelo de imagen) que funciona bien en celulares.
export const DTYPE = 'q8';

// CLIP multiplica la similitud por 100 antes de convertirla en probabilidad.
export const ESCALA_LOGITS = 100;

/**
 * Por debajo de esta confianza respondemos "no reconocido".
 * VALOR INICIAL: se debe calibrar con las pruebas de fotos reales.
 */
export const UMBRAL_CONFIANZA = 0.5;

/* ---------------- Detección de múltiples objetos (Etapa 1) ----------------
 * Detector: OWL-ViT B/32 (Google, licencia Apache 2.0), "vocabulario abierto":
 * busca objetos descritos con texto, por eso puede buscar latas, papel,
 * cartón o cáscaras (los detectores COCO/YOLO solo conocen 80 clases fijas).
 *   https://huggingface.co/Xenova/owlvit-base-patch32
 * Sus puntuaciones NO son probabilidades calibradas: típicamente 0,1–0,6.
 */
export const MODELO_DETECTOR = 'Xenova/owlvit-base-patch32';
export const DTYPE_DETECTOR = 'q8'; // ~155 MB

// Puntuación mínima para aceptar una caja. VALOR INICIAL: calibrar con fotos reales.
export const UMBRAL_DETECCION = 0.1;
// Dos cajas que se solapan más que esto (IoU) se consideran el MISMO objeto.
export const IOU_DUPLICADOS = 0.5;
// Una caja que cubre más de esta fracción de la foto suele ser "el fondo";
// se descarta si hay otros objetos detectados.
export const AREA_MAXIMA_FONDO = 0.85;
// Límite de objetos mostrados para no saturar la pantalla.
export const MAX_OBJETOS = 20;
