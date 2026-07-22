import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { MembershipRole } from '../database/models/membership.model.js';
import { RoleDefinitionModel } from '../database/models/roleDefinition.model.js';
import { ForbiddenError, UnauthorizedError } from '../shared/errors/index.js';
import { getCachedPermissions, setCachedPermissions } from './rbacPermissionsCache.js';

const FORBIDDEN_MESSAGE = "Vous n'avez pas la permission requise pour effectuer cette action.";

/**
 * Résolution rôle + `permissionsOverrides` (cache Redis best-effort inclus,
 * doc 26 §26.2) — extraite de `requirePermissionAsync` (Feature 2.2, 2ᵉ
 * consommateur réel : `employees.service.ts` en a besoin pour décider de
 * l'exposition de `salary` sans bloquer toute la requête comme le ferait
 * `requirePermission`, même précédent que `createRedisRateLimiter`/
 * `requireTenantContext` — extraction après un 2ᵉ besoin, pas anticipée).
 */
export async function resolvePermissions(
  role: MembershipRole,
  membershipId: string,
  permissionsOverrides: string[],
): Promise<string[]> {
  const cached = await getCachedPermissions(membershipId);
  if (cached) {
    return cached;
  }

  const roleDefinition = await RoleDefinitionModel.findOne({
    roleCode: role,
    isCurrent: true,
  }).lean();

  const resolvedPermissions = [
    ...new Set([...(roleDefinition?.permissions ?? []), ...permissionsOverrides]),
  ];
  await setCachedPermissions(membershipId, resolvedPermissions);
  return resolvedPermissions;
}

/**
 * Middleware RBAC (doc 08 §8.7) : la permission requise est un paramètre
 * de route (`requirePermission('orders:cancel')`), déclarée directement
 * dans `*.routes.ts` — jamais cachée dans un controller, pour rester
 * visible et grep-able.
 *
 * Vérification à trois niveaux de doc 08 §8.1 — niveaux 1 et 3 couverts
 * ici : "le rôle possède-t-il la permission" (`roleDefinitions`, doc 22
 * §22.4) **ou** "un override du membership l'accorde-t-il"
 * (`req.context.permissionsOverrides`, déjà résolu par
 * `resolveTenant`/`tenant.middleware.ts` — pas de seconde requête
 * `memberships` ici). Le résultat combiné (`resolvedPermissions`) est mis
 * en cache par `rbacPermissionsCache.ts` (`rbac:resolved:{membershipId}`,
 * doc 26 §26.2) pour éviter de relire `roleDefinitions` à chaque requête —
 * best-effort, une panne Redis retombe silencieusement sur une lecture
 * directe. Overrides **ajouts uniquement** pour le MVP (décision validée
 * avec toi, voir `tenant.middleware.ts` §TenantContext) : le schéma
 * `permissionsOverrides: string[]` (doc 05) n'a aucune convention
 * documentée pour encoder un retrait, alors que doc 08 §8.1 en évoque un —
 * signalé, non implémenté. Le niveau 2 (feature gating par abonnement,
 * doc 08 §8.6) reste hors périmètre de toute la Feature 1.4 :
 * `subscriptions` n'existe pas encore (Feature 2.1).
 *
 * **Comportement `super_admin` (décision validée avec toi)** : bypass
 * automatique uniquement pour les permissions `platform:*` (doc 08 §8.4,
 * "possède implicitement toutes les permissions platform:*"). Pour toute
 * permission tenant, un super_admin est traité comme n'importe quel
 * utilisateur (son `role` est généralement `null`, faute de membership,
 * donc refusé) — l'"accès lecture seule cross-tenant à des fins de
 * support" évoqué par doc 08 §8.4 reste un mécanisme séparé, non construit
 * ici : aucune route ne le consomme encore, et sa mécanique concrète
 * n'est décrite nulle part ailleurs dans la doc.
 */
export function requirePermission(permission: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    requirePermissionAsync(permission, req, res, next).catch(next);
  };
}

/** Exportée séparément pour être `await`ée directement dans les tests unitaires — `requirePermission` (ci-dessus) reste la version montable sur une route Express. */
export async function requirePermissionAsync(
  permission: string,
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.context) {
    next(new UnauthorizedError('AUTH_TOKEN_MISSING', 'Authentification requise.'));
    return;
  }

  const { role, isSuperAdmin, permissionsOverrides, membershipId } = req.context;

  if (isSuperAdmin && permission.startsWith('platform:')) {
    next();
    return;
  }

  if (!role || !membershipId) {
    next(new ForbiddenError('RBAC_PERMISSION_DENIED', FORBIDDEN_MESSAGE));
    return;
  }

  const resolvedPermissions = await resolvePermissions(role, membershipId, permissionsOverrides);

  if (!resolvedPermissions.includes(permission)) {
    next(new ForbiddenError('RBAC_PERMISSION_DENIED', FORBIDDEN_MESSAGE));
    return;
  }

  next();
}
