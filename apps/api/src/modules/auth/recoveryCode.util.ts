import { createHash, randomBytes } from 'node:crypto';

/** 10 codes à usage unique (doc 07 §7.6), générés une seule fois à l'activation. */
export const RECOVERY_CODE_COUNT = 10;

/**
 * Un code = 6 octets aléatoires en hex, formatés en 3 groupes de 4
 * caractères (`XXXX-XXXX-XXXX`) pour rester recopiable à la main — même
 * choix de forme que les clés API grand public (Stripe, GitHub...).
 */
function generateRecoveryCode(): string {
  const hex = randomBytes(6).toString('hex').toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
}

/**
 * SHA-256, même convention que `hashRefreshToken`/`hashPasswordResetToken`
 * (doc 07) : ce sont des chaînes générées serveur à haute entropie, pas des
 * mots de passe choisis par l'utilisateur — Argon2id ne s'applique qu'à ces
 * derniers (doc 07 §7.8).
 */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}
