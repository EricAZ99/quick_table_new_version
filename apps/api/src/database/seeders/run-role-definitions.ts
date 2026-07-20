import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import { getEnv } from '../../config/env.js';
import { logger } from '../../logger/logger.js';
import { seedRoleDefinitions } from './roleDefinitions.seed.js';

/** Point d'entrée CLI (`pnpm --filter @quicktable/api seed:role-definitions`). */
async function main(): Promise<void> {
  const env = getEnv();
  await connectDatabase(env.MONGODB_URI);

  await seedRoleDefinitions();
  logger.info('roleDefinitions seedé avec succès');

  await disconnectDatabase();
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'échec du seed roleDefinitions');
  process.exit(1);
});
