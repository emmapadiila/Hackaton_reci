import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hook que encapsula todo el manejo de la cámara: permisos, abrir el stream,
 * cambiar entre cámara frontal/trasera y liberar la cámara al terminar.
 *
 * Estrategia para elegir cámara (cada celular se comporta distinto):
 *   1. facingMode EXACTO ('environment' = trasera, 'user' = frontal).
 *      `ideal` es solo una sugerencia y muchos Android la ignoran.
 *   2. Si falla, buscar la cámara por su NOMBRE (enumerateDevices) y abrirla
 *      por deviceId. Nunca suponemos identificadores fijos.
 *   3. Para el primer arranque: facingMode ideal y, al final, cualquier cámara
 *      (así siguen funcionando los computadores con una sola webcam).
 * Después de abrir, se verifica qué cámara se obtuvo realmente.
 *
 * estado: 'inactiva' | 'solicitando' | 'activa' | 'error'
 */

const RESOLUCION = { width: { ideal: 1920 }, height: { ideal: 1080 } };
// Pausa tras apagar una cámara: algunos Android tardan en liberarla.
const PAUSA_MS = 300;
const ERRORES_DE_PERMISO = ['NotAllowedError', 'SecurityError'];

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

function detenerPistas(stream) {
  stream?.getTracks().forEach((pista) => pista.stop());
}

/** Deduce la orientación a partir del nombre que el navegador da a la cámara. */
export function clasificarCamara(nombre = '') {
  const t = nombre.toLowerCase();
  if (/(front|frontal|delantera|user|selfie|facetime)/.test(t)) return 'user';
  if (/(back|rear|trasera|posterior|environment|world)/.test(t)) return 'environment';
  return null; // desconocida (típico en webcams de computador)
}

/** Lista las cámaras. Devuelve null si el navegador no permite enumerarlas. */
async function listarCamaras() {
  if (!navigator.mediaDevices?.enumerateDevices) return null;
  try {
    const dispositivos = await navigator.mediaDevices.enumerateDevices();
    return dispositivos
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({
        deviceId: d.deviceId,
        nombre: d.label || `Cámara ${i + 1}`,
        orientacion: clasificarCamara(d.label),
      }));
  } catch {
    return null;
  }
}

/** Información real de la cámara abierta (no la que pedimos, la que obtuvimos). */
function describirStream(stream, camaras, metodo) {
  const pista = stream.getVideoTracks()[0];
  const ajustes = pista?.getSettings?.() ?? {};
  const deviceId = ajustes.deviceId || '';
  const enLista = camaras?.find((c) => c.deviceId && c.deviceId === deviceId);
  const nombre = enLista?.nombre || pista?.label || '';
  const modo = ['user', 'environment'].includes(ajustes.facingMode)
    ? ajustes.facingMode
    : clasificarCamara(nombre);
  return {
    modo,
    deviceId,
    nombre,
    metodo,
    resolucion: ajustes.width && ajustes.height ? `${ajustes.width}×${ajustes.height}` : '',
  };
}

const porModoExacto = (modo) => ({
  metodo: 'facingMode exacto',
  video: { ...RESOLUCION, facingMode: { exact: modo } },
});
const porDeviceId = (deviceId, metodo) => ({
  metodo,
  video: { ...RESOLUCION, deviceId: { exact: deviceId } },
});

async function pedirStream(video) {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: false, video });
  } catch (err) {
    // La cámara anterior aún no se libera: reintentamos una vez.
    if (err?.name === 'NotReadableError' || err?.name === 'AbortError') {
      await esperar(600);
      return navigator.mediaDevices.getUserMedia({ audio: false, video });
    }
    throw err;
  }
}

/**
 * Prueba las restricciones en orden. `aceptar(stream)` permite descartar un
 * stream (p. ej. si el navegador devolvió la misma cámara que ya teníamos).
 */
