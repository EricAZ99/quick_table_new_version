import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { NextFunction, Request, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import type { MembershipRole } from '../../database/models/membership.model.js';
import { seedRoleDefinitions } from '../../database/seeders/roleDefinitions.seed.js';
import { requirePermissionAsync } from '../rbac.middleware.js';
import type { TenantContext } from '../tenant.middleware.js';

const envPath = resolve(import.meta.dirname, '../../../../../.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const mongodbUri = process.env.MONGODB_URI;
const hasRealCredentials = Boolean(mongodbUri);

/**
 * Sweep de bout en bout de la matrice doc 08 §8.4 contre le **vrai** seed
 * (`seedRoleDefinitions()`, pas des `roleDefinitions` fabriqués à la main
 * comme dans `rbac.middleware.integration.spec.ts`) et le vrai
 * `requirePermissionAsync`, contre un vrai MongoDB Atlas (doc 14 §14.6) —
 * prouve que seed, matrice documentée et application réelle restent
 * cohérents. Appelle `requirePermissionAsync` directement (pas de route
 * HTTP) : chaque permission de la matrice correspond à une route dédiée
 * par construction (doc 08 §8.7, permission déclarée en dur par route),
 * en monter des dizaines juste pour ce sweep serait un détour inutile.
 * Redis volontairement non connecté ici : `getCachedPermissions` échoue
 * silencieusement (client non initialisé, best-effort) et retombe sur
 * `roleDefinitions`, déjà couvert par ce test — le comportement du cache
 * lui-même est testé séparément (`rbac.middleware.integration.spec.ts`).
 *
 * Pas de `deleteMany({})` ici (bug réel découvert en écrivant ce
 * fichier : `roleDefinitions` est global, non tenant-scoped, doc 08
 * §8.1 — un `deleteMany` concurrent avec un autre fichier d'intégration
 * qui touche la même collection en parallèle, comportement Vitest par
 * défaut entre fichiers, effaçait la matrice pendant que ce sweep la
 * lisait). `seedRoleDefinitions()` seul suffit, idempotent.
 */
describe.skipIf(!hasRealCredentials)(
  'Matrice de permissions — sweep réel via requirePermissionAsync',
  () => {
    beforeAll(async () => {
      await connectDatabase(mongodbUri as string);
      await seedRoleDefinitions();
    });

    afterAll(async () => {
      await disconnectDatabase();
    });

    function contextFor(role: MembershipRole): TenantContext {
      return {
        tenantId: 'permission-matrix-sweep',
        userId: 'user-sweep',
        membershipId: `membership-${role}`,
        role,
        isSuperAdmin: false,
        permissionsOverrides: [],
      };
    }

    async function check(role: MembershipRole, permission: string): Promise<'granted' | 'denied'> {
      let capturedError: unknown;
      const next = ((error?: unknown) => {
        capturedError = error;
      }) as unknown as NextFunction;
      const req = { context: contextFor(role) } as unknown as Request;

      await requirePermissionAsync(permission, req, {} as Response, next);

      return capturedError === undefined ? 'granted' : 'denied';
    }

    it.each`
      role                  | permission                         | expected
      ${'restaurant_owner'} | ${'billing:manage_payment_method'} | ${'granted'}
      ${'restaurant_owner'} | ${'audit-logs:read'}               | ${'granted'}
      ${'restaurant_owner'} | ${'employees:view_salary'}         | ${'granted'}
      ${'manager'}          | ${'employees:create'}              | ${'granted'}
      ${'manager'}          | ${'stock:manage_ingredients'}      | ${'granted'}
      ${'manager'}          | ${'employees:view_salary'}         | ${'denied'}
      ${'manager'}          | ${'audit-logs:read'}               | ${'denied'}
      ${'manager'}          | ${'billing:read'}                  | ${'denied'}
      ${'cashier'}          | ${'payments:print_receipt'}        | ${'granted'}
      ${'cashier'}          | ${'orders:read'}                   | ${'granted'}
      ${'cashier'}          | ${'orders:create'}                 | ${'denied'}
      ${'cashier'}          | ${'payments:refund'}               | ${'denied'}
      ${'kitchen'}          | ${'kitchen:update_item_status'}    | ${'granted'}
      ${'kitchen'}          | ${'menus:toggle_availability'}     | ${'granted'}
      ${'kitchen'}          | ${'payments:create'}               | ${'denied'}
      ${'kitchen'}          | ${'tables:change_status'}          | ${'denied'}
      ${'waiter'}           | ${'orders:transfer_table'}         | ${'granted'}
      ${'waiter'}           | ${'tables:change_status'}          | ${'granted'}
      ${'waiter'}           | ${'orders:cancel'}                 | ${'denied'}
      ${'waiter'}           | ${'reservations:read'}             | ${'denied'}
    `(
      "'$role' → '$permission' est $expected (matrice réelle, seedRoleDefinitions)",
      async ({
        role,
        permission,
        expected,
      }: {
        role: MembershipRole;
        permission: string;
        expected: 'granted' | 'denied';
      }) => {
        const result = await check(role, permission);
        expect(result).toBe(expected);
      },
    );
  },
);
