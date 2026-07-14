import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { getEnv } from './config/env.js';

/**
 * Point d'entrée process de l'API.
 *
 * La connexion MongoDB est établie avant d'accepter du trafic HTTP —
 * cohérent avec le fail-fast de `config/env.ts` : mieux vaut un process qui
 * refuse de démarrer qu'une API qui répond alors que la base est
 * injoignable.
 */
const env = getEnv();

async function main(): Promise<void> {
  await connectDatabase(env.MONGODB_URI);

  const app = createApp();

  app.listen(env.PORT, () => {
    // Remplacé par le logger structuré pino (doc 12 §12.8) dès la Feature 0.3.
    // eslint-disable-next-line no-console -- pas de logger structuré avant la Feature 0.3
    console.log(`[quicktable-api] démarré sur le port ${env.PORT} (${env.NODE_ENV})`);
  });
}

main().catch((error: unknown) => {
  console.error('[quicktable-api] échec du démarrage :', error);
  process.exit(1);
});
