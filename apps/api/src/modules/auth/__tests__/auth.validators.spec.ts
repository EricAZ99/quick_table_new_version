import { describe, expect, it } from 'vitest';

import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  twoFactorConfirmSchema,
  twoFactorDisableSchema,
  twoFactorVerifySchema,
} from '../auth.validators.js';

describe('loginSchema', () => {
  it('accepte un payload valide', () => {
    const result = loginSchema.safeParse({ email: 'chef@quicktable.io', password: 'peu-importe' });

    expect(result.success).toBe(true);
  });

  it('normalise email en lowercase et le trim', () => {
    const result = loginSchema.safeParse({ email: '  Chef@QuickTable.io  ', password: 'x' });

    expect(result.success && result.data.email).toBe('chef@quicktable.io');
  });

  it('rejette un email invalide', () => {
    const result = loginSchema.safeParse({ email: 'pas-un-email', password: 'x' });

    expect(result.success).toBe(false);
  });

  it('rejette un password vide', () => {
    const result = loginSchema.safeParse({ email: 'chef@quicktable.io', password: '' });

    expect(result.success).toBe(false);
  });

  it("n'impose pas la politique de complexité (min 10) — seule la création de mot de passe l'impose, pas sa vérification", () => {
    const result = loginSchema.safeParse({ email: 'chef@quicktable.io', password: 'court' });

    expect(result.success).toBe(true);
  });

  it('rejette un password manquant', () => {
    const result = loginSchema.safeParse({ email: 'chef@quicktable.io' });

    expect(result.success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('accepte un email valide', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'chef@quicktable.io' }).success).toBe(true);
  });

  it('normalise email en lowercase et le trim', () => {
    const result = forgotPasswordSchema.safeParse({ email: '  Chef@QuickTable.io  ' });

    expect(result.success && result.data.email).toBe('chef@quicktable.io');
  });

  it('rejette un email invalide', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'pas-un-email' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  const VALID_PAYLOAD = { token: 'un-token-quelconque', newPassword: 'un-nouveau-mdp-solide' };

  it('accepte un payload valide', () => {
    expect(resetPasswordSchema.safeParse(VALID_PAYLOAD).success).toBe(true);
  });

  it('rejette un token vide', () => {
    expect(resetPasswordSchema.safeParse({ ...VALID_PAYLOAD, token: '' }).success).toBe(false);
  });

  it('rejette un newPassword de moins de 10 caractères (doc 07 §7.8, création de mot de passe)', () => {
    expect(resetPasswordSchema.safeParse({ ...VALID_PAYLOAD, newPassword: 'court1' }).success).toBe(
      false,
    );
  });

  it('accepte un newPassword de 10 caractères exactement', () => {
    expect(
      resetPasswordSchema.safeParse({ ...VALID_PAYLOAD, newPassword: '1234567890' }).success,
    ).toBe(true);
  });
});

describe('twoFactorConfirmSchema', () => {
  it('accepte un code non vide', () => {
    expect(twoFactorConfirmSchema.safeParse({ code: '123456' }).success).toBe(true);
  });

  it('rejette un code vide ou manquant', () => {
    expect(twoFactorConfirmSchema.safeParse({ code: '' }).success).toBe(false);
    expect(twoFactorConfirmSchema.safeParse({}).success).toBe(false);
  });
});

describe('twoFactorVerifySchema', () => {
  it('accepte un challengeToken et un code non vides', () => {
    expect(
      twoFactorVerifySchema.safeParse({ challengeToken: 'un-token', code: '123456' }).success,
    ).toBe(true);
  });

  it('accepte un code de récupération (pas seulement un code TOTP à 6 chiffres)', () => {
    expect(
      twoFactorVerifySchema.safeParse({ challengeToken: 'un-token', code: 'AB12-CD34-EF56' })
        .success,
    ).toBe(true);
  });

  it('rejette si challengeToken ou code manque', () => {
    expect(twoFactorVerifySchema.safeParse({ code: '123456' }).success).toBe(false);
    expect(twoFactorVerifySchema.safeParse({ challengeToken: 'un-token' }).success).toBe(false);
  });
});

describe('twoFactorDisableSchema', () => {
  it('accepte password et code non vides', () => {
    expect(twoFactorDisableSchema.safeParse({ password: 'x', code: '123456' }).success).toBe(true);
  });

  it('rejette si password ou code manque', () => {
    expect(twoFactorDisableSchema.safeParse({ code: '123456' }).success).toBe(false);
    expect(twoFactorDisableSchema.safeParse({ password: 'x' }).success).toBe(false);
  });
});
