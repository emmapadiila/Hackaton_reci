import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';
import { DTYPE, MODELO } from '../src/services/reconocimiento/config.js';
import { predecirTaco } from '../src/services/reconocimiento/predecir-taco.js';

const base = 'taco-dataset';
env.cacheDir = join(base, 'cache-modelos');
const catalogo = new Map([
  [0, 'papel aluminio'],
  [5, 'botella plástica transparente'],
  [6, 'botella de vidrio'],
  [7, 'tapa plástica de botella'],
  [8, 'tapa metálica de botella'],
  [10, 'lata de conserva'],
  [12, 'lata de bebida'],
  [17, 'cartón corrugado'],
  [25, 'restos de comida'],
  [33, 'papel'],
  [34, 'bolsa de papel'],
  [42, 'bolsa de papas fritas'],
]);
const datos = JSON.parse(await readFile(join(base, 'data', 'annotations.json'), 'utf8'));
const fotos = new Map(datos.images.map((foto) => [foto.id, foto]));
const huella = (valor) => createHash('sha256').update(String(valor)).digest().readUInt32BE();
const muestras = [...catalogo.keys()].flatMap((clase) => {
  const porFoto = new Map();
  for (const caja of datos.annotations) {
    if (caja.category_id !== clase || Math.min(...caja.bbox.slice(2)) < 20) continue;
    if (!porFoto.has(caja.image_id)) porFoto.set(caja.image_id, caja);
  }
  const ordenadas = [...porFoto.values()].sort((a, b) => huella(a.image_id) - huella(b.image_id));
  return ordenadas.filter((caja) => huella(caja.image_id) % 5 !== 0).slice(0, 24)
    .concat(ordenadas.filter((caja) => huella(caja.image_id) % 5 === 0).slice(0, 10));
});
const carpetaFotos = join(base, 'miniaturas');
await mkdir(carpetaFotos, { recursive: true });

const descargar = process.argv.includes('--descargar');
if (descargar) {
  const pendientes = [...new Set(muestras.map((caja) => caja.image_id))];
  let fallos = 0;
  await Promise.all(Array.from({ length: 10 }, async () => {
    while (pendientes.length) {
      const id = pendientes.pop();
      const archivo = join(carpetaFotos, id + '.jpg');
      if (await readFile(archivo).catch(() => null)) continue;
      const miniatura = fotos.get(id).flickr_640_url;
      if (!miniatura) continue;
      try {
        const url = new URL(miniatura);
        if (url.origin !== 'https://img.tacodataset.org') throw new Error('Origen inesperado');
        const respuesta = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
        if (!respuesta.ok || !respuesta.headers.get('content-type')?.startsWith('image/')) {
          throw new Error('HTTP ' + respuesta.status);
        }
        await writeFile(archivo + '.part', Buffer.from(await respuesta.arrayBuffer()));
        await rename(archivo + '.part', archivo);
      } catch (error) {
        fallos++;
        console.warn(id, error.message);
      }
    }
  }));
  console.log('Descarga de fotos finalizada. Fallos:', fallos);
}

env.allowRemoteModels = descargar;
const procesador = await AutoProcessor.from_pretrained(MODELO);
const modelo = await CLIPVisionModelWithProjection.from_pretrained(MODELO, { dtype: DTYPE });
const ejemplos = [];
const normalizar = (vector) => {
  const norma = Math.hypot(...vector);
  return Array.from(vector, (valor) => valor / norma);
};
for (const caja of muestras) {
  const foto = fotos.get(caja.image_id);
  const bytes = await readFile(join(carpetaFotos, foto.id + '.jpg')).catch(() => null);
  if (!bytes) continue;
  const imagen = await RawImage.fromBlob(new Blob([bytes], { type: 'image/jpeg' }));
  const [x, y, ancho, alto] = caja.bbox;
  const sx = imagen.width / foto.width;
  const sy = imagen.height / foto.height;
  const recorte = await imagen.crop([
    Math.max(0, Math.floor(x * sx)),
    Math.max(0, Math.floor(y * sy)),
    Math.min(imagen.width - 1, Math.ceil((x + ancho) * sx) - 1),
    Math.min(imagen.height - 1, Math.ceil((y + alto) * sy) - 1),
  ]);
  const { image_embeds } = await modelo(await procesador(recorte));
  ejemplos.push({
    clase: caja.category_id,
    prueba: huella(foto.id) % 5 === 0,
    vector: normalizar(image_embeds.data),
  });
  if (ejemplos.length % 50 === 0) console.log('Recortes procesados:', ejemplos.length);
}

const entreno = ejemplos.filter((e) => !e.prueba);
const prueba = ejemplos.filter((e) => e.prueba);
const clases = [...catalogo].flatMap(([id, etiqueta]) => {
  const muestras = entreno.filter((e) => e.clase === id);
  const casosPrueba = prueba.filter((e) => e.clase === id);
  if (muestras.length < 5 || casosPrueba.length < 3) {
    console.warn('Datos insuficientes para', etiqueta, muestras.length, 'entrenamiento,', casosPrueba.length, 'prueba');
    return [];
  }
  const suma = muestras[0].vector.map((_, i) => muestras.reduce((total, e) => total + e.vector[i], 0));
  return [{ id, etiqueta, vector: normalizar(suma).map((valor) => Number(valor.toFixed(6))) }];
});
if (clases.length < 2) throw new Error('Se necesitan al menos dos clases con muestras suficientes.');
const ids = new Set(clases.map((clase) => clase.id));
const pruebaEvaluada = prueba.filter((e) => ids.has(e.clase));
const evaluar = (ejemplo) => predecirTaco(ejemplo.vector, clases).id === ejemplo.clase;
const metricas = {
  entrenamiento: entreno.filter((e) => ids.has(e.clase)).length,
  prueba: pruebaEvaluada.length,
  aciertos: pruebaEvaluada.filter(evaluar).length,
  porClase: clases.map(({ id, etiqueta }) => {
    const casos = prueba.filter((e) => e.clase === id);
    return { etiqueta, prueba: casos.length, aciertos: casos.filter(evaluar).length };
  }),
};
console.log(JSON.stringify(metricas, null, 2));
const destino = 'src/services/reconocimiento/modelo-taco.json';
await writeFile(destino + '.part', JSON.stringify({ modelo: MODELO, dtype: DTYPE, metricas, clases }) + '\n');
await rename(destino + '.part', destino);
