/**
 * Muestra la foto con un recuadro por cada objeto detectado.
 *
 * Las cajas llegan en píxeles de la imagen ORIGINAL (ancho × alto). Las
 * convertimos a porcentajes del contenedor, que tiene exactamente el tamaño
 * con que se dibuja la foto; así los recuadros siguen en su lugar aunque la
 * imagen cambie de tamaño (girar el celular, otra pantalla…).
 */
import { useState } from 'react';

const COLORES =['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0aa1a1', '#d4a017', '#c2185b'];

export function colorObjeto(numero) {
  return COLORES[(numero - 1) % COLORES.length];
}

export default function ImagenConRecuadros({ url, ancho, alto, objetos = [], seleccionado, onSeleccionar }) {
  // Proporción real de la foto: el contenedor la copia para que NO haya franjas
  // vacías alrededor de la imagen (si las hubiera, los recuadros se desplazarían).
  const [proporcion, setProporcion] = useState(null);

  return (
    <div className="lienzo-foto" style={proporcion ? { '--proporcion': proporcion } : undefined}>
      <img
        src={url}
        alt="Fotografía analizada con los objetos detectados marcados"
        onLoad={(e) => setProporcion(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
      />
      {ancho > 0 &&
        alto > 0 &&
        objetos.map((o) => {
          const activo = seleccionado === o.numero;
          return (
            <button
              key={o.numero}
              type="button"
              className={`recuadro ${activo ? 'recuadro-activo' : ''} ${seleccionado && !activo ? 'recuadro-tenue' : ''}`}
              style={{
                left: `${(o.caja.x / ancho) * 100}%`,
                top: `${(o.caja.y / alto) * 100}%`,
                width: `${(o.caja.ancho / ancho) * 100}%`,
                height: `${(o.caja.alto / alto) * 100}%`,
                '--color': colorObjeto(o.numero),
              }}
              onClick={() => onSeleccionar?.(activo ? null : o.numero)}
              aria-pressed={activo}
              aria-label={`Objeto ${o.numero}: ${o.descripcion}`}
            >
              <span className="recuadro-etiqueta">{o.numero}</span>
            </button>
          );
        })}
    </div>
  );
}
