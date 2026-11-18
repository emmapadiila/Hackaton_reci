import { useRef } from 'react';

/**
 * Botón que abre el selector de archivos / galería del dispositivo.
 * No usamos el atributo `capture` para que el celular ofrezca la galería
 * (y no solo la cámara).
 */
export default function BotonGaleria({ onArchivo, className = 'boton boton-secundario', children }) {
  const inputRef = useRef(null);

  const alCambiar = (evento) => {
    const archivo = evento.target.files?.[0];
    evento.target.value = ''; // permite elegir el mismo archivo dos veces seguidas
    if (archivo) onArchivo(archivo);
  };

  return (
    <>
      <button type="button" className={className} onClick={() => inputRef.current?.click()}>
        {children ?? '🖼️ Subir desde galería'}
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={alCambiar} />
    </>
  );
}
