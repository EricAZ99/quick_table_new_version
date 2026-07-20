import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { RoleDefinitionModel } from '../database/models/roleDefinition.model.js';
import { ForbiddenError, UnauthorizedError } from '../shared/errors/index.js';

const FORBIDDEN_MESSAGE = "Vous n'avez pas la permission requise pour effectuer cette action.";

/**
 * Middleware RBAC (doc 08 §8.7) : la permission requise est un paramètre
 * de route (`requirePermission('orders:cancel')`), déclarée directement
 * dans `*.routes.ts` — jamais cachée dans un controller, pour rester
 * visible et grep-able.
 *
 * Version 1/3 de la vérification à trois niveaux de doc 08 §8.1 :
 * uniquement "le rôle possède-t-il la permission" via `roleDefinitions`
 * (doc 22 §22.4, résolu à chaque requête). La résolution combinée avec
 * `permissionsOverrides` du membership (niveau 3) et le cache Redis
 * `rbac:resolved:{membershipId}` sont des tickets séparés de cette
 * Feature 1.4, pas anticipés ici (doc 14 §14.5 KISS). Le niveau 2
 * (feature gating par abonnement, doc 08 §8.6) reste hors périmètre de
 * toute la Feature 1.4 : `subscriptions` n'existe pas encore (Feature
 * 2.1).
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

  const { role, isSuperAdmin } = req.context;

  if (isSuperAdmin && permission.startsWith('platform:')) {
    next();
    return;
  }

  if (!role) {
    next(new ForbiddenError('RBAC_PERMISSION_DENIED', FORBIDDEN_MESSAGE));
    return;
  }

  const roleDefinition = await RoleDefinitionModel.findOne({
    roleCode: role,
    isCurrent: true,
  }).lean();

  if (!roleDefinition || !roleDefinition.permissions.includes(permission)) {
    next(new ForbiddenError('RBAC_PERMISSION_DENIED', FORBIDDEN_MESSAGE));
    return;
  }

  next();
}
