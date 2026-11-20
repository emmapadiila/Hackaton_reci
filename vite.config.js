
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const movil = mode === 'movil';

  return {
    plugins: [
      react(),
      ...(movil ? [basicSsl()] : []),
    ],

    // Mantener el reconocimiento de IA con Web Workers.
    worker: {
      format: 'es',
    },

    // Evitar el preprocesamiento de Transformers.js.
    optimizeDeps: {
      exclude: ['@huggingface/transformers'],
    },

    server: {
      // Permitir conexión del celular en modo móvil.
      host: movil ? '0.0.0.0' : 'localhost',

      // Desarrollo normal: 5173.
      // Pruebas móviles HTTPS: 4174.
      port: movil ? 4174 : 5173,
      strictPort: true,

      // Evitar que Vite vigile los archivos bloqueados
      // del perfil de Chrome dentro de .eco-tools.
      watch: {
        ignored: [
          '**/.eco-tools',
          '**/.eco-tools/**',
        ],
      },

      // Mantener comunicación con FastAPI.
      proxy: {
        '/api': {
          target:
            process.env.ECO_API_PROXY ||
            'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
  };
});
