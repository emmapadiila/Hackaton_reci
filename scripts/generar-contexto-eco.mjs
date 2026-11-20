import { writeFile } from 'node:fs/promises';
import { AutoTokenizer, CLIPTextModelWithProjection, env } from '@huggingface/transformers';
import { MODELO, DTYPE } from '../src/services/reconocimiento/config.js';
import { normalizar } from '../src/services/reconocimiento/clasificar.js';

const descripciones = [
  'a photo of the ceiling and fluorescent lights of a room',
  'a photo of ceiling tiles and a ceiling vent',
  'a photo of a wall with windows and a door',
  'a photo of a bare wall in an empty room',
  'a photo of the carpeted floor of an empty room',
  'a photo of an empty table with nothing on it',
];
env.cacheDir = 'taco-dataset/cache-modelos';
const tokenizer = await AutoTokenizer.from_pretrained(MODELO);
const encoder = await CLIPTextModelWithProjection.from_pretrained(MODELO, { dtype: DTYPE });
const { text_embeds } = await encoder(tokenizer(descripciones, { padding: true, truncation: true }));
const vectores = text_embeds.tolist().map((vector) => normalizar(vector).map((v) => Number(v.toFixed(5))));
const salida = new URL('../api/embeddings-fondo.json', import.meta.url);
await writeFile(salida, JSON.stringify({ modelo: MODELO, descripciones, vectores }) + '\n');
