import { describe, expect, it } from 'vitest';

import {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_MS,
} from '../refreshToken.util.js';

describe('generateRefreshToken', () => {
  it('génère un UUID haute entropie (doc 07 §7.2)', () => {
    const token = generateRefreshToken();

    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('génère un token différent à chaque appel', () => {
    expect(generateRefreshToken()).not.toBe(generateRefreshToken());
  });
});

describe('hashRefreshToken', () => {
  it('produit un hash SHA-256 hexadécimal (64 caractères)', () => {
    const hash = hashRefreshToken('un-token-quelconque');

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('est déterministe (même entrée -> même hash)', () => {
    expect(hashRefreshToken('même-token')).toBe(hashRefreshToken('même-token'));
  });

  it('produit un hash différent pour une entrée différente', () => {
    expect(hashRefreshToken('token-a')).not.toBe(hashRefreshToken('token-b'));
  });
});

describe('REFRESH_TOKEN_TTL_MS', () => {
  it('vaut 30 jours (doc 07 §7.1)', () => {
    expect(REFRESH_TOKEN_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
