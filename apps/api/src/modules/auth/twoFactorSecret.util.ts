import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
// 12 octets = taille d'IV recommandée pour GCM (NIST SP 800-38D).
const IV_LENGTH_BYTES = 12;

/**
 * Chiffrement au repos de `users.twoFactorSecret` (doc 07 §7.6, doc 13
 * §13.6) — AES-256-GCM avec la clé applicative `TWO_FACTOR_ENCRYPTION_KEY`
 * (32 octets hex, injectée par paramètre, jamais lue via `getEnv()` ici —
 * même convention que `jwt.ts`). Format stocké : `iv:authTag:ciphertext`
 * (hex, séparés par `:`) dans un unique champ `string`.
 */
export function encryptTwoFactorSecret(plainSecret: string, hexKey: string): string {
  const key = Buffer.from(hexKey, 'hex');
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptTwoFactorSecret(encrypted: string, hexKey: string): string {
  const [ivHex, authTagHex, dataHex] = encrypted.split(':');
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error('Format de secret 2FA chiffré invalide.');
  }

  const key = Buffer.from(hexKey, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}
