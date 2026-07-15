import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import type { AccessTokenPayload } from '../jwt.js';
import { decodeExpiredAccessToken, signAccessToken, verifyAccessToken } from '../jwt.js';

const SECRET = 'a'.repeat(32);
const PAYLOAD: AccessTokenPayload = {
  sub: 'user-a',
  membershipId: 'membership-a',
  tenantId: 'tenant-a',
  role: 'waiter',
  isSuperAdmin: false,
  permissionsVersion: 0,
};

describe('signAccessToken / verifyAccessToken (doc 07 §7.2)', () => {
  it('signe puis vérifie un token, les claims survivent au round-trip', () => {
    const token = signAccessToken(PAYLOAD, SECRET);
    const decoded = verifyAccessToken(token, SECRET);

    expect(decoded).toMatchObject(PAYLOAD);
  });

  it('inclut iat/exp (15 minutes, doc 07 §7.1)', () => {
    const token = signAccessToken(PAYLOAD, SECRET);
    const decoded = verifyAccessToken(token, SECRET) as AccessTokenPayload & {
      iat: number;
      exp: number;
    };

    expect(decoded.exp - decoded.iat).toBe(15 * 60);
  });

  it('rejette un token signé avec un autre secret', () => {
    const token = signAccessToken(PAYLOAD, SECRET);

    expect(() => verifyAccessToken(token, 'b'.repeat(32))).toThrow();
  });

  it('rejette un token altéré', () => {
    const token = signAccessToken(PAYLOAD, SECRET);
    const tampered = `${token.slice(0, -1)}${token.at(-1) === 'a' ? 'b' : 'a'}`;

    expect(() => verifyAccessToken(tampered, SECRET)).toThrow();
  });
});

describe('decodeExpiredAccessToken (doc 07 §7.4)', () => {
  it("décode un token expiré tant que la signature est valide (cas d'usage de /auth/refresh)", () => {
    const expiredToken = jwt.sign(PAYLOAD, SECRET, { expiresIn: -10 });

    expect(() => verifyAccessToken(expiredToken, SECRET)).toThrow();
    expect(decodeExpiredAccessToken(expiredToken, SECRET)).toMatchObject(PAYLOAD);
  });

  it('rejette quand même un token expiré signé avec un autre secret (la signature reste vérifiée)', () => {
    const expiredToken = jwt.sign(PAYLOAD, 'b'.repeat(32), { expiresIn: -10 });

    expect(() => decodeExpiredAccessToken(expiredToken, SECRET)).toThrow();
  });

  it('rejette un token expiré altéré', () => {
    const expiredToken = jwt.sign(PAYLOAD, SECRET, { expiresIn: -10 });
    const tampered = `${expiredToken.slice(0, -1)}${expiredToken.at(-1) === 'a' ? 'b' : 'a'}`;

    expect(() => decodeExpiredAccessToken(tampered, SECRET)).toThrow();
  });
});
