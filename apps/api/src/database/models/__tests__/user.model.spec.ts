import { describe, expect, it } from 'vitest';

import { UserModel } from '../user.model.js';

describe('UserModel — validation de schéma (doc 05 §"users")', () => {
  function build(overrides: Partial<Record<string, unknown>> = {}) {
    return new UserModel({
      email: 'chef@quicktable.io',
      passwordHash: 'argon2id$fake-hash',
      fullName: 'Chef Dupont',
      ...overrides,
    });
  }

  it('valide un document conforme (champs obligatoires uniquement)', async () => {
    await expect(build().validate()).resolves.toBeUndefined();
  });

  it.each(['email', 'passwordHash', 'fullName'])(
    "rejette un document sans '%s' (requis)",
    async (field) => {
      const error = await build({ [field]: undefined })
        .validate()
        .catch((err: unknown) => err);
      expect((error as { errors: Record<string, unknown> }).errors[field]).toBeDefined();
    },
  );

  it('rejette un email malformé', async () => {
    const error = await build({ email: 'pas-un-email' })
      .validate()
      .catch((err: unknown) => err);
    expect((error as { errors: Record<string, unknown> }).errors.email).toBeDefined();
  });

  it('normalise email en lowercase', () => {
    const doc = build({ email: 'CHEF@QuickTable.io' });
    expect(doc.email).toBe('chef@quicktable.io');
  });

  it('rejette un téléphone qui ne respecte pas le format E.164', async () => {
    const error = await build({ phone: '0601020304' })
      .validate()
      .catch((err: unknown) => err);
    expect((error as { errors: Record<string, unknown> }).errors.phone).toBeDefined();
  });

  it('accepte un téléphone au format E.164', async () => {
    await expect(build({ phone: '+33601020304' }).validate()).resolves.toBeUndefined();
  });

  it('rejette une preferredLocale hors de fr/en/it/es', async () => {
    const error = await build({ preferredLocale: 'de' })
      .validate()
      .catch((err: unknown) => err);
    expect((error as { errors: Record<string, unknown> }).errors.preferredLocale).toBeDefined();
  });

  it('applique les défauts : isSuperAdmin=false, twoFactorEnabled=false, status=active, preferredLocale=null, deletedAt=null', () => {
    const doc = build();
    expect(doc.isSuperAdmin).toBe(false);
    expect(doc.twoFactorEnabled).toBe(false);
    expect(doc.status).toBe('active');
    expect(doc.preferredLocale).toBeNull();
    expect(doc.deletedAt).toBeNull();
  });

  it("exclut passwordHash et twoFactorSecret de la sérialisation JSON (jamais retournés par l'API, doc 05)", () => {
    const doc = build({ twoFactorSecret: 'secret-totp' });
    const json = doc.toJSON() as unknown as Record<string, unknown>;

    expect(json).not.toHaveProperty('passwordHash');
    expect(json).not.toHaveProperty('twoFactorSecret');
    expect(json.email).toBe('chef@quicktable.io');
  });
});
