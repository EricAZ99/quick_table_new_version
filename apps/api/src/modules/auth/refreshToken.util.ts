import { createHash, randomUUID } from 'node:crypto';

/** 30 jours (doc 07 §7.1) — politique de sécurité fixe, pas un réglage d'environnement. */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Opaque, haute entropie (doc 07 §7.2) — jamais un JWT, jamais stocké en clair côté serveur. */
export function generateRefreshToken(): string {
  return randomUUID();
}

/** SHA-256 : même en cas de fuite de la base, le token brut n'est pas retrouvable (doc 07 §7.2). */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
