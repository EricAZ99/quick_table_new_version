import { createClient, type RedisClientType } from 'redis';

/**
 * Point de connexion unique à Redis (doc 03 §3.3, doc 26). Même pattern que
 * `config/database.ts` : l'URL est prise en paramètre plutôt que lue via
 * `getEnv()` en interne (doc 14 §14.4, Dependency Inversion) — découple ce
 * module de la configuration globale et le rend testable sans `.env` réel.
 *
 * Redis n'étant jamais une source de vérité (doc 26 §26.6 — en cas de perte
 * totale, le pire cas est un recalcul/recache, jamais une perte de donnée
 * métier), on pourrait justifier de démarrer sans lui. Choix fait ici de
 * rester cohérent avec `connectDatabase` (fail-fast au boot, doc 12 §12.9) :
 * plus simple à raisonner, et une indisponibilité Redis non détectée au
 * déploiement est un risque opérationnel plus coûteux qu'un démarrage
 * bloqué à corriger immédiatement.
 */
let client: RedisClientType | undefined;

export async function connectRedis(url: string): Promise<RedisClientType> {
  client = createClient({ url });
  await client.connect();
  return client;
}

export function getRedisClient(): RedisClientType {
  if (!client) {
    throw new Error('Client Redis non initialisé — connectRedis() doit être appelé au démarrage.');
  }
  return client;
}

export async function disconnectRedis(): Promise<void> {
  await client?.quit();
  client = undefined;
}
