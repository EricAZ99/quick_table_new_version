import { getRedisClient } from '../config/redis.js';
import { logger } from '../logger/logger.js';

/**
 * Cache des permissions résolues par membership (doc 26 §26.2,
 * `rbac:resolved:{membershipId}`, TTL 10 min) — évite de relire
 * `roleDefinitions` à chaque requête RBAC (doc 08 §8.7, `rbac.middleware.ts`).
 *
 * doc 26 §26.2 documente aussi une invalidation événementielle sur
 * `EmployeeRoleChanged` (doc 20, Event Bus) en complément du TTL —
 * volontairement pas implémentée ici : aucun endpoint de changement de
 * rôle n'existe encore (Feature 2.2, pas commencée), donc rien n'émet cet
 * événement à ce jour. TTL seul pour l'instant (l'une des deux options
 * documentées, la seule réellement constructible) ; à compléter par
 * l'invalidation événementielle quand Feature 2.2 existera — pire cas en
 * attendant : jusqu'à 10 min de latence avant qu'un changement de rôle ne
 * soit reflété, cohérent avec la même fenêtre déjà tolérée par
 * `permissionsVersion` côté Access Token (doc 07 §7.2, 15 min).
 *
 * Best-effort (doc 26 §26.6, "Redis n'est jamais une source de vérité...
 * le pire cas est un recalcul") : toute erreur Redis ici est journalisée
 * et traitée comme une absence de cache, jamais propagée — la vérification
 * RBAC elle-même retombe sur une lecture directe de `roleDefinitions`
 * (`rbac.middleware.ts`), jamais bloquée par une panne du cache.
 */
const TTL_SECONDS = 10 * 60;

function cacheKey(membershipId: string): string {
  return `rbac:resolved:${membershipId}`;
}

export async function getCachedPermissions(membershipId: string): Promise<string[] | null> {
  try {
    const raw = await getRedisClient().get(cacheKey(membershipId));
    return raw === null ? null : (JSON.parse(raw) as string[]);
  } catch (error) {
    logger.warn(
      { err: error, membershipId },
      'lecture du cache rbac:resolved échouée, recalcul direct depuis roleDefinitions',
    );
    return null;
  }
}

export async function setCachedPermissions(
  membershipId: string,
  permissions: string[],
): Promise<void> {
  try {
    await getRedisClient().set(cacheKey(membershipId), JSON.stringify(permissions), {
      EX: TTL_SECONDS,
    });
  } catch (error) {
    logger.warn({ err: error, membershipId }, 'écriture du cache rbac:resolved échouée, ignorée');
  }
}
