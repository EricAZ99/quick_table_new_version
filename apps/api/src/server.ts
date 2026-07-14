import { createApp } from './app.js';
import { getEnv } from './config/env.js';

/**
 * Point d'entrée process de l'API.
 */
const env = getEnv();
const app = createApp();

app.listen(env.PORT, () => {
  // Remplacé par le logger structuré pino (doc 12 §12.8) dès la Feature 0.3.
  // eslint-disable-next-line no-console -- pas de logger structuré avant la Feature 0.3
  console.log(`[quicktable-api] démarré sur le port ${env.PORT} (${env.NODE_ENV})`);
});
