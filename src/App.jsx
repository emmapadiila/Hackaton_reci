import { useEffect, useState } from 'react';
import Inicio from './components/Inicio.jsx';
import VistaCamara from './components/VistaCamara.jsx';
import VistaFoto from './components/VistaFoto.jsx';
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

  // Liberamos la memoria de la foto anterior cuando cambia o se descarta.
  useEffect(() => {
    if (!foto) return undefined;
    return () => URL.revokeObjectURL(foto.url);
  }, [foto]);

  const mostrarFoto = (blob, origen) => {
    setFoto({ blob, url: URL.createObjectURL(blob), origen });
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
            key={foto.url}
            foto={foto}
            onRepetir={abrirCamara}
            onArchivo={manejarArchivo}
          />
        )}
      </main>

      <footer className="pie">EcoConecta 360</footer>
    </div>
  );
}
