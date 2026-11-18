/**
 * Calcula UNA VEZ, en el computador, los vectores de texto de CLIP para cada
 * descripción de `categorias.js` y los guarda en `embeddings-texto.json`.
 *
 * Así el celular solo descarga el modelo de IMAGEN (~89 MB) y no el de texto (~64 MB).
 *
 * Uso:  npm run generar-embeddings
 * Repetir cada vez que se cambien las categorías o sus descripciones.
 */
import { writeFile } from 'node:fs/promises';
import { AutoTokenizer, CLIPTextModelWithProjection } from '@huggingface/transformers';
import { CATEGORIAS } from '../src/services/reconocimiento/categorias.js';
import { MODELO, DTYPE } from '../src/services/reconocimiento/config.js';
import { normalizar } from '../src/services/reconocimiento/clasificar.js';

const SALIDA = new URL('../src/services/reconocimiento/embeddings-texto.json', import.meta.url);

console.log(`Cargando modelo de texto ${MODELO} (${DTYPE})… la primera vez se descarga (~64 MB).`);
const tokenizador = await AutoTokenizer.from_pretrained(MODELO);
const modeloTexto = await CLIPTextModelWithProjection.from_pretrained(MODELO, { dtype: DTYPE });

const categorias = [];
for (const categoria of CATEGORIAS) {
  const entradas = tokenizador(categoria.descripciones, { padding: true, truncation: true });
  const { text_embeds } = await modeloTexto(entradas);
  const vectores = text_embeds
    .tolist()
    .map((v) => normalizar(v).map((x) => Number(x.toFixed(5))));
  categorias.push({ id: categoria.id, descripciones: categoria.descripciones, vectores });
  console.log(`  ✔ ${categoria.id}: ${vectores.length} descripciones × ${vectores[0].length} dimensiones`);
}

const datos = { modelo: MODELO, dtype: DTYPE, generado: new Date().toISOString(), categorias };
await writeFile(SALIDA, JSON.stringify(datos));
console.log(`\nGuardado en ${SALIDA.pathname}`);
