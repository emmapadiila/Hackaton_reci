import { useCallback, useRef, useState } from 'react';

/**
 * Ejecuta una función de análisis de IA (detectar, clasificar…) y maneja
 * los estados: cargando, progreso de descarga del modelo y resultado.
 * Si se reinicia (p. ej. el usuario tomó otra foto), descarta respuestas viejas.
 */
export function useAnalisis(funcionAnalisis) {
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const solicitudRef = useRef(0);

  const reiniciar = useCallback(() => {
    solicitudRef.current++;
    setResultado(null);
    setCargando(false);
    setProgreso(null);
  }, []);

  const ejecutar = useCallback(
    async (imagen) => {
      const solicitud = ++solicitudRef.current;
      setCargando(true);
      setProgreso(null);
      setResultado(null);
      let nuevo;
      try {
        nuevo = await funcionAnalisis(imagen, {
          onProgreso: (p) => solicitud === solicitudRef.current && setProgreso(p),
        });
      } catch (err) {
        nuevo = { estado: 'error', mensaje: err?.message || 'Error desconocido.' };
      }
      if (solicitud !== solicitudRef.current) return;
      setResultado(nuevo);
      setCargando(false);
    },
    [funcionAnalisis]
  );

  return { resultado, cargando, progreso, ejecutar, reiniciar };
}
