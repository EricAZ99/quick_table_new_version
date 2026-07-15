import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { getEnv } from './config/env.js';
import { connectRedis } from './config/redis.js';
import { logger } from './logger/logger.js';

/**
 * Point d'entrée process de l'API.
 *
 * MongoDB et Redis sont connectés avant d'accepter du trafic HTTP —
 * cohérent avec le fail-fast de `config/env.ts` : mieux vaut un process qui
 * refuse de démarrer qu'une API qui répond alors qu'une dépendance est
 * injoignable (doc 12 §12.9). Utilise désormais le logger structuré (doc
 * 12 §12.8, disponible depuis ce ticket de la Feature 0.3) plutôt que
 * `console.log`.
 */
const env = getEnv();

async function main(): Promise<void> {
  await connectDatabase(env.MONGODB_URI);
  await connectRedis(env.REDIS_URL);

  const app = createApp();

  app.listen(env.PORT, () => {
    // `environment` est déjà attaché à chaque ligne de log (logger.ts, `base`).
    logger.info({ port: env.PORT }, 'quicktable-api démarré');
  });
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'échec du démarrage de quicktable-api');
  process.exit(1);
});
