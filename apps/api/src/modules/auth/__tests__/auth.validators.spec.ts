import { describe, expect, it } from 'vitest';

import { loginSchema } from '../auth.validators.js';

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
