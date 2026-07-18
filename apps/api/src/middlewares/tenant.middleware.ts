import type { NextFunction, Request, Response } from 'express';

import { MembershipModel, type MembershipRole } from '../database/models/membership.model.js';
import { ForbiddenError, UnauthorizedError, ValidationError } from '../shared/errors/index.js';

/**
 * Contexte tenant résolu (doc 06 §6.2/§6.3) — c'est la **seule** source de
 * vérité pour `tenantId` en aval (services/repositories) : jamais relu
 * depuis `req.body`/`req.query`/`req.params` (doc 06 §6.2, protection de
 * dernier recours contre l'IDOR).
 */
export interface TenantContext {
  tenantId: string | null;
  userId: string;
  membershipId: string | null;
  role: MembershipRole | null;
  isSuperAdmin: boolean;
}

/**
 * Résolution du tenant depuis le JWT déjà validé par `requireAuth` (doc 06
 * §6.3). Version volontairement minimale : `restaurants`/`subscriptions`
 * n'existent pas encore (Feature 2.1, pas commencée) — la vérification du
 * statut du tenant (`status === 'active' || 'trial'`, sinon `403
 * TENANT_SUSPENDED`) et l'injection de `req.context.subscription`
 * (feature gating, doc 08) sont donc explicitement **hors périmètre** ici,
 * pas anticipées (doc 14 §14.5 KISS) — à ajouter quand ces collections
 * existeront. La résolution du `clusterId` (mode Silo, doc 06 §6.1) est
 * elle aussi hors périmètre : aucun tenant Silo n'existe tant que le mode
 * Pool est le seul actif.
 *
 * Ce que cette version fait réellement : vérifie que le membership actif
 * (`membershipId` du JWT) existe toujours et est `employmentStatus:
 * 'active'` — un JWT reste valide 15 minutes après qu'un employé a été
 * désactivé/retiré, ce contrôle referme cette fenêtre à chaque requête
 * tenant-scoped plutôt que d'attendre l'expiration naturelle du token.
 *
 * `isSuperAdmin` sans `tenantId` (cas normal au login, doc 07 §7.3 : un
 * super admin n'a généralement aucun membership) passe avec
 * `context.tenantId = null` (doc 06 §6.3 : "routes platform-admin, bypass
 * du Tenant Resolver") — aucune route platform-admin n'existe encore pour
 * consommer ce contexte, mais le comportement est déjà correct pour
 * quand elles arriveront.
 */
/** Exportée séparément pour être `await`ée directement dans les tests unitaires — `resolveTenant` (ci-dessous) reste la version montable sur une route Express. */
export async function resolveTenantAsync(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.auth) {
    next(new UnauthorizedError('AUTH_TOKEN_MISSING', 'Authentification requise.'));
    return;
  }

  const { sub: userId, tenantId, membershipId, role, isSuperAdmin } = req.auth;

  if (tenantId === null) {
    if (isSuperAdmin) {
      req.context = { tenantId: null, userId, membershipId: null, role: null, isSuperAdmin: true };
      next();
      return;
    }
    next(
      new ValidationError(
        'TENANT_CONTEXT_REQUIRED',
        'Aucun restaurant actif sélectionné — veuillez en choisir un.',
      ),
    );
    return;
  }

  const membership = await MembershipModel.findOne({ _id: membershipId, tenantId, userId });
  if (!membership || membership.employmentStatus !== 'active') {
    next(
      new ForbiddenError(
        'TENANT_MEMBERSHIP_INACTIVE',
        "Votre accès à ce restaurant n'est plus actif.",
      ),
    );
    return;
  }

  req.context = { tenantId, userId, membershipId, role, isSuperAdmin };
  next();
}

/**
 * Enveloppe synchrone (même pattern que `shared/utils/asyncHandler.ts`,
 * inlinée ici plutôt que réutilisée pour garder ce middleware directement
 * montable — `requireAuth, resolveTenant` — sans wrapper supplémentaire à
 * chaque route) : Express 4 ne rattrape pas un rejet de promesse dans un
 * middleware, `.catch(next)` fait suivre toute erreur à
 * `error-handler.middleware.ts`.
 */
export function resolveTenant(req: Request, res: Response, next: NextFunction): void {
  resolveTenantAsync(req, res, next).catch(next);
}
