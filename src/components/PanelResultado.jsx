/**
 * Muestra el resultado REAL del modelo (o el error / "no reconocido").
 * Nunca presentamos datos inventados como si fueran una predicción.
 */
export default function PanelResultado({ resultado, analizando, progreso, onAnalizar }) {
  if (analizando) {
    const descargando = progreso && progreso.porcentaje < 100;
    return (
      <div className="panel-resultado" aria-live="polite" aria-busy="true">
        <div className="spinner" aria-hidden="true" />
        {descargando ? (
          <>
            <p>
              Descargando el modelo de IA… {Math.floor(progreso.porcentaje)} %
              <br />
              <span className="texto-suave-oscuro">
                {mb(progreso.cargado)} de {mb(progreso.total)} MB · solo la primera vez
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
          <p>Analizando imagen…</p>
        )}
      </div>
    );
  }

  if (!resultado) {
    return (
      <div className="panel-resultado">
        <button type="button" className="boton boton-primario" onClick={onAnalizar}>
          🔍 Analizar residuo
        </button>
        <p className="texto-suave-oscuro">
          La primera vez se descarga el modelo (~90 MB). Recomendado con Wi-Fi.
        </p>
      </div>
    );
  }

  if (resultado.estado === 'error') {
    return (
      <div className="panel-resultado aviso-error" role="alert">
        <h3>Ocurrió un error al analizar</h3>
        <p>{resultado.mensaje}</p>
        <button type="button" className="boton boton-secundario" onClick={onAnalizar}>
          Reintentar
        </button>
      </div>
    );
  }

  const reconocido = resultado.estado === 'reconocido';

  return (
    <div className={`panel-resultado ${reconocido ? '' : 'aviso-info'}`} role="status" aria-live="polite">
      {reconocido ? (
        <dl className="ficha">
          <Dato nombre="Material" valor={resultado.etiqueta} destacado />
          <Dato nombre="Confianza" valor={porcentaje(resultado.confianza)} />
          <Dato nombre="Grupo (provisional)" valor={resultado.categoria} />
          <Dato nombre="¿Aprovechable?" valor="Pendiente de validación" />
        </dl>
      ) : (
        <h3>No pudimos reconocer el residuo</h3>
      )}

      <p>{resultado.mensaje}</p>

      {resultado.alternativas?.length > 0 && (
        <div className="alternativas">
          <h4>Opciones más probables según el modelo</h4>
          <ul>
            {resultado.alternativas.map((a) => (
              <li key={a.etiqueta}>
                <span className="alternativa-nombre">{a.etiqueta}</span>
                <span className="alternativa-barra" aria-hidden="true">
                  <span style={{ width: `${Math.round(a.confianza * 100)}%` }} />
                </span>
                <span className="alternativa-valor">{porcentaje(a.confianza)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="detalle-modelo">
        Modelo: {resultado.modelo}
        {typeof resultado.tiempoMs === 'number' && ` · análisis en ${(resultado.tiempoMs / 1000).toFixed(1)} s`}
      </p>
    </div>
  );
}

function porcentaje(valor) {
  return typeof valor === 'number' ? `${Math.round(valor * 100)} %` : '—';
}

function mb(bytes) {
  return (bytes / 1e6).toFixed(0);
}

function Dato({ nombre, valor, destacado }) {
  return (
    <div className={`dato ${destacado ? 'dato-destacado' : ''}`}>
      <dt>{nombre}</dt>
      <dd>{valor || '—'}</dd>
    </div>
  );
}
