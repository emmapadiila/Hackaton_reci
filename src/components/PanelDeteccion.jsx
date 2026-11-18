import { colorObjeto } from './ImagenConRecuadros.jsx';

const NOMBRE_MODELO = { detector: 'detector de objetos', clasificador: 'clasificador de materiales' };

/** Estado de carga compartido: descarga del modelo o análisis en curso. */
export function IndicadorCarga({ progreso, textoAnalisis = 'Analizando imagen…', nota }) {
  const descargando = progreso && progreso.porcentaje < 100;
  return (
    <div className="panel-resultado" aria-live="polite" aria-busy="true">
      <div className="spinner" aria-hidden="true" />
      {descargando ? (
        <>
          <p>
            Descargando el {NOMBRE_MODELO[progreso.modelo] ?? 'modelo de IA'}… {Math.floor(progreso.porcentaje)} %
            <br />
            <span className="texto-suave-oscuro">
              {(progreso.cargado / 1e6).toFixed(0)} de {(progreso.total / 1e6).toFixed(0)} MB · solo la primera vez
            </span>
          </p>
          <div
            className="barra-progreso"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.floor(progreso.porcentaje)}
          >
            <span style={{ width: `${progreso.porcentaje}%` }} />
          </div>
        </>
      ) : (
        <>
          <p>{textoAnalisis}</p>
          {nota && <p className="texto-suave-oscuro">{nota}</p>}
        </>
      )}
    </div>
  );
}

/**
 * ETAPA 1 (verificación): lista simple de lo que encontró el detector.
 * El diseño final con tarjetas llegará en la Etapa 3.
 */
export default function PanelDeteccion({ resultado, cargando, progreso, seleccionado, onSeleccionar, onDetectar }) {
  if (cargando) {
    return (
      <IndicadorCarga
        progreso={progreso}
        textoAnalisis="Buscando objetos en la foto…"
        nota="En celulares puede tardar varios segundos."
      />
    );
  }

  if (!resultado) {
    return (
      <div className="panel-resultado">
        <button type="button" className="boton boton-primario" onClick={onDetectar}>
          🔍 Detectar residuos en la foto
        </button>
        <p className="texto-suave-oscuro">
          La primera vez se descarga el detector (~155 MB). Recomendado con Wi-Fi.
        </p>
      </div>
    );
  }

  if (resultado.estado === 'error') {
    return (
      <div className="panel-resultado aviso-error" role="alert">
        <h3>Ocurrió un error al detectar</h3>
        <p>{resultado.mensaje}</p>
        <button type="button" className="boton boton-secundario" onClick={onDetectar}>
          Reintentar
        </button>
      </div>
    );
  }

  const { objetos, descartados } = resultado;

  return (
    <div className={`panel-resultado ${objetos.length ? '' : 'aviso-info'}`} role="status" aria-live="polite">
      <h3>{resultado.mensaje}</h3>

      {objetos.length > 0 && (
        <ul className="lista-detecciones">
          {objetos.map((o) => (
            <li key={o.numero}>
              <button
                type="button"
                className={`item-deteccion ${seleccionado === o.numero ? 'item-activo' : ''}`}
                onClick={() => onSeleccionar(seleccionado === o.numero ? null : o.numero)}
                aria-pressed={seleccionado === o.numero}
              >
                <span className="numero-objeto" style={{ background: colorObjeto(o.numero) }}>
                  {o.numero}
                </span>
                <span className="item-texto">
                  Parece: <strong>{o.descripcion}</strong>
                  <small>Puntuación del detector: {o.puntuacion.toFixed(2)}</small>
                  {o.posibleFondo && (
                    <small className="advertencia-fondo">
                      ⚠️ Ocupa casi toda la foto: podría ser el fondo y no un residuo.
                    </small>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="detalle-modelo">
        {resultado.modelo} · {(resultado.tiempoMs / 1000).toFixed(1)} s · cajas del detector: {resultado.cajasCrudas}
        {descartados && (
          <>
            {' '}
            · descartadas: {descartados.duplicados} duplicadas, {descartados.fondo} de fondo, {descartados.pequenos}{' '}
            muy pequeñas{descartados.exceso ? `, ${descartados.exceso} por exceso` : ''}
          </>
        )}
        <br />
        La puntuación del detector no es un porcentaje de certeza. El material de cada objeto se identificará en la
        siguiente etapa.
      </p>
    </div>
  );
}
