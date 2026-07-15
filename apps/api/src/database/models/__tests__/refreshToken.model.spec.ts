import { Types, type Schema } from 'mongoose';
import { describe, expect, it } from 'vitest';

import type { RefreshTokenDocument } from '../refreshToken.model.js';
import { RefreshTokenModel } from '../refreshToken.model.js';

const refreshTokenSchema = RefreshTokenModel.schema as Schema<RefreshTokenDocument>;

describe('RefreshTokenModel — validation de schéma (doc 05 §"refreshTokens")', () => {
  function build(overrides: Partial<Record<string, unknown>> = {}) {
    return new RefreshTokenModel({
      userId: new Types.ObjectId(),
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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

  it('applique le défaut revokedAt=null (session active à la création)', () => {
    expect(build().revokedAt).toBeNull();
  });

  type IndexEntry = [Record<string, 1 | -1>, Record<string, unknown>];

  it('déclare un index TTL { expiresAt: 1 } expireAfterSeconds=0 (purge automatique, doc 05)', () => {
    const indexes = refreshTokenSchema.indexes() as IndexEntry[];
    const ttlIndex = indexes.find(([fields]) => fields.expiresAt === 1);

    expect(ttlIndex).toBeDefined();
    expect(ttlIndex?.[1]).toMatchObject({ expireAfterSeconds: 0 });
  });

  it('déclare un index { userId: 1 } (liste des sessions actives, doc 07 §7.7)', () => {
    const indexes = refreshTokenSchema.indexes() as IndexEntry[];
    const userIdIndex = indexes.find(([fields]) => fields.userId === 1);

    expect(userIdIndex).toBeDefined();
  });
});
