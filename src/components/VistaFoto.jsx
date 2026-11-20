import { useEffect, useState } from 'react';
import BotonGaleria from './BotonGaleria.jsx';
import ImagenConRecuadros from './ImagenConRecuadros.jsx';
import PanelDeteccion, { IndicadorCarga } from './PanelDeteccion.jsx';
import PanelResultado from './PanelResultado.jsx';
import { useAnalisis } from '../hooks/useAnalisis.js';
import { clasificarObjeto } from '../services/reconocimiento/index.js';

function ReconocerObjeto({ imagen, objeto }) {
  const { resultado, cargando, progreso, ejecutar } = useAnalisis(clasificarObjeto);
  if (cargando) {
    return <IndicadorCarga progreso={progreso} textoAnalisis="Reconociendo el objeto seleccionado…" />;
  }
  return (
    <div className="panel-resultado">
      {resultado?.etiqueta ? (
        <p role="status">Sugerencia de TACO: <strong>{resultado.etiqueta}</strong></p>
      ) : (
        <>
          {resultado?.mensaje && <p role="alert">{resultado.mensaje}</p>}
          <button
            type="button"
            className="boton boton-secundario"
            onClick={() => ejecutar({ imagen, caja: objeto.caja })}
          >
            Reconocer objeto {objeto.numero} con TACO
          </button>
        </>
      )}
      <p className="texto-suave-oscuro">La sugerencia se limita a los tipos incluidos en el entrenamiento.</p>
    </div>
  );
}

/**
 * Foto capturada o subida + análisis.
 * - Detección de varios objetos (Etapa 1 del escáner).
 * - Clasificación de la foto completa con CLIP (método de la Fase 2), como opción secundaria.
 */
export default function VistaFoto({ foto, deteccion, clasificacion, onRepetir, onArchivo }) {
  const [seleccionado, setSeleccionado] = useState(null);
  const res = deteccion.resultado;
  const objeto = res?.objetos?.find((o) => o.numero === seleccionado && !o.posibleFondo);

  useEffect(() => setSeleccionado(null), [res]);

  return (
    <section className="vista-foto">
      <div className="marco-foto">
        <ImagenConRecuadros
          url={foto.url}
          ancho={res?.ancho}
          alto={res?.alto}
          objetos={res?.objetos}
          seleccionado={seleccionado}
          onSeleccionar={setSeleccionado}
        />
        <span className="etiqueta-origen">
          {foto.origen === 'camara' ? '📷 Tomada con la cámara' : '🖼️ Subida desde galería'}
        </span>
      </div>

      <div className="columna-resultados">
        <PanelDeteccion
          resultado={res}
          cargando={deteccion.cargando}
          progreso={deteccion.progreso}
          seleccionado={seleccionado}
          onSeleccionar={setSeleccionado}
          onDetectar={() => deteccion.ejecutar(foto.blob)}
        />

        {objeto && !objeto.categoriaOrganica && (
          <ReconocerObjeto key={foto.url + ':' + objeto.numero} imagen={foto.blob} objeto={objeto} />
        )}

        <details className="seccion-secundaria">
          <summary>Clasificar la foto completa (método anterior)</summary>
          <PanelResultado
            resultado={clasificacion.resultado}
            analizando={clasificacion.cargando}
            progreso={clasificacion.progreso}
            onAnalizar={() => clasificacion.ejecutar(foto.blob)}
          />
        </details>

        <div className="acciones-columna">
          <button type="button" className="boton boton-secundario" onClick={onRepetir}>
            📷 Tomar otra foto
          </button>
          <BotonGaleria onArchivo={onArchivo}>🖼️ Elegir otra imagen</BotonGaleria>
        </div>
      </div>
    </section>
  );
}
