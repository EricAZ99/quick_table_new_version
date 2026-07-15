import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import { getEnv } from '../../config/env.js';
import { logger } from '../../logger/logger.js';
import { seedCountryDefaults } from './countryDefaults.seed.js';

/** Point d'entrée CLI (`pnpm --filter @quicktable/api seed:country-defaults`). */
async function main(): Promise<void> {
  const env = getEnv();
  await connectDatabase(env.MONGODB_URI);

  await seedCountryDefaults();
  logger.info('countryDefaults seedé avec succès');

  await disconnectDatabase();
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'échec du seed countryDefaults');
  process.exit(1);
});
