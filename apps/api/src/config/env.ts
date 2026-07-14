import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

/**
 * Chemin absolu vers `.env` à la racine du monorepo (ADR 0012, doc 03 §3.1)
 * — ancré sur l'emplacement de ce fichier (`import.meta.dirname`), pas sur
 * le `cwd` du process : `pnpm --filter @quicktable/api dev` (et le script
 * `dev` racine, qui l'appelle) exécutent avec `cwd = apps/api`, où `.env`
 * n'existe pas. `src/config/` (dev, tsx) et `dist/config/` (prod, tsc)
 * sont tous les deux à trois niveaux de la racine du monorepo.
 */
const ENV_FILE_PATH = resolve(import.meta.dirname, '../../../../.env');

/**
 * Schéma de configuration de l'API (doc 12 §12.9) — fail-fast : toute
 * variable manquante ou mal typée empêche le démarrage du process.
 *
 * `MONGODB_URI`/`REDIS_URL` sont validées ici alors que leurs consommateurs
 * (`config/database.ts`, `config/redis.ts`) arrivent séparément : le
 * livrable de la Feature 0.2 est que l'infrastructure provisionnée soit
 * "accessible depuis le code applicatif" (CHECKLIST-DEVELOPPEMENT.md), ce
 * que la validation typée satisfait sans construire de client dont rien ne
 * dépend encore.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI est requis'),
  REDIS_URL: z.string().min(1, 'REDIS_URL est requis'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valide `source` contre le schéma de configuration.
 *
 * Fonction pure (aucun accès à `process.env`/`process.exit`) pour rester
 * testable unitairement sans déclencher le chargement réel de `.env`.
 */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(racine)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration invalide, arrêt du démarrage :\n${details}`);
  }
  return result.data;
}

let cachedEnv: Env | undefined;

/**
 * Charge puis valide la configuration du process (mémoïsé — une seule
 * lecture de `.env`/`process.env` par run). Volontairement paresseuse
 * plutôt qu'un `export const` évalué au chargement du module : importer
 * `parseEnv` pour le tester ne doit pas déclencher la lecture de `.env`
 * ni la validation du `process.env` réel (doc 14 §14.6, tests unitaires
 * indépendants de l'environnement d'exécution).
 *
 * `.env` n'existe qu'en développement local (ADR 0012) — en
 * staging/production, les variables sont injectées directement par la
 * plateforme d'hébergement (Railway), jamais via un fichier (doc 13
 * §13.8bis).
 */
export function getEnv(): Env {
  if (!cachedEnv) {
    if (existsSync(ENV_FILE_PATH)) {
      process.loadEnvFile(ENV_FILE_PATH);
    }
    cachedEnv = parseEnv(process.env);
  }
  return cachedEnv;
}
