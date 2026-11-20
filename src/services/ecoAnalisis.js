export const SIN_RESIDUOS = 'No pudimos identificar residuos con suficiente claridad. Prueba otra foto con el objeto más cerca y buena iluminación.';

export const CATEGORIAS = {
  reciclable: 'Reciclable', organico: 'Orgánico', no_aprovechable: 'No aprovechable',
};

export function orientacion(categoria) {
  if (categoria === 'reciclable') return ['Recicladores', 'Vacía y separa el material. Confirma que esté limpio y seco antes de entregarlo.'];
  if (categoria === 'organico') return ['Huerta', 'Separa el residuo de su empaque y consulta si la huerta lo recibe.'];
  if (categoria === 'no_aprovechable') return [null, 'Consulta la disposición que corresponde a este material.'];
  return [null, 'Identifica el material antes de decidir cómo separarlo.'];
}

export async function analizarFoto(imagen, signal, onEtapa) {
  const carga = new FormData();
  carga.append('imagen', imagen, 'residuo');
  const respuesta = await fetch('/api/ia/analizar-residuos', {
    method: 'POST', body: carga, signal, headers: { Accept: 'application/x-ndjson' },
  });
  if (!respuesta.ok) {
    const datos = await respuesta.json().catch(() => null);
    throw new Error(typeof datos?.detail === 'string' ? datos.detail : 'El servicio de análisis no está disponible.');
  }
  if (!respuesta.body || !respuesta.headers.get('content-type')?.includes('application/x-ndjson')) {
    throw new Error('La respuesta del servicio de análisis no es válida.');
  }
  const lector = respuesta.body.pipeThrough(new TextDecoderStream()).getReader();
  let pendiente = '';
  let resultado;
  function aplicar(linea) {
    const dato = JSON.parse(linea);
    if (dato.error) throw new Error(dato.error);
    if (dato.etapa) onEtapa(dato.etapa);
    if (dato.resultado) resultado = dato.resultado;
  }
  try {
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      pendiente += value;
      const lineas = pendiente.split('\n');
      pendiente = lineas.pop();
      lineas.filter(Boolean).forEach(aplicar);
    }
    if (pendiente.trim()) aplicar(pendiente);
  } finally {
    await lector.cancel().catch(() => {});
  }
  if (!Array.isArray(resultado?.residuos) || !Array.isArray(resultado.advertencias) ||
      resultado.advertencias.some((aviso) => typeof aviso !== 'string') ||
      resultado.residuos.some((item) => {
        const box = item?.bounding_box;
        return typeof item?.id !== 'string' || typeof item.nombre !== 'string' ||
          !box || ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
          box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0 ||
          box.x + box.width > 1.000001 || box.y + box.height > 1.000001;
      })) {
    throw new Error('La respuesta del servicio de análisis no es válida.');
  }
  return resultado;
}

export function resumen(items) {
  return [
    ['Detectados', items.filter((item) => item.bounding_box).length],
    ['Reciclables', items.filter((item) => item.categoria === 'reciclable').length],
    ['Orgánicos', items.filter((item) => item.categoria === 'organico').length],
    ['Por revisar', items.filter((item) => item.requiere_revision).length],
  ];
}
