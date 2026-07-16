import { describe, expect, it } from 'vitest';

import {
  generateRecoveryCodes,
  hashRecoveryCode,
  RECOVERY_CODE_COUNT,
} from '../recoveryCode.util.js';

describe('recoveryCode.util', () => {
  it('génère exactement 10 codes (doc 07 §7.6)', () => {
    expect(generateRecoveryCodes()).toHaveLength(RECOVERY_CODE_COUNT);
    expect(RECOVERY_CODE_COUNT).toBe(10);
  });

  it('génère des codes au format XXXX-XXXX-XXXX, tous distincts', () => {
    const codes = generateRecoveryCodes();

    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('hashRecoveryCode est déterministe et insensible à la casse/aux espaces', () => {
    const hash1 = hashRecoveryCode('AB12-CD34-EF56');
    const hash2 = hashRecoveryCode('ab12-cd34-ef56');
    const hash3 = hashRecoveryCode('  AB12-CD34-EF56  ');

    expect(hash1).toBe(hash2);
    expect(hash1).toBe(hash3);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('deux codes différents produisent des hash différents', () => {
    expect(hashRecoveryCode('AB12-CD34-EF56')).not.toBe(hashRecoveryCode('AB12-CD34-EF57'));
  });
});
