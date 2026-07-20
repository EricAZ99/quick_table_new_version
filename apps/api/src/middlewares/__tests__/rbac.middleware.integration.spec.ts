import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import { connectRedis, disconnectRedis, getRedisClient } from '../../config/redis.js';
import { MembershipModel } from '../../database/models/membership.model.js';
import { RoleDefinitionModel } from '../../database/models/roleDefinition.model.js';
import { UserModel } from '../../database/models/user.model.js';
import {
  cleanupTenantFixtures,
  createTenantFixture,
  type TenantFixture,
} from '../../shared/testing/tenantIsolationFixtures.js';
import { requireAuth } from '../auth.middleware.js';
import { correlationIdMiddleware } from '../correlationId.middleware.js';
import { errorHandlerMiddleware } from '../error-handler.middleware.js';
import { i18nMiddleware } from '../i18n.middleware.js';
import { requirePermission } from '../rbac.middleware.js';
import { resolveTenant } from '../tenant.middleware.js';

const envPath = resolve(import.meta.dirname, '../../../../../.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const mongodbUri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET;
const redisUrl = process.env.REDIS_URL;
const hasRealCredentials = Boolean(mongodbUri && jwtSecret);

const TENANT_ID = 'rbac-middleware-integration';

/**
 * Vérifie `requirePermission` contre une vraie chaîne `requireAuth` ->
 * `resolveTenant` -> `requirePermission` -> handler, un vrai
 * `roleDefinitions` (doc 22 §22.4) et un vrai `membership` — pas de
 * mocks (doc 14 §14.6). La majorité de ce fichier ne dépend pas de Redis
 * (`getCachedPermissions`/`setCachedPermissions` sont best-effort, doc 26
 * §26.6 — une absence de connexion Redis retombe silencieusement sur une
 * lecture directe de `roleDefinitions`) ; le sous-bloc dédié au cache,
 * plus bas, connecte un vrai Redis et vérifie explicitement son contenu.
 */
describe.skipIf(!hasRealCredentials)('requirePermission — intégration réelle', () => {
  const fixtures: TenantFixture[] = [];

  async function fixture(role: 'waiter' | 'restaurant_owner'): Promise<TenantFixture> {
    const created = await createTenantFixture({
      tenantId: TENANT_ID,
      jwtSecret: jwtSecret as string,
      role,
    });
    fixtures.push(created);
    return created;
  }

  function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use(correlationIdMiddleware);
    app.use(i18nMiddleware);
    app.get('/orders', requireAuth, resolveTenant, requirePermission('orders:read'), (_req, res) =>
      res.status(200).json({ success: true, data: [] }),
    );
    app.delete(
      '/settings',
      requireAuth,
      resolveTenant,
      requirePermission('settings:update'),
      (_req, res) => res.status(204).send(),
    );
    app.use(errorHandlerMiddleware);
    return app;
  }

  beforeAll(async () => {
    await connectDatabase(mongodbUri as string);
    await RoleDefinitionModel.collection.deleteMany({});
    await RoleDefinitionModel.create([
      {
        roleCode: 'waiter',
        version: 1,
        permissions: ['orders:read', 'orders:create'],
        effectiveFrom: new Date(),
        isCurrent: true,
      },
      {
        roleCode: 'restaurant_owner',
        version: 1,
        permissions: ['orders:read', 'settings:update'],
        effectiveFrom: new Date(),
        isCurrent: true,
      },
    ]);
    await RoleDefinitionModel.createIndexes();
  });

  afterAll(async () => {
    await cleanupTenantFixtures(fixtures);
    await MembershipModel.collection.deleteMany({ tenantId: TENANT_ID });
    await UserModel.collection.deleteMany({});
    await RoleDefinitionModel.collection.deleteMany({});
    await disconnectDatabase();
  });

  it('laisse passer un waiter sur orders:read (permission accordée par son rôle)', async () => {
    const waiter = await fixture('waiter');

    const response = await request(createTestApp())
      .get('/orders')
      .set('Authorization', `Bearer ${waiter.accessToken}`);

    expect(response.status).toBe(200);
  });

  it('rejette (403 RBAC_PERMISSION_DENIED) un waiter sur settings:update (permission réservée à owner)', async () => {
    const waiter = await fixture('waiter');

    const response = await request(createTestApp())
      .delete('/settings')
      .set('Authorization', `Bearer ${waiter.accessToken}`);

    expect(response.status).toBe(403);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      'RBAC_PERMISSION_DENIED',
    );
  });

  it('laisse passer un restaurant_owner sur settings:update', async () => {
    const owner = await fixture('restaurant_owner');

    const response = await request(createTestApp())
      .delete('/settings')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(response.status).toBe(204);
  });

  it('laisse passer un waiter sur settings:update quand permissionsOverrides le lui accorde explicitement (doc 08 §8.1)', async () => {
    const waiterWithOverride = await createTenantFixture({
      tenantId: TENANT_ID,
      jwtSecret: jwtSecret as string,
      role: 'waiter',
      permissionsOverrides: ['settings:update'],
    });
    fixtures.push(waiterWithOverride);

    const response = await request(createTestApp())
      .delete('/settings')
      .set('Authorization', `Bearer ${waiterWithOverride.accessToken}`);

    expect(response.status).toBe(204);
  });

  it('rejette (401 AUTH_TOKEN_MISSING) une requête sans Authorization', async () => {
    const response = await request(createTestApp()).get('/orders');

    expect(response.status).toBe(401);
    expect((response.body as { error: { code: string } }).error.code).toBe('AUTH_TOKEN_MISSING');
  });

  /**
   * Bloc séparé (connexion Redis propre, indépendante des autres tests de
   * ce fichier) : vérifie le contenu réel de `rbac:resolved:{membershipId}`
   * (doc 26 §26.2) et qu'un second appel ne relit plus `roleDefinitions`.
   */
  describe.skipIf(!redisUrl)('cache rbac:resolved (doc 26 §26.2)', () => {
    beforeAll(async () => {
      await connectRedis(redisUrl as string);
    });

    afterAll(async () => {
      await disconnectRedis();
    });

    it('met en cache les permissions résolues et évite une seconde lecture de roleDefinitions au second appel', async () => {
      const waiter = await fixture('waiter');
      const findOneSpy = vi.spyOn(RoleDefinitionModel, 'findOne');
      const app = createTestApp();

      const first = await request(app)
        .get('/orders')
        .set('Authorization', `Bearer ${waiter.accessToken}`);
      const second = await request(app)
        .get('/orders')
        .set('Authorization', `Bearer ${waiter.accessToken}`);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(findOneSpy).toHaveBeenCalledTimes(1);

      const cached = await getRedisClient().get(`rbac:resolved:${waiter.membershipId}`);
      expect(cached).not.toBeNull();
      expect(JSON.parse(cached as string)).toContain('orders:read');

      findOneSpy.mockRestore();
      await getRedisClient().del(`rbac:resolved:${waiter.membershipId}`);
    });
  });
});
