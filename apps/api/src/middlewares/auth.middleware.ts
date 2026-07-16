import type { NextFunction, Request, Response } from 'express';

import { getEnv } from '../config/env.js';
import { UnauthorizedError } from '../shared/errors/index.js';
import { verifyAccessToken, type AccessTokenPayload } from '../modules/auth/jwt.js';

const BEARER_PREFIX = 'Bearer ';

/**
 * Vérification JWT (doc 03 §3.3 : "auth.middleware.ts — Vérification
 * JWT") — strictement limité à ça : signature + expiration de l'Access
 * Token, claims attachés à `req.auth`. La résolution du tenant courant
 * (`tenant.middleware.ts`) et la vérification des permissions
 * (`rbac.middleware.ts`) sont des tickets séparés (Feature 1.3/1.4), pas
 * anticipés ici (doc 14 §14.5 KISS) — ce middleware ne répond qu'à "y a-t-il
 * un utilisateur authentifié, et qui est-ce".
 *
 * `getEnv()` appelé à l'intérieur du handler (pas au chargement du module)
 * — même précaution que partout ailleurs (doc 14 §14.6) : importer ce
 * fichier ne doit jamais déclencher la validation fail-fast de `.env`.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    next(new UnauthorizedError('AUTH_TOKEN_MISSING', 'Authentification requise.'));
    return;
  }

  const token = header.slice(BEARER_PREFIX.length);
  let payload: AccessTokenPayload;
  try {
    payload = verifyAccessToken(token, getEnv().JWT_SECRET);
  } catch {
    next(new UnauthorizedError('AUTH_TOKEN_INVALID', 'Session invalide ou expirée.'));
    return;
  }

  req.auth = payload;
  next();
}
