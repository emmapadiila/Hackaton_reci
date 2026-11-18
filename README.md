# Separa Bien — Reconocimiento de residuos con cámara

Prototipo para la hackatón de economía circular (Villas de San Pablo, Barranquilla).

**Estado actual: Fase 2.** Reconocimiento con un modelo **preentrenado** (CLIP ViT-B/32, clasificación zero-shot) que corre en el navegador. **No** es un modelo entrenado con residuos locales: su precisión debe medirse con fotos reales.

- Categorías **provisionales** (pendientes de validar): `src/services/reconocimiento/categorias.js`
- Si cambias las categorías o sus descripciones: `npm run generar-embeddings`
- La primera vez que se analiza una foto, el celular descarga ~89 MB (modelo) + ~27 MB (motor ONNX). Luego quedan en caché.
- La foto nunca sale del dispositivo.

## Requisitos
- Node.js 20 o superior (`node -v`)

## Ejecutar
```bash
npm install
npm run dev          # computador: http://localhost:5173
npm run dev:movil    # celular en la misma red Wi-Fi: https://<IP-del-PC>:5173
```
En el celular el navegador mostrará "conexión no segura" (el certificado es de desarrollo): toca *Configuración avanzada → Continuar*.

## Estructura
```
src/
  App.jsx                         flujo de pantallas: inicio → cámara → foto
  hooks/useCamera.js              permisos, stream y cambio de cámara
  utils/imagen.js                 captura de fotograma y validación de archivos
  services/reconocimiento/        ÚNICO punto de conexión con la IA (Fase 2 y 5)
  components/                     Inicio, VistaCamara, VistaFoto, PanelResultado, BotonGaleria
```
