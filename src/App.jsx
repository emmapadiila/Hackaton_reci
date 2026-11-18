import { useEffect, useState } from 'react';
import Inicio from './components/Inicio.jsx';
import VistaCamara from './components/VistaCamara.jsx';
import VistaFoto from './components/VistaFoto.jsx';
import { useAnalisis } from './hooks/useAnalisis.js';
import { analizarImagen, detectarObjetos } from './services/reconocimiento/index.js';
import { validarArchivoImagen } from './utils/imagen.js';

/**
 * Flujo de la aplicación:
 *   inicio  ->  camara  ->  foto (vista previa + análisis)
 *      \______________________/  (también se puede ir directo con una imagen de galería)
 */
export default function App() {
  const [vista, setVista] = useState('inicio'); // 'inicio' | 'camara' | 'foto'
  const [foto, setFoto] = useState(null); // { blob, url, origen: 'camara' | 'galeria' }
  const [aviso, setAviso] = useState(null);

  const deteccion = useAnalisis(detectarObjetos); // varios objetos (escáner)
  const clasificacion = useAnalisis(analizarImagen); // foto completa (Fase 2)

  // Liberamos la memoria de la foto anterior cuando cambia o se descarta.
  useEffect(() => {
    if (!foto) return undefined;
    return () => URL.revokeObjectURL(foto.url);
  }, [foto]);

  const reiniciarAnalisis = () => {
    deteccion.reiniciar();
    clasificacion.reiniciar();
  };

  const mostrarFoto = (blob, origen) => {
    setFoto({ blob, url: URL.createObjectURL(blob), origen });
    reiniciarAnalisis();
    setAviso(null);
    setVista('foto');
  };

  const manejarArchivo = (archivo) => {
    const error = validarArchivoImagen(archivo);
    if (error) {
      setAviso(error);
      return;
    }
    mostrarFoto(archivo, 'galeria');
  };

  const abrirCamara = () => {
    setAviso(null);
    setFoto(null);
    reiniciarAnalisis();
    setVista('camara');
  };

  return (
    <div className="app">
      <header className="encabezado">
        <h1>
          <span aria-hidden="true">♻️</span> Separa Bien
        </h1>
        <p>Villas de San Pablo · Barranquilla</p>
      </header>

      <main className="contenido">
        {aviso && (
          <p className="mensaje-error" role="alert">
            {aviso}
          </p>
        )}

        {vista === 'inicio' && <Inicio onAbrirCamara={abrirCamara} onArchivo={manejarArchivo} />}

        {vista === 'camara' && (
          <VistaCamara
            onCaptura={(blob) => mostrarFoto(blob, 'camara')}
            onArchivo={manejarArchivo}
            onVolver={() => setVista('inicio')}
          />
        )}

        {vista === 'foto' && foto && (
          <VistaFoto
            foto={foto}
            deteccion={deteccion}
            clasificacion={clasificacion}
            onRepetir={abrirCamara}
            onArchivo={manejarArchivo}
          />
        )}
      </main>

      <footer className="pie">Prototipo · Escáner de varios residuos · Etapa 1: detección</footer>
    </div>
  );
}
