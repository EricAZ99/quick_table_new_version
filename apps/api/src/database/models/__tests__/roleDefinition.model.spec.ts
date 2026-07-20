import { describe, expect, it } from 'vitest';

import { RoleDefinitionModel } from '../roleDefinition.model.js';

describe('RoleDefinitionModel — validation de schéma (doc 22 §22.4)', () => {
  function build(overrides: Partial<Record<string, unknown>> = {}) {
    return new RoleDefinitionModel({
      roleCode: 'manager',
      version: 1,
      permissions: ['orders:read', 'orders:update'],
      effectiveFrom: new Date(),
      isCurrent: true,
      ...overrides,
    });
  }

  it('valide un document conforme', async () => {
    await expect(build().validate()).resolves.toBeUndefined();
  });

  it.each(['roleCode', 'version', 'effectiveFrom'])(
    "rejette un document sans '%s' (requis)",
    async (field) => {
      const error = await build({ [field]: undefined })
        .validate()
        .catch((err: unknown) => err);
      expect((error as { errors: Record<string, unknown> }).errors[field]).toBeDefined();
    },
  );

  it('rejette un roleCode hors des 5 rôles tenant (doc 08 §8.2, jamais super_admin/customer)', async () => {
    const error = await build({ roleCode: 'super_admin' })
      .validate()
      .catch((err: unknown) => err);
    expect((error as { errors: Record<string, unknown> }).errors.roleCode).toBeDefined();
  });

  it('rejette une permission qui ne suit pas le format resource:action (doc 08 §8.1)', async () => {
    const error = await build({ permissions: ['pas-le-bon-format'] })
      .validate()
      .catch((err: unknown) => err);
    expect((error as { errors: Record<string, unknown> }).errors['permissions.0']).toBeDefined();
  });

  it('défaut isCurrent à true si non fourni', () => {
    const doc = build({ isCurrent: undefined });
    expect(doc.isCurrent).toBe(true);
  });
});
