/**
 * Textos que el detector OWL-ViT usa para BUSCAR objetos en la foto.
 *
 * Ojo: esto solo sirve para LOCALIZAR cada objeto. El material lo decidirá
 * CLIP sobre el recorte de cada objeto (Etapa 2). Por eso aquí usamos
 * descripciones de objetos comunes en los residuos, en inglés (idioma del modelo).
 * `descripcion` es solo para mostrar en español qué consulta encontró el objeto.
 *
 * LISTA INICIAL: se ajustará según las pruebas con fotos reales.
 */
export const CONSULTAS_DETECCION = [
  { consulta: 'a bottle', descripcion: 'botella' },
  { consulta: 'a plastic bottle', descripcion: 'botella plástica' },
  { consulta: 'a glass bottle', descripcion: 'botella de vidrio' },
  { consulta: 'a can', descripcion: 'lata' },
  { consulta: 'a soda can', descripcion: 'lata de gaseosa' },
  { consulta: 'a cardboard box', descripcion: 'caja de cartón' },
  { consulta: 'a piece of cardboard', descripcion: 'pedazo de cartón' },
  { consulta: 'a sheet of paper', descripcion: 'hoja de papel' },
  { consulta: 'a crumpled paper', descripcion: 'papel arrugado' },
  { consulta: 'a newspaper', descripcion: 'periódico' },
  { consulta: 'a plastic bag', descripcion: 'bolsa plástica' },
  { consulta: 'a plastic container', descripcion: 'envase plástico' },
  { consulta: 'a cup', descripcion: 'vaso' },
  { consulta: 'a jar', descripcion: 'frasco' },
  { consulta: 'a food wrapper', descripcion: 'empaque' },
  { consulta: 'a carton', descripcion: 'caja de leche o jugo' },
  { consulta: 'a fruit peel', descripcion: 'cáscara de fruta' },
  { consulta: 'a banana peel', descripcion: 'cáscara de banano' },
  { consulta: 'an orange peel', descripcion: 'cáscara de naranja' },
  { consulta: 'a fruit', descripcion: 'fruta' },
  { consulta: 'a vegetable', descripcion: 'verdura' },
  { consulta: 'food scraps', descripcion: 'restos de comida' },
];

export const TEXTOS_CONSULTA = CONSULTAS_DETECCION.map((c) => c.consulta);
export const DESCRIPCION_POR_CONSULTA = Object.fromEntries(
  CONSULTAS_DETECCION.map((c) => [c.consulta, c.descripcion])
);
