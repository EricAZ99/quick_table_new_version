import { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

import { createRedisRateLimiter } from '../../shared/utils/createRedisRateLimiter.js';
import { normalizeClientIp } from '../../shared/utils/normalizeClientIp.js';

/**
 * Un code TOTP est un nombre à 6 chiffres (1 chance sur 1 000 000 par
 * essai) — sans limitation, `/auth/2fa/verify` serait exposé au brute
 * force (doc 13 §13.1, A07). Non listé explicitement dans la table doc 13
 * §13.2 (rédigée avant l'implémentation de la 2FA), mais découle
 * directement du même principe que `/auth/login` : même facteur (5
 * tentatives), fenêtre alignée sur la durée de vie du `challengeToken` (5
 * min, `twoFactorChallengeToken.ts`) plutôt que les 15 min du login — un
 * challenge expiré de toute façon au-delà.
 */
function twoFactorVerifyRateLimitKey(req: Request): string {
  const body = req.body as { challengeToken?: unknown } | undefined;
  const challengeToken = typeof body?.challengeToken === 'string' ? body.challengeToken : 'unknown';
  const ip = normalizeClientIp(req.ip) ?? 'unknown';
  return `${challengeToken}:${ipKeyGenerator(ip)}`;
}

const limiter = createRedisRateLimiter({
  windowMs: 5 * 60 * 1000,
  limit: 5,
  prefix: 'auth:2fa-verify-rl:',
  keyGenerator: twoFactorVerifyRateLimitKey,
  errorCode: 'AUTH_LOGIN_RATE_LIMITED',
  defaultMessage: 'Trop de tentatives, réessayez plus tard.',
});

export const twoFactorVerifyRateLimiter = limiter.middleware;
