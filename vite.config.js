import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev`        -> http://localhost:5173 (la cámara funciona en localhost)
// `npm run dev:movil`  -> https://<IP-de-tu-PC>:5173 para probar desde el celular.
//    Los navegadores solo permiten la cámara en HTTPS (o en localhost),
//    por eso en modo "movil" se genera un certificado de desarrollo.
export default defineConfig(({ mode }) => {
  const movil = mode === 'movil';
  return {
    plugins: [react(), ...(movil ? [basicSsl()] : [])],
    // El reconocimiento corre en un Web Worker con módulos ES.
    worker: { format: 'es' },
    // Transformers.js carga su motor (ONNX/WASM) por su cuenta: no lo preprocesamos.
    optimizeDeps: { exclude: ['@huggingface/transformers'] },
    server: {
      host: movil ? true : 'localhost',
      port: 5173,
    },
  };
});
