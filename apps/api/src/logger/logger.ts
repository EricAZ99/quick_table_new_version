import pino, { type Logger } from 'pino';

/**
 * Logger structuré (doc 12 §12.8, doc 25 §25.2) : JSON, un événement par
 * ligne, jamais de `console.log`. `tenantId`/`userId` ne sont pas fixés ici
 * — ils seront ajoutés via `logger.child(...)` par les middlewares qui les
 * connaissent (tenant/auth, Epic 1), une fois ces informations disponibles
 * dans la chaîne de requête.
 */
const LEVEL_BY_NODE_ENV: Record<string, pino.LevelWithSilent> = {
  development: 'trace',
  test: 'silent',
  staging: 'info',
  production: 'info',
};

export function resolveLogLevel(nodeEnv: string): pino.LevelWithSilent {
  return LEVEL_BY_NODE_ENV[nodeEnv] ?? 'info';
}

// Lecture directe de `process.env.NODE_ENV` (pas `getEnv()`) : ce module est
// importé par les middlewares transverses, qui ne doivent pas déclencher la
// validation complète (et potentiellement fail-fast) de toute la
// configuration juste pour obtenir un niveau de log par défaut.
const nodeEnv = process.env.NODE_ENV ?? 'development';

export const logger: Logger = pino({
  level: resolveLogLevel(nodeEnv),
  base: { environment: nodeEnv },
  timestamp: pino.stdTimeFunctions.isoTime,
});
