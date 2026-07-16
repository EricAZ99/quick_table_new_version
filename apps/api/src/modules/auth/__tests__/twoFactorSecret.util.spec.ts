import { describe, expect, it } from 'vitest';

import { decryptTwoFactorSecret, encryptTwoFactorSecret } from '../twoFactorSecret.util.js';

const KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);

describe('twoFactorSecret.util', () => {
  it('chiffre puis déchiffre pour retrouver le secret original', () => {
    const encrypted = encryptTwoFactorSecret('JBSWY3DPEHPK3PXP', KEY);

    expect(decryptTwoFactorSecret(encrypted, KEY)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('produit un texte chiffré différent à chaque appel (IV aléatoire)', () => {
    const first = encryptTwoFactorSecret('JBSWY3DPEHPK3PXP', KEY);
    const second = encryptTwoFactorSecret('JBSWY3DPEHPK3PXP', KEY);

    expect(first).not.toBe(second);
  });

  it('stocke le résultat au format iv:authTag:ciphertext (hex, séparés par ":")', () => {
    const encrypted = encryptTwoFactorSecret('JBSWY3DPEHPK3PXP', KEY);

    expect(encrypted.split(':')).toHaveLength(3);
    expect(encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  });

  it('échoue à déchiffrer avec la mauvaise clé (authTag GCM invalide)', () => {
    const encrypted = encryptTwoFactorSecret('JBSWY3DPEHPK3PXP', KEY);

    expect(() => decryptTwoFactorSecret(encrypted, OTHER_KEY)).toThrow();
  });

  it('échoue sur un format chiffré malformé', () => {
    expect(() => decryptTwoFactorSecret('pas-le-bon-format', KEY)).toThrow(/format.*invalide/i);
  });
});
