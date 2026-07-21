import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// Configuration minimale (doc 03 §3.2) — alias, plugins de build additionnels
// (code-splitting back-office/client QR, doc 11 §11.4) introduits au fil des
// tickets qui en ont réellement besoin.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Le backend (`apps/api`, port 3000 par défaut) n'a pas encore de
    // middleware CORS (doc 12 §12.4, pas construit) : un `fetch` direct
    // depuis le serveur de dev Vite (port différent) serait bloqué par le
    // navigateur. Ce proxy évite d'avoir à construire CORS juste pour le
    // dev local — les deux origines deviennent une seule du point de vue
    // du navigateur.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
  },
});
