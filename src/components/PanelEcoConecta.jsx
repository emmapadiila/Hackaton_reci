import { useEffect, useState } from 'react';
import BotonGaleria from './BotonGaleria.jsx';
import ImagenConRecuadros from './ImagenConRecuadros.jsx';
import { analizarFoto, CATEGORIAS, orientacion, resumen, SIN_RESIDUOS } from '../services/ecoAnalisis.js';
import { validarArchivoImagen } from '../utils/imagen.js';

export default function PanelEcoConecta({ foto, onRepetir, onArchivo }) {
  const [resultado, setResultado] = useState(null);
  const [activo, setActivo] = useState(null);
  const [etapa, setEtapa] = useState('Preparando imagen…');
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const invalida = validarArchivoImagen(foto.blob);
    if (invalida) {
      setError(invalida);
      setEtapa('');
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('timeout'), 90000);
    Promise.resolve().then(() => {
      if (!controller.signal.aborted) return analizarFoto(foto.blob, controller.signal, setEtapa);
    }).then((datos) => {
      if (datos && !controller.signal.aborted) setResultado(datos);
    }).catch((err) => {
      if (controller.signal.reason === 'timeout') {
        setError('Se agotó el tiempo de análisis. Puedes reintentar o tomar otra foto.');
      } else if (!controller.signal.aborted) {
        setError(err instanceof TypeError ? 'No se pudo conectar con el servicio de análisis.'
          : err instanceof SyntaxError ? 'La respuesta del servicio de análisis no es válida.' : err.message);
      }
    }).finally(() => {
      clearTimeout(timeout);
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') setEtapa('');
    });
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [foto.blob, intento]);

  const items = resultado?.residuos ?? [];
  const cajas = items.map((item, index) => {
    const { x, y, width, height } = item.bounding_box;
    return { numero: index + 1, descripcion: item.nombre, caja: { x, y, ancho: width, alto: height } };
  });
  const objetoActivo = activo == null ? null : items[activo - 1];

  return (
    <section className="eco-analisis">
      {resultado && (
        <header className="eco-resultado">
          <img src="/icono.svg" alt="" width="54" height="54" />
          <h2>¡Analizamos tus residuos!</h2>
        </header>
      )}
      <div className="eco-grid">
        <div className="eco-foto">
          <ImagenConRecuadros url={foto.url} ancho={1} alto={1} objetos={cajas}
            seleccionado={activo} onSeleccionar={setActivo} />
          {objetoActivo && <div className="eco-panel" aria-live="polite">
            <strong>{objetoActivo.nombre}</strong>
            <p>{CATEGORIAS[objetoActivo.categoria] ?? 'Categoría sin identificar'}</p>
            <a href={`#${objetoActivo.id}`}>Ver ficha del objeto</a>
          </div>}
        </div>

        <div className="eco-detalle">
          {etapa && <div className="eco-panel eco-actividad" role="status"><span className="eco-spinner" />{etapa}</div>}
          {error && <p className="eco-aviso" role="alert">{error}</p>}
          {resultado && items.length === 0 && <p className="eco-aviso">{SIN_RESIDUOS}</p>}
          {resultado?.advertencias.map((aviso) => (
            <p className="eco-aviso" key={aviso}>{aviso}</p>
          ))}
          {items.length > 0 && <dl className="eco-resumen">
            {resumen(items).map(([label, total]) => <div key={label}><dt>{label}</dt><dd>{total}</dd></div>)}
          </dl>}
          {items.map((item, index) => {
            const [colectivo, consejo] = orientacion(item.categoria);
            return (
              <article id={item.id} key={item.id} className={`eco-panel eco-tarjeta ${activo === index + 1 ? 'eco-activa' : ''}`}>
                <header>
                  <span aria-hidden="true" className="eco-icono">{item.categoria === 'organico' ? '🌿' : '♻'}</span>
                  <div><h3>{item.nombre}</h3>
                    <span className="eco-sello">{CATEGORIAS[item.categoria] ?? 'Categoría sin identificar'}</span></div>
                </header>
                <dl><div><dt>Material</dt><dd>{item.material || 'Por identificar'}</dd></div>
                  <div><dt>Colectivo</dt><dd>{colectivo ?? 'Por confirmar'}</dd></div></dl>
                {item.categoria && <p>{consejo}</p>}
              </article>
            );
          })}
          <div className="eco-acciones">
            {error && <button type="button" className="boton boton-primario" onClick={() => {
              setError('');
              setEtapa('Preparando imagen…');
              setIntento((n) => n + 1);
            }}>Reintentar análisis</button>}
            <button type="button" className="boton boton-secundario" onClick={onRepetir}>Analizar otra fotografía</button>
            <BotonGaleria onArchivo={onArchivo}>Elegir de la galería</BotonGaleria>
          </div>
        </div>
      </div>
    </section>
  );
}
