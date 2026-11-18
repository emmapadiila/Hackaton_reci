/**
 * ⚠️ LISTA PROVISIONAL — PENDIENTE DE VALIDAR con los responsables del proyecto
 * (Fundación / gestores de reciclaje y huerta de Villas de San Pablo).
 *
 * - `nombre`: lo que ve la persona en la app.
 * - `grupo`: agrupación provisional. NO indica todavía si el material es aceptado:
 *   eso lo decidirá el catálogo validado (Fase 5).
 * - `descripciones`: textos en inglés que CLIP compara con la foto
 *   (CLIP fue entrenado principalmente con texto en inglés).
 *
 * IMPORTANTE: si cambias las `descripciones` o agregas/quitas categorías,
 * ejecuta `npm run generar-embeddings` para recalcular los vectores de texto.
 */
export const CATEGORIAS = [
  {
    id: 'carton',
    nombre: 'Cartón',
    grupo: 'reciclable',
    descripciones: [
      'a photo of a cardboard box',
      'a photo of flattened cardboard',
      'a photo of a piece of brown corrugated cardboard',
    ],
  },
  {
    id: 'papel',
    nombre: 'Papel',
    grupo: 'reciclable',
    descripciones: [
      'a photo of a sheet of white paper',
      'a photo of old newspapers',
      'a photo of crumpled paper',
      'a photo of a paper notebook',
    ],
  },
  {
    id: 'plastico_pet',
    nombre: 'Plástico PET (botellas)',
    grupo: 'reciclable',
    descripciones: [
      'a photo of a clear plastic bottle',
      'a photo of an empty plastic water bottle',
      'a photo of a plastic soda bottle',
      'a photo of a crushed plastic bottle',
    ],
  },
  {
    id: 'plastico_otro',
    nombre: 'Otros plásticos',
    grupo: 'reciclable',
    descripciones: [
      'a photo of a plastic bag',
      'a photo of a plastic food container',
      'a photo of a disposable plastic cup',
      'a photo of a plastic detergent bottle',
    ],
  },
  {
    id: 'aluminio',
    nombre: 'Aluminio (latas)',
    grupo: 'reciclable',
    descripciones: [
      'a photo of an aluminum soda can',
      'a photo of a crushed aluminum can',
      'a photo of a beer can',
    ],
  },
  {
    id: 'vidrio',
    nombre: 'Vidrio',
    grupo: 'reciclable',
    descripciones: [
      'a photo of a glass bottle',
      'a photo of a glass jar',
      'a photo of a green glass beer bottle',
    ],
  },
  {
    id: 'organico',
    nombre: 'Restos de frutas y verduras',
    grupo: 'organico',
    descripciones: [
      'a photo of fruit peels',
      'a photo of a banana peel',
      'a photo of vegetable scraps',
      'a photo of food waste from fruits and vegetables',
      'a photo of rotten fruit',
    ],
  },
  {
    // Categoría "de descarte": absorbe fotos que no muestran un residuo.
    id: 'ninguno',
    nombre: 'Ningún residuo reconocible',
    grupo: 'ninguno',
    descripciones: [
      "a photo of a person's face",
      'a photo of an empty room',
      'a photo of a wall',
      'a photo of a dog or a cat',
      'a very blurry photo',
      'a very dark photo',
    ],
  },
];

export const GRUPOS = {
  reciclable: 'Posible material reciclable',
  organico: 'Posible residuo orgánico (compostaje)',
  ninguno: 'No identificado',
};
