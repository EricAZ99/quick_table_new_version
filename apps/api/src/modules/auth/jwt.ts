import jwt from 'jsonwebtoken';

import type { MembershipRole } from '../../database/models/membership.model.js';

/** Claims de l'Access Token (doc 07 §7.2). */
export interface AccessTokenPayload {
  sub: string;
  membershipId: string | null;
  tenantId: string | null;
  role: MembershipRole | null;
  isSuperAdmin: boolean;
  /**
   * Incrémenté à chaque changement de rôle/permissions (doc 07 §7.2, doc
   * 08) pour invalider un token "stale" sans attendre son expiration
   * naturelle. Le suivi réel du compteur arrive avec RBAC (Feature 1.4) —
   * fixé à `0` ici (pas anticipé, doc 14 §14.5 KISS).
   */
  permissionsVersion: number;
}

/** 15 minutes (doc 07 §7.1) — politique de sécurité fixe, pas un réglage d'environnement. */
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/**
 * Signature/vérification injectées par paramètre (`secret`), jamais lues
 * depuis `getEnv()` ici — même convention que `connectDatabase(uri)` /
 * `connectRedis(url)` : ces fonctions pures restent testables sans
 * dépendre d'un `.env` réel ; seul l'appelant de haut niveau (le service)
 * résout `getEnv().JWT_SECRET`.
 */
export function signAccessToken(payload: AccessTokenPayload, secret: string): string {
  return jwt.sign(payload, secret, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  return jwt.verify(token, secret) as AccessTokenPayload;
}
