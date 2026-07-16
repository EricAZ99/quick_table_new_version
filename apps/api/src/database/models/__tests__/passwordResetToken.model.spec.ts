import { Types, type Schema } from 'mongoose';
import { describe, expect, it } from 'vitest';

import type { PasswordResetTokenDocument } from '../passwordResetToken.model.js';
import { PasswordResetTokenModel } from '../passwordResetToken.model.js';

const passwordResetTokenSchema =
  PasswordResetTokenModel.schema as Schema<PasswordResetTokenDocument>;

describe('PasswordResetTokenModel — validation de schéma (doc 07 §7.5)', () => {
  function build(overrides: Partial<Record<string, unknown>> = {}) {
    return new PasswordResetTokenModel({
      userId: new Types.ObjectId(),
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      ...overrides,
    });
  }

  it('valide un document conforme (champs obligatoires uniquement)', async () => {
    await expect(build().validate()).resolves.toBeUndefined();
  });

  it.each(['userId', 'tokenHash', 'expiresAt'])(
    "rejette un document sans '%s' (requis)",
    async (field) => {
      const error = await build({ [field]: undefined })
        .validate()
        .catch((err: unknown) => err);
      expect((error as { errors: Record<string, unknown> }).errors[field]).toBeDefined();
    },
  );

  it('applique le défaut usedAt=null (token pas encore consommé)', () => {
    expect(build().usedAt).toBeNull();
  });

  type IndexEntry = [Record<string, 1 | -1>, Record<string, unknown>];

  it('déclare un index TTL { expiresAt: 1 } expireAfterSeconds=0 (purge automatique)', () => {
    const indexes = passwordResetTokenSchema.indexes() as IndexEntry[];
    const ttlIndex = indexes.find(([fields]) => fields.expiresAt === 1);

    expect(ttlIndex).toBeDefined();
    expect(ttlIndex?.[1]).toMatchObject({ expireAfterSeconds: 0 });
  });

  it('déclare un index { userId: 1 }', () => {
    const indexes = passwordResetTokenSchema.indexes() as IndexEntry[];
    const userIdIndex = indexes.find(([fields]) => fields.userId === 1);

    expect(userIdIndex).toBeDefined();
  });
});
