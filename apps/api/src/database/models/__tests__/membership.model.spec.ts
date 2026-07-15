import { Types, type Schema } from 'mongoose';
import { describe, expect, it } from 'vitest';

import type { MembershipDocument } from '../membership.model.js';
import { MembershipModel } from '../membership.model.js';

const membershipSchema = MembershipModel.schema as Schema<MembershipDocument>;

describe('MembershipModel — validation de schéma (doc 05 §"memberships")', () => {
  function build(overrides: Partial<Record<string, unknown>> = {}) {
    return new MembershipModel({
      tenantId: 'tenant-a',
      userId: new Types.ObjectId(),
      role: 'waiter',
      ...overrides,
    });
  }

  it('valide un document conforme (champs obligatoires uniquement)', async () => {
    await expect(build().validate()).resolves.toBeUndefined();
  });

  it('rejette un document sans tenantId (ajouté par tenantScope, doc 06 §6.4)', async () => {
    const error = await build({ tenantId: undefined })
      .validate()
      .catch((err: unknown) => err);
    expect((error as { errors: Record<string, unknown> }).errors.tenantId).toBeDefined();
  });

  it.each(['userId', 'role'])("rejette un document sans '%s' (requis)", async (field) => {
    const error = await build({ [field]: undefined })
      .validate()
      .catch((err: unknown) => err);
    expect((error as { errors: Record<string, unknown> }).errors[field]).toBeDefined();
  });

  it('rejette un role hors des 5 rôles à portée tenant (doc 08 §8.2)', async () => {
    const error = await build({ role: 'super_admin' })
      .validate()
      .catch((err: unknown) => err);
    expect((error as { errors: Record<string, unknown> }).errors.role).toBeDefined();
  });

  it.each(['restaurant_owner', 'manager', 'cashier', 'kitchen', 'waiter'])(
    "accepte le rôle '%s'",
    async (role) => {
      await expect(build({ role }).validate()).resolves.toBeUndefined();
    },
  );

  it('rejette un salary négatif', async () => {
    const error = await build({ salary: -100 })
      .validate()
      .catch((err: unknown) => err);
    expect((error as { errors: Record<string, unknown> }).errors.salary).toBeDefined();
  });

  it("applique les défauts : permissionsOverrides=[], employmentStatus='active'", () => {
    const doc = build();
    expect(doc.permissionsOverrides).toEqual([]);
    expect(doc.employmentStatus).toBe('active');
  });

  type IndexEntry = [Record<string, 1 | -1>, Record<string, unknown>];

  it('déclare un index unique composé { tenantId: 1, userId: 1 } (un seul rôle par restaurant, doc 05)', () => {
    const indexes = membershipSchema.indexes() as IndexEntry[];
    const compoundUnique = indexes.find(([fields]) => fields.tenantId === 1 && fields.userId === 1);

    expect(compoundUnique).toBeDefined();
    expect(compoundUnique?.[1]).toMatchObject({ unique: true });
  });

  it('déclare un index { tenantId: 1, role: 1 } (filtrage par rôle au sein du tenant)', () => {
    const indexes = membershipSchema.indexes() as IndexEntry[];
    const roleIndex = indexes.find(([fields]) => fields.tenantId === 1 && fields.role === 1);

    expect(roleIndex).toBeDefined();
  });
});
