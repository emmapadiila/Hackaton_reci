# ♻️ Separa Bien

**Aplicación web que reconoce residuos con la cámara del celular**, para apoyar la separación en la fuente y el aprovechamiento de residuos en la comunidad de **Villas de San Pablo (Barranquilla)** — hackatón de economía circular con la Fundación Santo Domingo.

La persona apunta la cámara a uno o varios residuos, toma una foto y la app intenta:

1. **Localizar cada objeto** en la foto (botellas, latas, papel, cartón, cáscaras…).
2. **Identificar su material** (reciclable u orgánico para compostaje).
3. Explicar **cómo separarlo** (cuando el catálogo esté validado con los recicladores y la huerta).

> **Es un prototipo.** El escáner en navegador usa modelos generales y un clasificador piloto. EcoConecta incorpora modelos entrenados con conjuntos públicos. Queda pendiente validar el rendimiento y las reglas de aceptación con la comunidad.

---

## Estado actual

| Parte | Estado |
|---|---|
| Cámara (frontal/trasera), captura, galería, diseño para celular | ✅ Funciona — probado en computador y celular |
| Clasificación de la foto completa con **CLIP** | ✅ Funciona — falta medir precisión con residuos reales |
| **Detección de varios objetos** con **OWL-ViT** + recuadros sobre la foto | ✅ Funciona técnicamente — **pendiente de probar con fotos de residuos reales** |
| Clasificar el material **de cada objeto** detectado (Etapa 2) | ⏳ Siguiente paso |
| Nueva interfaz de resultados con tarjetas y resumen (Etapa 3) | ⏳ Pendiente |
| Catálogo validado (qué se acepta y cómo separarlo) | ⏳ Pendiente de los responsables del proyecto |
| Clasificador piloto de recortes entrenado con fotos públicas de TACO | Disponible al seleccionar un objeto detectado |
| Modelo propio entrenado con fotos de la comunidad (Fases 3–4) | ⏳ Pendiente (aún no hay dataset local) |

---

## Inicio rápido

