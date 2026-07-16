import { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

import { createRedisRateLimiter } from '../../shared/utils/createRedisRateLimiter.js';
import { normalizeClientIp } from '../../shared/utils/normalizeClientIp.js';

/**
 * Clé partagée entre le limiteur et `resetLoginRateLimit` (appelé après un
 * login réussi, doc 07 §7.3 : "incrémente compteur tentative échouée = 0
 * (reset)") — doit rester strictement identique des deux côtés.
 * `ipKeyGenerator` (fourni par `express-rate-limit`) normalise l'IPv6 par
 * sous-réseau plutôt que par adresse individuelle : sans ça, un utilisateur
 * IPv6 pourrait contourner le verrouillage en changeant d'adresse au sein
 * de son propre sous-réseau (avertissement natif de la librairie).
 */
function loginRateLimitKey(req: Request): string {
  const body = req.body as { email?: unknown } | undefined;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : 'unknown';
  const ip = normalizeClientIp(req.ip) ?? 'unknown';
  return `${email}:${ipKeyGenerator(ip)}`;
}

const limiter = createRedisRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  prefix: 'auth:login-rl:',
  keyGenerator: loginRateLimitKey,
  errorCode: 'AUTH_LOGIN_RATE_LIMITED',
  defaultMessage: 'Trop de tentatives de connexion, réessayez plus tard.',
});

/** Verrouillage progressif par `(email, IP)` (doc 07 §7.8, doc 13 §13.2). */
export const loginRateLimiter = limiter.middleware;

/** Appelé par le controller après un login réussi (doc 07 §7.3). */
export const resetLoginRateLimit = limiter.resetKey;