async function probarCandidatos(candidatos, aceptar = () => true) {
  let ultimoError = null;
  for (const candidato of candidatos) {
    try {
      const stream = await pedirStream(candidato.video);
      if (aceptar(stream)) return { stream, metodo: candidato.metodo };
      detenerPistas(stream);
      await esperar(PAUSA_MS);
    } catch (err) {
      if (ERRORES_DE_PERMISO.includes(err?.name)) throw err; // no tiene sentido seguir
      ultimoError = err;
    }
  }
  if (ultimoError) throw ultimoError;
  return null;
}

export function useCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  // Cada solicitud tiene un número; las respuestas viejas se descartan.
  const solicitudRef = useRef(0);

  const [estado, setEstado] = useState('inactiva');
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [cambiando, setCambiando] = useState(false);
  const [camaras, setCamaras] = useState(null); // null = el navegador no permitió listarlas
  const [actual, setActual] = useState(null); // resultado de describirStream()

  const liberarStream = useCallback(() => {
    detenerPistas(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const detener = useCallback(() => {
    solicitudRef.current++;
    liberarStream();
    setEstado('inactiva');
  }, [liberarStream]);

  /** Conecta un stream al <video>. Llamar solo si la solicitud sigue vigente. */
  const conectar = useCallback(async (stream, info) => {
    streamRef.current = stream;
    setActual(info);
    setEstado('activa');
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      await video.play().catch(() => {});
    }
  }, []);

  const iniciar = useCallback(
    async (modoDeseado = 'environment') => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          window.isSecureContext
            ? 'Este navegador no permite usar la cámara. Prueba con Chrome, Edge, Firefox o Safari actualizados.'
            : 'La cámara solo funciona en una conexión segura (https:// o localhost). Abre la aplicación con "npm run dev:movil" para usarla desde el celular.'
        );
        setEstado('error');
        return;
      }

      const id = ++solicitudRef.current;
      const habiaCamara = Boolean(streamRef.current);
      liberarStream();
      setEstado('solicitando');
      setError(null);
      setAviso(null);
      if (habiaCamara) await esperar(PAUSA_MS);
      if (id !== solicitudRef.current) return;

      try {
        let resultado = await probarCandidatos([
          porModoExacto(modoDeseado),
          { metodo: 'facingMode ideal', video: { ...RESOLUCION, facingMode: { ideal: modoDeseado } } },
          { metodo: 'cualquier cámara', video: true },
        ]);
        if (id !== solicitudRef.current) return detenerPistas(resultado.stream);

        // Con el permiso concedido, ya podemos ver los nombres de las cámaras.
        const lista = await listarCamaras();
        let info = describirStream(resultado.stream, lista, resultado.metodo);

        // El navegador ignoró la orientación pedida: buscamos la cámara por su nombre.
        const alternativa = lista?.find(
          (c) => c.orientacion === modoDeseado && c.deviceId && c.deviceId !== info.deviceId
        );
        if (info.modo !== modoDeseado && alternativa) {
          detenerPistas(resultado.stream);
          await esperar(PAUSA_MS);
          const candidatos = [porDeviceId(alternativa.deviceId, 'deviceId según nombre')];
          if (info.deviceId) candidatos.push(porDeviceId(info.deviceId, 'cámara disponible'));
          resultado = await probarCandidatos(candidatos);
          if (id !== solicitudRef.current) return detenerPistas(resultado.stream);
          info = describirStream(resultado.stream, lista, resultado.metodo);
        }

        setCamaras(lista);
        await conectar(resultado.stream, info);
      } catch (err) {
        if (id !== solicitudRef.current) return;
        setError(describirErrorCamara(err));
        setEstado('error');
      }
    },
    [liberarStream, conectar]
  );

  const cambiarCamara = useCallback(async () => {
    if (camaras && camaras.length < 2) {
      setAviso('Este dispositivo solo tiene una cámara disponible para el navegador.');
      return;
    }
    const anterior = actual;
    const objetivo =
      anterior?.modo === 'user' ? 'environment' : anterior?.modo === 'environment' ? 'user' : null;

    // Candidatos en orden de preferencia.
    const candidatos = [];
    if (objetivo) {
      candidatos.push(porModoExacto(objetivo));
      camaras
        ?.filter((c) => c.orientacion === objetivo && c.deviceId)
        .forEach((c) => candidatos.push(porDeviceId(c.deviceId, 'deviceId según nombre')));
    }
    // Último recurso: la siguiente cámara de la lista, sin suponer su orientación.
    if (camaras?.length > 1) {
      const indice = camaras.findIndex((c) => c.deviceId === anterior?.deviceId);
      const siguiente = camaras[(indice + 1) % camaras.length];
      if (siguiente?.deviceId) candidatos.push(porDeviceId(siguiente.deviceId, 'siguiente cámara'));
    }
    if (candidatos.length === 0) {
      setAviso('Este navegador no permite elegir otra cámara.');
      return;
    }

    // Solo aceptamos un stream que sea realmente otra cámara.
    const esOtraCamara = (stream) => {
      const nuevo = stream.getVideoTracks()[0]?.getSettings?.() ?? {};
      if (anterior?.deviceId && nuevo.deviceId) return nuevo.deviceId !== anterior.deviceId;
      return objetivo ? nuevo.facingMode === objetivo : true;
    };

    const id = ++solicitudRef.current;
    setCambiando(true);
    setAviso(null);
    setEstado('solicitando');
    liberarStream(); // detenemos TODAS las pistas de la cámara anterior
    await esperar(PAUSA_MS);

    try {
      const resultado = await probarCandidatos(candidatos, esOtraCamara);
      if (id !== solicitudRef.current) return detenerPistas(resultado?.stream);
      if (!resultado) throw new Error('sin-alternativa');
      await conectar(resultado.stream, describirStream(resultado.stream, camaras, resultado.metodo));
    } catch (err) {
      if (id !== solicitudRef.current) return;
      if (ERRORES_DE_PERMISO.includes(err?.name)) {
        setError(describirErrorCamara(err));
        setEstado('error');
        return;
      }
      // No se pudo cambiar: volvemos a la cámara que funcionaba.
      const nombreObjetivo = objetivo === 'user' ? 'frontal' : objetivo === 'environment' ? 'trasera' : 'otra';
      setAviso(`No fue posible abrir la cámara ${nombreObjetivo} en este dispositivo. Seguimos con la anterior.`);
      try {
        const regreso = await probarCandidatos(
          [
            ...(anterior?.deviceId ? [porDeviceId(anterior.deviceId, 'cámara anterior')] : []),
            { metodo: 'cualquier cámara', video: true },
          ].filter(Boolean)
        );
        if (id !== solicitudRef.current) return detenerPistas(regreso.stream);
        await conectar(regreso.stream, describirStream(regreso.stream, camaras, regreso.metodo));
      } catch (err2) {
        if (id !== solicitudRef.current) return;
        setError(describirErrorCamara(err2));
        setEstado('error');
      }
    } finally {
      if (id === solicitudRef.current) setCambiando(false);
    }
  }, [actual, camaras, liberarStream, conectar]);

  // Al desmontar el componente, apagamos la cámara.
  useEffect(() => detener, [detener]);

  // null = desconocido (no se pudieron listar): dejamos intentar el cambio.
  const puedeCambiar = camaras === null ? true : camaras.length > 1;

  return {
    videoRef,
    estado,
    error,
    aviso,
    cambiando,
    camaras,
    actual,
    modo: actual?.modo ?? null,
    puedeCambiar,
    iniciar,
    detener,
    cambiarCamara,
  };
}

export function describirErrorCamara(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'No diste permiso para usar la cámara. Toca el ícono de candado o de cámara en la barra de direcciones, permite el acceso y vuelve a intentarlo.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No encontramos una cámara en este dispositivo. Puedes subir una foto desde la galería.';
    case 'NotReadableError':
    case 'AbortError':
      return 'La cámara está siendo usada por otra aplicación (videollamada, otra pestaña…). Ciérrala y vuelve a intentarlo.';
    default:
      return `No se pudo abrir la cámara (${err?.name || 'error desconocido'}).`;
  }
}
