import { createHash, randomUUID } from 'node:crypto';

/** 30 minutes (doc 07 §7.5) — politique de sécurité fixe, pas un réglage d'environnement. */
export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/** Opaque, haute entropie (doc 07 §7.5 : "token à usage unique, haute entropie"). */
export function generatePasswordResetToken(): string {
  return randomUUID();
}

/** SHA-256 : même en cas de fuite de la base, le token brut n'est pas retrouvable (doc 07 §7.5 : "hashé en base"). */
export function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