**Requisitos:** [Node.js](https://nodejs.org) 20 o superior (`node -v` para comprobar).

```bash
git clone https://github.com/emmapadiila/Hackaton_reci.git
cd Hackaton_reci
npm install
npm run dev
```

Abre **http://localhost:5173** en Chrome o Edge.

### Probar desde el celular

```bash
npm run dev:movil
```

1. El celular debe estar en la **misma red Wi-Fi** que el computador.
2. Abre la dirección `https://192.168.x.x:5173` que muestra la terminal (la que corresponde a tu Wi-Fi, no la de redes virtuales tipo `192.168.56.x`).
3. Aparecerá *"La conexión no es privada"*: es normal (certificado de desarrollo). Toca **Configuración avanzada → Continuar**.

> La cámara solo funciona en `https://` o en `localhost`; por eso existe `dev:movil`.
> No ejecutes `npm run dev` y `npm run dev:movil` a la vez si quieres evitar confusiones con el puerto 5173 (ver [problemas conocidos](docs/pruebas-y-problemas.md#problemas-conocidos-y-soluciones)).

### Primera vez que se analiza una foto

El navegador **descarga los modelos de IA una sola vez** y los guarda en caché (se recomienda Wi-Fi):

| Qué | Tamaño aprox. | Cuándo |
|---|---|---|
| Motor ONNX (WebAssembly) | 14 MB | Primer análisis |
| Detector OWL-ViT | 155 MB | Al tocar "Detectar residuos" |
| Clasificador CLIP (solo parte de imagen) | 89 MB | Al usar "Clasificar la foto completa" |

---

## Privacidad

- **EcoConecta envía la foto a FastAPI al tomarla o elegirla.** La pantalla muestra el reconocimiento y permite reintentar si falla la conexión.
- No se guardan fotos: se liberan de la memoria al tomar otra o salir.
- Lo único que se descarga de internet son los **modelos** (desde huggingface.co) y el **motor** (desde cdn.jsdelivr.net).

---

## Comandos

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor de desarrollo en el computador (`http://localhost:5173`) |
| `npm run dev:movil` | Servidor HTTPS accesible desde el celular en la red local |
| `npm run build` | Compila la versión de producción en `dist/` |
| `npm run preview` | Sirve localmente la versión compilada |
| `npm run generar-embeddings` | Recalcula los vectores de texto de CLIP. **Obligatorio** tras cambiar `categorias.js` |

---

## Estructura del proyecto

```
├── index.html                      Página base
├── vite.config.js                  Configuración de Vite (HTTPS para celular, worker)
├── scripts/
│   └── generar-embeddings.mjs      Precalcula los vectores de texto de CLIP (se corre en el PC)
├── docs/                           Documentación técnica
└── src/
    ├── App.jsx                     Flujo de pantallas: inicio → cámara → foto
    ├── styles.css                  Estilos (mobile-first, responsivo)
    ├── components/                 Piezas visuales
    │   ├── Inicio.jsx              Pantalla de bienvenida
    │   ├── VistaCamara.jsx         Cámara en vivo, disparador, cambio de cámara
    │   ├── VistaFoto.jsx           Foto + resultados
    │   ├── ImagenConRecuadros.jsx  Foto con recuadros en las coordenadas reales del detector
    │   ├── PanelDeteccion.jsx      Lista de objetos detectados (versión de verificación)
    │   ├── PanelResultado.jsx      Resultado de la clasificación de la foto completa
    │   └── BotonGaleria.jsx        Subir imagen desde la galería
    ├── hooks/
    │   ├── useCamera.js            Permisos, apertura y cambio de cámara (robusto entre celulares)
    │   └── useAnalisis.js          Estado de un análisis de IA (cargando, progreso, resultado)
    ├── utils/imagen.js             Captura de fotograma y validación de archivos
    └── services/reconocimiento/    ← TODA la inteligencia artificial está aquí
        ├── index.js                API pública: detectarObjetos(), analizarImagen()
        ├── ia.worker.js            Ejecuta los modelos en segundo plano (Web Worker)
        ├── config.js               Modelos y umbrales ajustables
        ├── categorias.js           Categorías de material PROVISIONALES
        ├── consultas-deteccion.js  Qué objetos busca el detector
        ├── clasificar.js           Matemática de CLIP (similitud → confianza)
        ├── detectar.js             Limpieza de cajas: duplicados, fondo, orden
        └── embeddings-texto.json   Vectores de texto precalculados (generado)
```

---

## Documentación

- 📐 **[Arquitectura y funcionamiento de la IA](docs/arquitectura.md)** — cómo se procesa una foto, qué modelos se usan y por qué, cómo cambiar categorías y umbrales.
- 🧪 **[Pruebas, limitaciones y problemas conocidos](docs/pruebas-y-problemas.md)** — cómo probar, qué medir, errores frecuentes y sus soluciones.

---

## Hoja de ruta

| Fase | Contenido | Estado |
|---|---|---|
| 1 | App web con cámara, galería e interfaz | ✅ |
| 2 | Reconocimiento con modelo preentrenado (CLIP) | ✅ |
| 2b – Etapa 1 | Detector de varios objetos (OWL-ViT) | ✅ técnico / ⏳ pruebas reales |
| 2b – Etapa 2 | Clasificar el material de cada objeto con CLIP | ⏳ |
| 2b – Etapa 3 | Interfaz moderna: recuadros, tarjetas, resumen, corrección | ⏳ |
| 2b – Etapa 4 | Pruebas con fotos de varios residuos (precisión, velocidad) | ⏳ |
| 3 | Recolectar y organizar fotos reales de residuos (dataset) | ⏳ |
| 4 | Entrenar un modelo propio | ⏳ |
| 5 | Integrar el modelo propio + catálogo validado | ⏳ |
| 6 | Pruebas con usuarios y dispositivos reales | ⏳ |

---

## Tecnologías

React 18 · Vite 6 · [Transformers.js](https://huggingface.co/docs/transformers.js) 4 (ONNX Runtime Web) · CLIP ViT-B/32 (OpenAI, MIT) · OWL-ViT B/32 (Google, Apache 2.0). Todo gratuito y de código abierto; no se usan servicios de pago.
## EcoConecta · clasificación y recolección

La cámara y la galería envían automáticamente la foto a `POST /api/ia/analizar-residuos`. YOLO propone cajas, el clasificador binario evalúa recortes y la visión contextual compara esos recortes con la escena. Cuando no hay candidatos, se omite la clasificación. La interfaz muestra un resultado con cajas normalizadas que se pueden tocar para ver cada objeto. Los modelos existentes del navegador siguen en el código y el endpoint anterior conserva su contrato.

El endpoint recibe `imagen`, más `descripcion` y `referencia` opcionales. Entrega JSON consolidado o eventos reales de avance en NDJSON con `Accept: application/x-ndjson`. El análisis usa las fotos en memoria y los resultados se mantienen en la vista hasta cambiar de foto. La solicitud almacena únicamente la dirección y las categorías confirmadas cuando la persona la registra.

### Configuración de análisis y solicitudes

- El análisis automático local requiere `ECO_LOCAL_MODELS=1` y autorización para ese entorno. Los pesos se cargan en FastAPI.
- Los pesos del detector de residuos y MobileNetV2 quedan en `models/`. Para contexto de objetos se puede habilitar el YOLO general existente mediante `ECO_CONTEXT`. Se usa exclusivamente como comprobación adicional de las cajas de residuos.
- Para el análisis automático instala `requirements-contexto.txt` y pon el ONNX de visión CLIP cuantizado en `models/clip_vision_q8.onnx` o señala su ruta mediante `ECO_CLIP_VISION`. Es el CLIP de 89 MB que ya empleaba el navegador. Los vectores adicionales de pared, techo, piso y mobiliario se regeneran con `node scripts/generar-contexto-eco.mjs` en un entorno autorizado.
- Esta copia almacenaba solicitudes en SQLite. Para usar PostgreSQL, instala `requirements-postgres.txt` y configura `ECO_DATABASE_URL` en el servidor. La API guarda las solicitudes en esa base cuando recibe la configuración. El despacho requiere conexión con un operador.
- Para el webhook de WhatsApp, reutiliza `eventos_analisis` de `api/main.py` con una imagen validada y la referencia de conversación. La función `resumir_whatsapp` de `api/residuos.py` convierte el mismo resultado en texto. El webhook y el envío requieren la conexión con el proveedor de WhatsApp.

### Pruebas del flujo consolidado

```sh
python -m unittest discover -s tests
python tests/validar_fotos_eco.py --url http://127.0.0.1:8002
node tests/validar_ui_eco.mjs
```

La prueba fotográfica registra fallos y fotos pendientes en `data/validacion-eco/informe.json`. Cuando TACO proporciona anotaciones, el informe incluye coincidencias de cajas a IoU ≥ 0,50 y cantidades sin coincidencia. Es una prueba de integración con ejemplos seleccionados. La prueba de interfaz requiere Chrome en modo de depuración local en el puerto 9225 y el frontend disponible en el puerto 4174.

En la prueba local, pared, techo, habitación vacía y foto borrosa devolvieron cero candidatos. La botella individual pasó de tres propuestas a una. Persistieron fallos en papel y cartón y en las dos latas anotadas. La escena de tres botellas frente a una pared quedó pendiente de una foto representativa. La prueba de Chrome a 390 px comprueba una petición automática por foto y la selección de cajas. El guardado en PostgreSQL se probó con una base temporal.

Las fotos de prueba se guardan en `data/validacion-eco/`. Se usaron miniaturas de [TACO](https://github.com/pedropro/TACO), incluida una con desenfoque añadido, y estas fotografías públicas:

- `oficina.jpg` y sus recortes de techo y pared. Ged Carroll, CC BY 2.0. [Empty office](https://commons.wikimedia.org/wiki/File:Empty_office.jpg)
- `botella.jpg`. Pranavshivakumar, CC BY-SA 3.0. [Water bottle 3](https://commons.wikimedia.org/wiki/File:Water_bottle_3.jpg)
- `botellas-mesa.jpg`. Max Braun, CC BY-SA 2.0. [Water PET bottles on the table](https://commons.wikimedia.org/wiki/File:Water_PET_bottles_on_the_table_(2442924762).jpg)
- `cascara.jpg`. Foto original de Priwo y recorte publicado en Commons. [Banane-A-05 cropped](https://commons.wikimedia.org/wiki/File:Banane-A-05_cropped.jpg)

### Base original y adaptación

El [notebook original](https://github.com/techSash/Waste-classification/blob/68339005d1d5f6e769c0ed15f58a9b7cd366edc7/WASTE%20CLASSIFIER%20WITH%20KERAS.ipynb) usa seis capas convolucionales de 32 y 64 filtros, max pooling, dropout, dos capas densas de 512 y una salida softmax. Carga imágenes de 60 × 30, aplica aumentación al entrenamiento y usa las carpetas O y R. El código archivado usa `adam(lr=…)`, `fit_generator`, `predict_classes` e `ImageDataGenerator`, APIs antiguas de Keras. La llamada de entrenamiento está comentada y reutilizaba TEST para validación. La salida guardada de predicción muestra una sola imagen.

La adaptación usa Keras moderno y conserva la arquitectura CNN. La compara con MobileNetV2 preentrenada en ImageNet y congelada. Ambas usan validación separada, aumentación solo durante entrenamiento y normalización dentro del modelo. El script decodifica las fotos, descarta coincidencias del contenido RGB reducido a 64 × 64 entre particiones y excluye duplicados con etiquetas contradictorias. Variantes con recortes o compresión distinta pueden requerir inspección adicional. El modelo final se elige por pérdida de validación y ambos se evalúan después en TEST.

### Entrenamiento y ejecución

Usa Python 3.12 y un entorno virtual. En Windows nativo TensorFlow moderno usa CPU. Para GPU de TensorFlow usa Colab o Linux/WSL2 con el entorno CUDA correspondiente. [Instalación de TensorFlow](https://www.tensorflow.org/install/pip)

```sh
python -m pip install -r requirements.txt
curl -fL https://www.kaggle.com/api/v1/datasets/download/techsash/waste-classification-data -o waste.zip
python waste_data.py waste.zip data/kaggle
python train.py --data data/kaggle
python evaluate.py
python predict.py ruta/foto.jpg
python -m uvicorn api.main:app --port 8000
```

En otra terminal ejecuta `npm run dev`, o usa `npm run build` y `npm run preview` para probar la compilación. Para el celular, usa `npm run dev:movil` y abre la dirección HTTPS del equipo. Vite redirige `/api` a FastAPI. En producción, dirige `/api` al backend en el mismo origen. El [notebook de Colab](notebooks/entrenamiento_colab.ipynb) ejecuta el mismo entrenamiento. La fuente pública de imágenes es el [dataset original de Kaggle](https://www.kaggle.com/datasets/techsash/waste-classification-data). Si el proveedor solicita acceso, descarga con tu cuenta autorizada y extrae el ZIP en `data/kaggle`.

Los artefactos quedan en `models/`: manifiesto, curvas, matrices de confusión, informes con precisión, exhaustividad y F1, comparación en JSON y el modelo final `ecoconecta_classifier.keras`. El umbral de revisión de 0.75 es operativo. La salida softmax requiere calibración con fotos de EcoConecta antes de interpretarse como probabilidad de acierto.

Para probar la API directamente, ejecuta `curl -F "imagen=@foto.jpg;type=image/jpeg" http://127.0.0.1:8000/api/ia/detectar`. Reinicia FastAPI después de reemplazar un modelo que ya esté cargado en memoria.

La corrida local auditó 25.077 imágenes del ZIP de Kaggle. Descartó 326 copias y el registro restante de un grupo con etiquetas opuestas. Quedaron 18.902 imágenes de entrenamiento, 3.335 de validación y 2.513 de prueba.

Ambos clasificadores entrenaron tres épocas en CPU. MobileNetV2 quedó como modelo final por su menor pérdida de validación (0,2105 frente a 0,4081). Resultados sobre las 2.513 fotos de prueba:

| Modelo | Acierto | Precisión macro | Exhaustividad macro | F1 macro |
| --- | ---: | ---: | ---: | ---: |
| CNN original adaptada | 84,64 % | 87,58 % | 82,97 % | 83,69 % |
| MobileNetV2 | 88,78 % | 90,12 % | 87,74 % | 88,35 % |

En el modelo final, la exhaustividad fue 96,79 % para orgánico y 78,69 % para aprovechable. Estos resultados corresponden a fotos completas de Kaggle. Queda por medir la clasificación de recortes que produce YOLO en escenas mixtas de la comunidad.

### Detección de múltiples residuos

```sh
git clone https://github.com/pedropro/TACO.git taco-dataset
python -m pip install -r requirements-yolo.txt requests
python taco-dataset/download.py --dataset_path taco-dataset/data/annotations.json
python train_yolo.py --prepare-only
python train_yolo.py
```

El script convierte las cajas verificadas de [TACO](https://github.com/pedropro/TACO) a formato YOLO y divide por lotes de fotos. También admite las miniaturas locales del piloto anterior. Entrena una clase de localización, **residuo**, y evalúa mAP en lotes reservados. FastAPI activa detección múltiple cuando encuentra `models/ecoconecta_yolo.pt`. Hasta entonces, ofrece clasificación de foto completa.

TACO contiene pocos ejemplos de restos de comida y carece de cajas separadas para muchas cáscaras, borra de café, hojas y residuos de cocina de la guía. Hacen falta fotos anotadas de esos objetos, en especial escenas mixtas de la comunidad, para comprobar la cobertura del detector y el rendimiento del clasificador sobre recortes.

**Piloto local de detección.** YOLOv8n entrenó cinco épocas en CPU con 143 imágenes de entrenamiento, 37 de validación y 41 de prueba. En prueba había 202 objetos anotados. Obtuvo mAP@0,50 de 21,6 %, mAP@0,50–0,95 de 11,6 %, precisión de 57,0 % y exhaustividad de 21,8 % en el punto de evaluación de Ultralytics. La exhaustividad del piloto es baja y estas métricas corresponden a TACO. Los pesos y el informe quedaron en `models/ecoconecta_yolo.pt` y `models/yolo_metricas.json`.
