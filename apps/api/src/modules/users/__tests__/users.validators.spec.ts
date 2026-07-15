import { describe, expect, it } from 'vitest';

import { createUserSchema } from '../users.validators.js';

const VALID_PAYLOAD = {
  email: 'chef@quicktable.io',
  password: 'un-mot-de-passe-solide',
  fullName: 'Chef Dupont',
};

describe('createUserSchema', () => {
  it('accepte un payload valide (champs obligatoires uniquement)', () => {
    const result = createUserSchema.safeParse(VALID_PAYLOAD);

    expect(result.success).toBe(true);
  });

  it('normalise email en lowercase et le trim', () => {
    const result = createUserSchema.safeParse({
      ...VALID_PAYLOAD,
      email: '  Chef@QuickTable.io  ',
    });

    expect(result.success && result.data.email).toBe('chef@quicktable.io');
  });

  it('rejette un email invalide', () => {
    const result = createUserSchema.safeParse({ ...VALID_PAYLOAD, email: 'pas-un-email' });

    expect(result.success).toBe(false);
  });

  it('rejette un mot de passe de moins de 10 caractères (doc 07 §7.8)', () => {
    const result = createUserSchema.safeParse({ ...VALID_PAYLOAD, password: 'court1' });

    expect(result.success).toBe(false);
  });

  it('accepte un mot de passe de 10 caractères exactement', () => {
    const result = createUserSchema.safeParse({ ...VALID_PAYLOAD, password: '1234567890' });

    expect(result.success).toBe(true);
  });

  it('rejette un fullName vide', () => {
    const result = createUserSchema.safeParse({ ...VALID_PAYLOAD, fullName: '' });

    expect(result.success).toBe(false);
  });

  it('accepte un phone au format E.164', () => {
    const result = createUserSchema.safeParse({ ...VALID_PAYLOAD, phone: '+33601020304' });

    expect(result.success).toBe(true);
  });

  it("rejette un phone qui n'est pas au format E.164", () => {
    const result = createUserSchema.safeParse({ ...VALID_PAYLOAD, phone: '0601020304' });

    expect(result.success).toBe(false);
  });

  it.each(['fr', 'en', 'it', 'es'])('accepte preferredLocale=%s', (preferredLocale) => {
    const result = createUserSchema.safeParse({ ...VALID_PAYLOAD, preferredLocale });

    expect(result.success).toBe(true);
  });

  it('accepte preferredLocale=null (hérite de restaurants.locale, doc 35 §35.3)', () => {
    const result = createUserSchema.safeParse({ ...VALID_PAYLOAD, preferredLocale: null });

    expect(result.success).toBe(true);
  });

  it('rejette une preferredLocale hors fr/en/it/es', () => {
    const result = createUserSchema.safeParse({ ...VALID_PAYLOAD, preferredLocale: 'de' });

    expect(result.success).toBe(false);
  });
});
