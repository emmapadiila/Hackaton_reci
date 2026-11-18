# Pruebas, limitaciones y problemas conocidos

- [1. Qué se ha probado y qué no](#1-qué-se-ha-probado-y-qué-no)
- [2. Cómo probar la app](#2-cómo-probar-la-app)
- [3. Protocolo de prueba de la detección (Etapa 1)](#3-protocolo-de-prueba-de-la-detección-etapa-1)
- [4. Protocolo de prueba de la clasificación](#4-protocolo-de-prueba-de-la-clasificación)
- [5. Limitaciones conocidas](#5-limitaciones-conocidas)
- [6. Problemas conocidos y soluciones](#problemas-conocidos-y-soluciones)
- [7. Flujo de trabajo con Git](#7-flujo-de-trabajo-con-git)

---

## 1. Qué se ha probado y qué no

| Prueba | Resultado |
|---|---|
| Cámara trasera se abre automáticamente (celular) | ✅ Confirmado por el equipo |
| Cambio frontal ↔ trasera (celular) | ✅ Confirmado |
| Tomar foto, repetir, subir desde galería | ✅ Confirmado |
| Diseño responsivo vertical y horizontal (celular) | ✅ Confirmado |
| CLIP y OWL-ViT cargan y responden en Chrome (computador) | ✅ Verificado con una foto pública de prueba |
| Filtro de duplicados / fondo / cajas pequeñas | ✅ Verificado con casos de lógica |
| **Precisión** de la detección con residuos reales | ❌ **Sin probar** |
| **Precisión** de la clasificación con residuos reales | ❌ **Sin probar** |
| **Velocidad y memoria** de los modelos en celulares | ❌ **Sin medir** |

### Resultado de referencia (foto pública de dos gatos, sin residuos)

- **OWL-ViT** con las 22 consultas de residuos: marcó la manta rosada como *"bolsa plástica"* (puntuación 0,14) cubriendo toda la foto → la app la muestra con la advertencia **"podría ser el fondo"**. Ejemplo de por qué no hay que confiar ciegamente en el detector.
- **CLIP** (foto completa): *Cartón 41 %, Ningún residuo 37 %* → por debajo del umbral → **"no reconocido"** (correcto).
- Con una **imagen gris vacía**, CLIP se inclina hacia "papel" (41 %): vigilar este sesgo con fondos lisos.

---

## 2. Cómo probar la app

### En el computador
```bash
npm run dev
```
Abrir http://localhost:5173 (Chrome o Edge).

### En el celular
```bash
npm run dev:movil
```
Abrir la dirección `https://192.168.x.x:5173` de la terminal desde el celular (misma red Wi-Fi) y aceptar el aviso del certificado.

### Checklist rápido
- [ ] Abre la cámara **trasera** y la etiqueta dice "Cámara trasera".
- [ ] 🔄 cambia a la frontal (imagen en espejo) y vuelve.
- [ ] El botón verde toma la foto; "Tomar otra foto" vuelve a la trasera.
- [ ] "Subir desde galería" funciona.
- [ ] "🔍 Detectar residuos en la foto" muestra la barra de descarga (1.ª vez) y luego los recuadros.
- [ ] Tocar un recuadro lo resalta y marca el elemento en la lista (y viceversa).
- [ ] Al girar el celular, los recuadros siguen sobre los objetos.

---

## 3. Protocolo de prueba de la detección (Etapa 1)

Tomar **5–8 fotos** de este tipo:

1. 3–5 residuos **distintos y separados** sobre fondo liso.
2. **Varios iguales** (p. ej. 2 botellas, 3 hojas) → ¿los cuenta por separado?
3. **Cáscaras de fruta** (lo más difícil para el detector).
4. Residuos **amontonados o superpuestos**.
5. Una foto **sin residuos** (pared, mesa vacía).

Registrar en una tabla:

| Foto | Residuos reales | Recuadros correctos | Residuos sin recuadro | Recuadros sobrantes / duplicados | Tiempo | Celular |
|---|---|---|---|---|---|---|
| 1 | 2 botellas, 1 lata, 1 cáscara | | | | | |

Con esos datos se ajustan `UMBRAL_DETECCION`, `IOU_DUPLICADOS` y las consultas.

---

## 4. Protocolo de prueba de la clasificación

Con **20–30 residuos reales** (2–4 por categoría), uno por foto, con luz y fondos variados (abrir el desplegable *"Clasificar la foto completa"*):

| # | Residuo real | Resultado del modelo | Confianza | ¿Acertó? | Tiempo | Luz / fondo |
|---|---|---|---|---|---|---|
| 1 | Botella PET de gaseosa | | | | | |

Incluir 2–3 fotos **sin residuo** para comprobar que responde "no reconocido".

---

## 5. Limitaciones conocidas

- **Modelos generales:** no fueron entrenados con residuos de Villas de San Pablo. Pueden confundir **PET con otros plásticos**, **vidrio transparente con plástico**, o **cartón con papel**. Residuos sucios, aplastados o mezclados son más difíciles.
- **Cáscaras y orgánicos:** el detector puede no encontrarlos, sobre todo si son pequeños o están revueltos.
- **Objetos superpuestos:** pueden fusionarse en una sola caja o perderse.
- **Fondos lisos o telas:** pueden confundirse con papel o bolsa plástica.
- **Descarga inicial grande** (~170 MB para detectar; ~90 MB más para clasificar la foto completa).
- **Memoria:** en celulares de gama baja el navegador podría cerrar el proceso de IA. La app muestra *"posible falta de memoria"* y se puede reintentar.
- **Velocidad:** la detección tarda segundos en computador; en celular puede tardar bastante más (sin medir).
- **Reconocimiento en tiempo real** (sin tomar foto): no implementado; se evaluará cuando la detección sobre foto funcione bien y se conozca el rendimiento en celulares.

---

## Problemas conocidos y soluciones

### `Could not find an implementation for Cast(13) node with name '/class_head/Cast'`
**Causa:** la compilación "asyncify" del motor ONNX no soporta una operación de OWL-ViT.
**Solución (ya aplicada):** `ia.worker.js` fuerza la compilación WASM estándar. Si reaparece tras actualizar `@huggingface/transformers`, revisar que ese bloque siga presente. Ver [arquitectura §10.3](arquitectura.md#103-motor-onnx-estándar-en-vez-de-asyncify).
Tras actualizar el código, recargar con **Ctrl + Shift + R**.

### "Clasificar la foto completa" falla con el mismo error que el detector
**Causa:** Transformers.js encadena las cargas de modelos; si una falla, las siguientes heredan el error.
**Solución (ya aplicada):** el worker se reinicia tras un fallo de carga. Basta con tocar "Reintentar".

### El celular no abre la página
- Verificar que esté en la **misma red Wi-Fi** (no datos móviles).
- La **IP del computador puede cambiar** (p. ej. al reiniciar el router): volver a mirar la dirección que imprime `npm run dev:movil`.
- Usar la IP de la red Wi-Fi, no la de adaptadores virtuales (`192.168.56.x`).
- Si sigue fallando, permitir **Node.js** en el Firewall de Windows.

### La cámara no pide permiso / no abre
- La dirección debe empezar por **`https://`** (o ser `localhost`).
- Si se negó el permiso: candado de la barra de direcciones → Permisos → Cámara → Permitir, y recargar.
- Cerrar otras apps que usen la cámara (videollamadas, otras pestañas).

### `ERR_SSL_PROTOCOL_ERROR` en `https://localhost:5173`
Hay **dos servidores** en el puerto 5173: `npm run dev` (HTTP en `localhost`) y `npm run dev:movil` (HTTPS en la red). En el computador usar **`http://localhost:5173`**; en el celular, la dirección `https://192.168.x.x:5173`. O detener uno de los dos (Ctrl + C).

### "Las categorías cambiaron y los vectores de texto están desactualizados"
Se editó `categorias.js` sin regenerar los vectores. Ejecutar `npm run generar-embeddings` y hacer commit de `embeddings-texto.json`.

### La descarga del modelo no avanza o falla
Revisar conexión a internet (primera vez). Algunas redes bloquean `huggingface.co` o `cdn.jsdelivr.net`. Una vez descargados, quedan en caché.

---

## 7. Flujo de trabajo con Git

Repositorio: https://github.com/emmapadiila/Hackaton_reci (rama `main`).

```bash
git pull                           # traer cambios del equipo
# … trabajar …
git add -A
git commit -m "Descripción clara del cambio"
git push
```

- No se suben `node_modules/` ni `dist/` (están en `.gitignore`); quien clone el proyecto ejecuta `npm install`.
- Si cambias `categorias.js`, sube también `embeddings-texto.json`.
- **Aviso:** el historial de `main` se reescribió una vez (18/11/2026). Si alguien clonó antes de esa fecha, debe sincronizar con:
  ```bash
  git fetch origin
  git reset --hard origin/main     # ⚠️ descarta cambios locales sin commit
  ```
