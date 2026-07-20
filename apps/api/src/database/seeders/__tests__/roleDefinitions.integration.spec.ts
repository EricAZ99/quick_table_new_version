import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectDatabase, disconnectDatabase } from '../../../config/database.js';
import { RoleDefinitionModel } from '../../models/roleDefinition.model.js';
import { ROLE_DEFINITIONS_SEED_DATA, seedRoleDefinitions } from '../roleDefinitions.seed.js';

// Même convention que countryDefaults.integration.spec.ts (doc 14 §14.6) :
// pas de dépendance à config/env.ts ici, `.env` chargé seulement s'il existe.
const envPath = resolve(import.meta.dirname, '../../../../../../.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const mongodbUri = process.env.MONGODB_URI;
const hasRealCredentials = Boolean(mongodbUri);

/**
 * Vérifie contre un vrai MongoDB Atlas (pas un mock) : l'index partiel
 * unique `{roleCode: 1, isCurrent: true}` (doc 22 §22.4), l'idempotence
 * du seed, et le comportement de versionnement (une nouvelle version
 * insérée + l'ancienne désactivée, jamais modifiée en place) quand la
 * matrice change.
 */
describe.skipIf(!hasRealCredentials)('roleDefinitions seed — intégration MongoDB réelle', () => {
  beforeAll(async () => {
    await connectDatabase(mongodbUri as string);
    await RoleDefinitionModel.collection.deleteMany({});
    // Même précaution que countryDefaults.integration.spec.ts : les index
    // sont construits en arrière-plan après compilation du modèle, sans
    // cet await le test d'unicité ci-dessous serait flaky.
    await RoleDefinitionModel.createIndexes();
  });

  afterAll(async () => {
    await RoleDefinitionModel.collection.deleteMany({});
    await disconnectDatabase();
  });

  it('seed les 5 rôles en version 1 et reste idempotent au second passage (pas de doublon de version)', async () => {
    await seedRoleDefinitions();
    await seedRoleDefinitions();

    const docs = await RoleDefinitionModel.find({}).lean();
    expect(docs).toHaveLength(ROLE_DEFINITIONS_SEED_DATA.length);
    expect(docs.every((doc) => doc.version === 1 && doc.isCurrent)).toBe(true);

    const manager = docs.find((doc) => doc.roleCode === 'manager');
    expect(manager?.permissions).toEqual(
      expect.arrayContaining(['orders:create', 'orders:read', 'employees:create']),
    );
  });

  it("insère une nouvelle version et désactive l'ancienne quand la matrice change, sans jamais la modifier en place", async () => {
    const before = await RoleDefinitionModel.findOne({
      roleCode: 'waiter',
      isCurrent: true,
    }).lean();

    await RoleDefinitionModel.updateOne(
      { roleCode: 'waiter', isCurrent: true },
      { $set: { isCurrent: false } },
    );
    await RoleDefinitionModel.create({
      roleCode: 'waiter',
      version: (before?.version ?? 1) + 1,
      permissions: [...(before?.permissions ?? []), 'orders:cancel'],
      effectiveFrom: new Date(),
      isCurrent: true,
    });

    const allWaiterVersions = await RoleDefinitionModel.find({ roleCode: 'waiter' })
      .sort({ version: 1 })
      .lean();

    expect(allWaiterVersions).toHaveLength(2);
    expect(allWaiterVersions[0]).toMatchObject({ version: before?.version, isCurrent: false });
    expect(allWaiterVersions[1]).toMatchObject({
      version: (before?.version ?? 1) + 1,
      isCurrent: true,
    });
    expect(allWaiterVersions[1]?.permissions).toContain('orders:cancel');
  });

  it("rejette une seconde version courante pour le même rôle via l'index partiel unique", async () => {
    // `kitchen` a déjà sa version 1 courante depuis le premier test de ce
    // fichier (seedRoleDefinitions) — l'index partiel unique
    // {roleCode:1, isCurrent:true} doit bloquer une seconde version
    // courante concurrente.
    await expect(
      RoleDefinitionModel.create({
        roleCode: 'kitchen',
        version: 100,
        permissions: ['orders:read'],
        effectiveFrom: new Date(),
        isCurrent: true,
      }),
    ).rejects.toThrow();
  });
});
