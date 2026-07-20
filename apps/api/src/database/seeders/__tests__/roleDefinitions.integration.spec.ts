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
 *
 * `roleDefinitions` est une collection globale, **non tenant-scoped**
 * (doc 08 §8.1) — contrairement à tout le reste testé dans ce projet, où
 * chaque fichier d'intégration namespace ses données par `tenantId`
 * unique, il n'existe aucune dimension pour isoler ce fichier des autres
 * suites qui touchent aussi `roleDefinitions`
 * (`rbac.middleware.integration.spec.ts`,
 * `rbac.permissionMatrix.integration.spec.ts`, toutes deux Feature 1.4)
 * quand elles s'exécutent en parallèle (comportement par défaut de
 * Vitest entre fichiers). Ce fichier ne fait donc plus de
 * `deleteMany({})` sur la collection entière (bug réel découvert en
 * écrivant `rbac.permissionMatrix.integration.spec.ts` : un `deleteMany`
 * concurrent effaçait la vraie matrice pendant qu'un autre fichier
 * l'interrogeait) — `seedRoleDefinitions()` est idempotent et
 * suffisant ; le test de versionnement restaure explicitement l'état
 * d'origine à la fin plutôt que de compter sur un nettoyage global.
 */
describe.skipIf(!hasRealCredentials)('roleDefinitions seed — intégration MongoDB réelle', () => {
  beforeAll(async () => {
    await connectDatabase(mongodbUri as string);
    // Même précaution que countryDefaults.integration.spec.ts : les index
    // sont construits en arrière-plan après compilation du modèle, sans
    // cet await le test d'unicité ci-dessous serait flaky.
    await RoleDefinitionModel.createIndexes();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('seed les 5 rôles en version 1 et reste idempotent au second passage (pas de doublon de version)', async () => {
    await seedRoleDefinitions();
    await seedRoleDefinitions();

    const docs = await RoleDefinitionModel.find({ isCurrent: true }).lean();
    expect(docs).toHaveLength(ROLE_DEFINITIONS_SEED_DATA.length);
    expect(docs.every((doc) => doc.version === 1)).toBe(true);

    const manager = docs.find((doc) => doc.roleCode === 'manager');
    expect(manager?.permissions).toEqual(
      expect.arrayContaining(['orders:create', 'orders:read', 'employees:create']),
    );
  });

  it("insère une nouvelle version et désactive l'ancienne quand la matrice change, sans jamais la modifier en place, puis restaure l'état d'origine", async () => {
    await seedRoleDefinitions();
    const before = await RoleDefinitionModel.findOne({
      roleCode: 'waiter',
      isCurrent: true,
    }).lean();

    // Permission synthétique (jamais une vraie permission métier de la
    // matrice doc 08 §8.4) : n'entre jamais en collision avec les
    // assertions d'un autre fichier lu pendant la fenêtre où cette
    // mutation est active (`rbac.permissionMatrix.integration.spec.ts`).
    await RoleDefinitionModel.updateOne(
      { roleCode: 'waiter', isCurrent: true },
      { $set: { isCurrent: false } },
    );
    await RoleDefinitionModel.create({
      roleCode: 'waiter',
      version: (before?.version ?? 1) + 1,
      permissions: [...(before?.permissions ?? []), 'test:versioning_probe'],
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
    expect(allWaiterVersions[1]?.permissions).toContain('test:versioning_probe');

    // Restauration : supprime la version de test et redonne la main à la
    // version d'origine, pour laisser `waiter` conforme à la vraie
    // matrice pour le reste de la suite (ce fichier ne fait plus de
    // nettoyage global, voir la note en tête de fichier).
    await RoleDefinitionModel.deleteOne({
      roleCode: 'waiter',
      version: allWaiterVersions[1]?.version,
    });
    await RoleDefinitionModel.updateOne(
      { roleCode: 'waiter', version: before?.version },
      { $set: { isCurrent: true } },
    );
  });

  it("rejette une seconde version courante pour le même rôle via l'index partiel unique", async () => {
    await seedRoleDefinitions();
    // `kitchen` a déjà une version courante à ce stade (`seedRoleDefinitions`
    // ci-dessus) — l'index partiel unique {roleCode:1, isCurrent:true}
    // doit bloquer une seconde version courante concurrente.
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
