import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import {
  signTwoFactorChallengeToken,
  verifyTwoFactorChallengeToken,
} from '../twoFactorChallengeToken.js';

const SECRET = 's'.repeat(32);

describe('twoFactorChallengeToken', () => {
  it('signe puis vérifie pour retrouver le userId', () => {
    const token = signTwoFactorChallengeToken('user-a', SECRET);

    expect(verifyTwoFactorChallengeToken(token, SECRET)).toEqual({ userId: 'user-a' });
  });

  it('expire après 5 minutes (doc 07 §7.3)', () => {
    const decoded = jwt.decode(signTwoFactorChallengeToken('user-a', SECRET)) as {
      iat: number;
      exp: number;
    };

    expect(decoded.exp - decoded.iat).toBe(5 * 60);
  });

  it('rejette un token signé avec un autre secret', () => {
    const token = signTwoFactorChallengeToken('user-a', SECRET);

    expect(() =>
      verifyTwoFactorChallengeToken(token, 'un-autre-secret-de-32-caracteres'),
    ).toThrow();
  });

  it("rejette un Access Token normal présenté à la place d'un challenge (claim purpose absent)", () => {
    const accessToken = jwt.sign({ sub: 'user-a' }, SECRET, { expiresIn: '15m' });

    expect(() => verifyTwoFactorChallengeToken(accessToken, SECRET)).toThrow(/challenge 2FA/);
  });
});
