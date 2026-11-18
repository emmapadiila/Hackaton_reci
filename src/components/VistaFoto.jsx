import { useEffect, useState } from 'react';
import BotonGaleria from './BotonGaleria.jsx';
import ImagenConRecuadros from './ImagenConRecuadros.jsx';
import PanelDeteccion from './PanelDeteccion.jsx';
import PanelResultado from './PanelResultado.jsx';

/**
 * Foto capturada o subida + análisis.
 * - Detección de varios objetos (Etapa 1 del escáner).
 * - Clasificación de la foto completa con CLIP (método de la Fase 2), como opción secundaria.
 */
export default function VistaFoto({ foto, deteccion, clasificacion, onRepetir, onArchivo }) {
  const [seleccionado, setSeleccionado] = useState(null);
  const res = deteccion.resultado;

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
