import { describe, expect, it } from 'vitest';

import { createMembershipSchema } from '../memberships.validators.js';

const VALID_PAYLOAD = {
  userId: '507f1f77bcf86cd799439011',
  role: 'waiter',
};

describe('createMembershipSchema', () => {
  it('accepte un payload valide (champs obligatoires uniquement)', () => {
    const result = createMembershipSchema.safeParse(VALID_PAYLOAD);

    expect(result.success).toBe(true);
  });

  it("rejette un userId qui n'est pas un ObjectId MongoDB valide", () => {
    const result = createMembershipSchema.safeParse({ ...VALID_PAYLOAD, userId: 'pas-un-id' });

    expect(result.success).toBe(false);
  });

  it.each(['restaurant_owner', 'manager', 'cashier', 'kitchen', 'waiter'])(
    "accepte le rôle '%s' (doc 08 §8.2)",
    (role) => {
      const result = createMembershipSchema.safeParse({ ...VALID_PAYLOAD, role });

      expect(result.success).toBe(true);
    },
  );

  it('rejette un rôle à portée plateforme (super_admin) — jamais un membership', () => {
    const result = createMembershipSchema.safeParse({ ...VALID_PAYLOAD, role: 'super_admin' });

    expect(result.success).toBe(false);
  });

  it('rejette un tenantId fourni par le client (doit toujours venir du contexte serveur, doc 06 §6.2)', () => {
    const result = createMembershipSchema.safeParse({
      ...VALID_PAYLOAD,
      tenantId: 'tenant-imposé',
    });

    expect(result.success && !('tenantId' in result.data)).toBe(true);
  });

  it('rejette un salary négatif', () => {
    const result = createMembershipSchema.safeParse({ ...VALID_PAYLOAD, salary: -1 });

    expect(result.success).toBe(false);
  });

  it('accepte un salary positif', () => {
    const result = createMembershipSchema.safeParse({ ...VALID_PAYLOAD, salary: 250000 });

    expect(result.success).toBe(true);
  });

  it('coerce hiredAt (chaîne ISO) en Date', () => {
    const result = createMembershipSchema.safeParse({ ...VALID_PAYLOAD, hiredAt: '2026-01-15' });

    expect(result.success && result.data.hiredAt instanceof Date).toBe(true);
  });
});
