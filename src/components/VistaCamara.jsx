import { useEffect, useState } from 'react';
import { useCamera } from '../hooks/useCamera.js';
import { capturarFotograma } from '../utils/imagen.js';
import BotonGaleria from './BotonGaleria.jsx';

const NOMBRE_MODO = { environment: 'Cámara trasera', user: 'Cámara frontal' };

/**
 * Vista en vivo de la cámara. Se enciende al montar este componente
 * (siempre intentando primero la cámara trasera) y se apaga al salir.
 */
export default function VistaCamara({ onCaptura, onArchivo, onVolver }) {
  const {
    videoRef, estado, error, aviso, cambiando, camaras, actual, modo, puedeCambiar,
    iniciar, cambiarCamara,
  } = useCamera();
  const [capturando, setCapturando] = useState(false);
  const [errorCaptura, setErrorCaptura] = useState(null);

  useEffect(() => {
    iniciar('environment');
  }, [iniciar]);

  const tomarFoto = async () => {
    setCapturando(true);
    setErrorCaptura(null);
    try {
      const blob = await capturarFotograma(videoRef.current);
      onCaptura(blob);
    } catch (err) {
      setErrorCaptura(err.message);
      setCapturando(false);
    }
  };

  const espejo = modo === 'user'; // la cámara frontal se ve como un espejo
  const unaSolaCamara = !puedeCambiar;

  return (
    <section className="vista-camara">
      <div className="visor">
        {/* El <video> siempre existe para que el hook pueda conectarle la cámara. */}
        <video
          ref={videoRef}
          className={`video ${espejo ? 'video-espejo' : ''} ${estado === 'activa' ? '' : 'oculto'}`}
          autoPlay
          playsInline
          muted
        />

        {estado === 'activa' && (
          <>
            <div className="guia-encuadre" aria-hidden="true" />
            <span className="chip-camara">{NOMBRE_MODO[modo] ?? 'Cámara activa'}</span>
          </>
        )}

        {(estado === 'solicitando' || estado === 'inactiva') && (
          <div className="visor-mensaje" role="status">
            <div className="spinner" aria-hidden="true" />
            <p>{cambiando ? 'Cambiando de cámara…' : 'Abriendo la cámara…'}</p>
            {!cambiando && <p className="texto-suave">Si el navegador lo pregunta, toca “Permitir”.</p>}
          </div>
        )}

        {estado === 'error' && (
          <div className="visor-mensaje visor-error" role="alert">
            <p>⚠️ {error}</p>
            <div className="acciones-columna">
              <button type="button" className="boton boton-primario" onClick={() => iniciar('environment')}>
                Reintentar
              </button>
              <BotonGaleria onArchivo={onArchivo} />
            </div>
          </div>
        )}
      </div>

      {estado === 'activa' && <p className="ayuda-encuadre">Ubica el residuo dentro del recuadro</p>}
      {aviso && <p className="mensaje-aviso" role="status">{aviso}</p>}
      {errorCaptura && <p className="mensaje-error" role="alert">{errorCaptura}</p>}

      <div className="barra-camara">
        <button type="button" className="boton-redondo" onClick={onVolver} aria-label="Volver al inicio">
          <span aria-hidden="true">←</span>
        </button>

        <button
          type="button"
          className="boton-disparador"
          onClick={tomarFoto}
          disabled={estado !== 'activa' || capturando}
          aria-label="Tomar foto"
        />

        {unaSolaCamara ? (
          <span className="hueco-boton" aria-hidden="true" />
        ) : (
          <button
            type="button"
            className="boton-redondo"
            onClick={cambiarCamara}
            disabled={estado !== 'activa'}
            aria-label={
              modo === 'user' ? 'Cambiar a la cámara trasera' : modo === 'environment' ? 'Cambiar a la cámara frontal' : 'Cambiar de cámara'
            }
          >
            <span aria-hidden="true">🔄</span>
          </button>
        )}
      </div>

      {estado === 'activa' && unaSolaCamara && (
        <p className="texto-centro texto-suave-oscuro">
          Este dispositivo tiene una sola cámara disponible, por eso no se puede cambiar.
        </p>
      )}

      {estado === 'activa' && (
        <div className="acciones-fila">
          <BotonGaleria onArchivo={onArchivo} className="boton boton-enlace" />
        </div>
      )}

      {/* Datos reales del navegador, útiles para diagnosticar en cada celular. */}
      {estado === 'activa' && (
        <details className="info-tecnica">
          <summary>Información técnica de la cámara</summary>
          <ul>
            <li>En uso: {actual?.nombre || 'sin nombre'}</li>
            <li>Orientación: {NOMBRE_MODO[modo] ?? 'el navegador no la informa'}</li>
            <li>Método: {actual?.metodo}</li>
            {actual?.resolucion && <li>Resolución: {actual.resolucion}</li>}
            <li>
              Cámaras detectadas:{' '}
              {camaras === null ? 'el navegador no permite listarlas' : camaras.length}
            </li>
          </ul>
          {camaras?.length > 0 && (
            <ol>
              {camaras.map((c, i) => (
                <li key={c.deviceId || i}>
                  {c.nombre} — {NOMBRE_MODO[c.orientacion] ?? 'orientación desconocida'}
                </li>
              ))}
            </ol>
          )}
        </details>
      )}
    </section>
  );
}
