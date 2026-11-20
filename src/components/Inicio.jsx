import BotonGaleria from './BotonGaleria.jsx';

export default function Inicio({ onAbrirCamara, onArchivo }) {
  return (
    <section className="inicio">
      <div className="inicio-ilustracion" aria-hidden="true">♻️</div>
      <h2>¿Qué residuo tienes?</h2>
      <p>
        Muéstrale el residuo a la cámara o sube una foto. Te ayudaremos a saber de qué material es
        y cómo separarlo.
      </p>

      <ol className="pasos">
        <li>Pon el residuo sobre una superficie despejada.</li>
        <li>Busca buena luz y acércate para que se vea completo.</li>
        <li>Toma la foto.</li>
      </ol>

      <div className="acciones-columna">
        <button type="button" className="boton boton-primario" onClick={onAbrirCamara}>
          📷 Abrir cámara
        </button>
        <BotonGaleria onArchivo={onArchivo} />
      </div>

      <p className="nota-privacidad">
        Al tomar o elegir una foto, se envía a EcoConecta para identificar los residuos.
      </p>
    </section>
  );
}
