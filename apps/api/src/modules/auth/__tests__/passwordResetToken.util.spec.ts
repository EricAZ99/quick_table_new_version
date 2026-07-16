import { describe, expect, it } from 'vitest';

import {
  generatePasswordResetToken,
  hashPasswordResetToken,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from '../passwordResetToken.util.js';

describe('generatePasswordResetToken', () => {
  it('génère un UUID haute entropie (doc 07 §7.5)', () => {
    const token = generatePasswordResetToken();

    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('génère un token différent à chaque appel', () => {
    expect(generatePasswordResetToken()).not.toBe(generatePasswordResetToken());
  });
});

describe('hashPasswordResetToken', () => {
  it('produit un hash SHA-256 hexadécimal (64 caractères)', () => {
    expect(hashPasswordResetToken('un-token-quelconque')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('est déterministe (même entrée -> même hash)', () => {
    expect(hashPasswordResetToken('même-token')).toBe(hashPasswordResetToken('même-token'));
  });

  it('produit un hash différent pour une entrée différente', () => {
    expect(hashPasswordResetToken('token-a')).not.toBe(hashPasswordResetToken('token-b'));
  });
});

describe('PASSWORD_RESET_TOKEN_TTL_MS', () => {
  it('vaut 30 minutes (doc 07 §7.5)', () => {
    expect(PASSWORD_RESET_TOKEN_TTL_MS).toBe(30 * 60 * 1000);
  });
});
