import type { Request } from 'express';

import { ValidationError } from '../errors/index.js';

/**
 * Extrait `req.context.tenantId` pour un endpoint métier tenant-scoped
 * (jamais une route platform-admin, doc 06 §6.3) — `tenantId` ne peut être
 * `null` ici que si un super_admin sans restaurant actif appelle
 * directement l'endpoint, cas rejeté explicitement en 400 plutôt que de
 * laisser `null` remonter jusqu'à `BaseRepository` (qui exige une
 * `string`, doc 06 §6.4). Réutilise le même code `TENANT_CONTEXT_REQUIRED`
 * que `tenant.middleware.ts` (même situation : aucun tenant actif résolu).
 *
 * Extrait de `hello-world.controller.ts` (Feature 1.3) vers ici après un
 * second quasi-doublon dans `restaurants.controller.ts` (Feature 2.1) —
 * même précédent que `createRedisRateLimiter` (extrait après un 2ᵉ
 * doublon plutôt qu'anticipé).
 */
export function requireTenantContext(req: Request): string {
  const tenantId = req.context?.tenantId;
  if (!tenantId) {
    throw new ValidationError(
      'TENANT_CONTEXT_REQUIRED',
      'Aucun restaurant actif sélectionné — veuillez en choisir un.',
    );
  }
  return tenantId;
}
