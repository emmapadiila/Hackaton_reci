# ♻️ Separa Bien

**Aplicación web que reconoce residuos con la cámara del celular**, para apoyar la separación en la fuente y el aprovechamiento de residuos en la comunidad de **Villas de San Pablo (Barranquilla)** — hackatón de economía circular con la Fundación Santo Domingo.

La persona apunta la cámara a uno o varios residuos, toma una foto y la app intenta:

1. **Localizar cada objeto** en la foto (botellas, latas, papel, cartón, cáscaras…).
2. **Identificar su material** (reciclable u orgánico para compostaje).
3. Explicar **cómo separarlo** (cuando el catálogo esté validado con los recicladores y la huerta).

> ⚠️ **Es un prototipo.** Usa modelos de IA **preentrenados y generales** (no entrenados con residuos de la comunidad). Sus resultados son aproximados y **todavía no se ha medido su precisión con residuos reales**. Las categorías y reglas de aceptación están **pendientes de validar**.

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

- **Las fotos nunca salen del dispositivo.** Los modelos se ejecutan dentro del navegador.
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
