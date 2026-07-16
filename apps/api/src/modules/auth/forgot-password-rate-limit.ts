import { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

import { createRedisRateLimiter } from '../../shared/utils/createRedisRateLimiter.js';
import { normalizeClientIp } from '../../shared/utils/normalizeClientIp.js';

/**
 * Par IP uniquement (doc 13 §13.2 : "/auth/forgot-password par IP — 3 —
 * 1h"), contrairement au login (email, IP) — cohérent avec l'anti-
 * énumération (doc 07 §7.5) : ne jamais faire dépendre le comportement
 * observable de l'existence ou non d'un email.
 */
function forgotPasswordRateLimitKey(req: Request): string {
  return ipKeyGenerator(normalizeClientIp(req.ip) ?? 'unknown');
}

const limiter = createRedisRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  prefix: 'auth:forgot-password-rl:',
  keyGenerator: forgotPasswordRateLimitKey,
  errorCode: 'AUTH_FORGOT_PASSWORD_RATE_LIMITED',
  defaultMessage: 'Trop de demandes de réinitialisation, réessayez plus tard.',
});

/** Verrouillage par IP (doc 07 §7.8, doc 13 §13.2). */
export const forgotPasswordRateLimiter = limiter.middleware;
