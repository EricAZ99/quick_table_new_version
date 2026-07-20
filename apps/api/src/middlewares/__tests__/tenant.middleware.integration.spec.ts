import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import { MembershipModel } from '../../database/models/membership.model.js';
import { correlationIdMiddleware } from '../correlationId.middleware.js';
import { errorHandlerMiddleware } from '../error-handler.middleware.js';
import { i18nMiddleware } from '../i18n.middleware.js';
import { requireAuth } from '../auth.middleware.js';
import { resolveTenant } from '../tenant.middleware.js';
import { signAccessToken, type AccessTokenPayload } from '../../modules/auth/jwt.js';

const envPath = resolve(import.meta.dirname, '../../../../../.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const mongodbUri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET;
const hasRealCredentials = Boolean(mongodbUri && jwtSecret);

/**
 * `resolveTenant` n'est pas encore monté sur une route réelle de
 * l'application (aucun endpoint tenant-scoped n'existe avant Epic 2) — ce
 * fichier construit une mini-app Express dédiée juste pour exercer la
 * vraie chaîne `requireAuth` -> `resolveTenant` contre un vrai MongoDB
 * Atlas, plutôt que de laisser cette logique testée uniquement par des
 * mocks (doc 14 §14.6).
 */
describe.skipIf(!hasRealCredentials)('resolveTenant — intégration réelle', () => {
  function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use(correlationIdMiddleware);
    app.use(i18nMiddleware);
    app.get('/protected', requireAuth, resolveTenant, (req, res) => {
      res.status(200).json({ success: true, data: req.context });
    });
    app.use(errorHandlerMiddleware);
    return app;
  }

  function signToken(payload: Partial<AccessTokenPayload>): string {
    return signAccessToken(
      {
        sub: 'user-a',
        membershipId: null,
        tenantId: null,
        role: null,
        isSuperAdmin: false,
        permissionsVersion: 0,
        ...payload,
      },
      jwtSecret as string,
    );
  }

  beforeAll(async () => {
    await connectDatabase(mongodbUri as string);
  });

  afterAll(async () => {
    await MembershipModel.collection.deleteMany({ tenantId: 'tenant-middleware-integration' });
    await disconnectDatabase();
  });

  it('résout le contexte tenant pour un membership réel actif', async () => {
    const membership = await MembershipModel.create({
      tenantId: 'tenant-middleware-integration',
      userId: '65f000000000000000000001',
      role: 'waiter',
      permissionsOverrides: ['payments:refund'],
    });
    const token = signToken({
      sub: '65f000000000000000000001',
      tenantId: 'tenant-middleware-integration',
      membershipId: membership._id.toString(),
      role: 'waiter',
    });

    const response = await request(createTestApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        tenantId: 'tenant-middleware-integration',
        userId: '65f000000000000000000001',
        membershipId: membership._id.toString(),
        role: 'waiter',
        isSuperAdmin: false,
        permissionsOverrides: ['payments:refund'],
      },
    });
  });

  it("rejette (403 TENANT_MEMBERSHIP_INACTIVE) un membership réel désactivé (employmentStatus: 'inactive')", async () => {
    const membership = await MembershipModel.create({
      tenantId: 'tenant-middleware-integration',
      userId: '65f000000000000000000002',
      role: 'cashier',
      employmentStatus: 'inactive',
    });
    const token = signToken({
      sub: '65f000000000000000000002',
      tenantId: 'tenant-middleware-integration',
      membershipId: membership._id.toString(),
      role: 'cashier',
    });

    const response = await request(createTestApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      'TENANT_MEMBERSHIP_INACTIVE',
    );
  });

  it("rejette (403 TENANT_MEMBERSHIP_INACTIVE) un membershipId qui n'existe plus en base (JWT stale)", async () => {
    const token = signToken({
      sub: '65f000000000000000000003',
      tenantId: 'tenant-middleware-integration',
      membershipId: '65f0000000000000000000ff',
      role: 'manager',
    });

    const response = await request(createTestApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      'TENANT_MEMBERSHIP_INACTIVE',
    );
  });

  it('laisse passer un super_admin sans tenantId (context.tenantId=null)', async () => {
    const token = signToken({ sub: '65f000000000000000000004', isSuperAdmin: true });

    const response = await request(createTestApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        tenantId: null,
        userId: '65f000000000000000000004',
        membershipId: null,
        role: null,
        isSuperAdmin: true,
        permissionsOverrides: [],
      },
    });
  });

  it('rejette (400 TENANT_CONTEXT_REQUIRED) un utilisateur non super_admin sans tenantId', async () => {
    const token = signToken({ sub: '65f000000000000000000005' });

    const response = await request(createTestApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      'TENANT_CONTEXT_REQUIRED',
    );
  });
});
