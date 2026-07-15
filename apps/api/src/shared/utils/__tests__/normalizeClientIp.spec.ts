import { describe, expect, it } from 'vitest';

import { normalizeClientIp } from '../normalizeClientIp.js';

describe('normalizeClientIp', () => {
  it('retire le préfixe IPv4-mappée-en-IPv6 (::ffff:)', () => {
    expect(normalizeClientIp('::ffff:203.0.113.42')).toBe('203.0.113.42');
  });

  it('laisse une IP normale inchangée', () => {
    expect(normalizeClientIp('203.0.113.42')).toBe('203.0.113.42');
  });

  it('retourne undefined si aucune IP fournie', () => {
    expect(normalizeClientIp(undefined)).toBeUndefined();
  });
});
