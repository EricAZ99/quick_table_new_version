import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectDatabase, disconnectDatabase } from '../../../config/database.js';
import { HelloWorldModel } from '../../../database/models/helloWorld.model.js';
import { correlationIdMiddleware } from '../../../middlewares/correlationId.middleware.js';
import { errorHandlerMiddleware } from '../../../middlewares/error-handler.middleware.js';
import { i18nMiddleware } from '../../../middlewares/i18n.middleware.js';
import { requireAuth } from '../../../middlewares/auth.middleware.js';
import { resolveTenant } from '../../../middlewares/tenant.middleware.js';
import { HelloWorldRepository } from '../../../modules/hello-world/hello-world.repository.js';
import { NotFoundError } from '../../errors/index.js';
import {
  cleanupTenantFixtures,
  createTenantFixture,
  type TenantFixture,
} from '../tenantIsolationFixtures.js';

const envPath = resolve(import.meta.dirname, '../../../../../../.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const mongodbUri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET;
const hasRealCredentials = Boolean(mongodbUri && jwtSecret);

/**
 * Ce fichier ne teste pas un endpoint métier réel (aucun n'existe encore
 * derrière `requireAuth`/`resolveTenant`, `hello-world` restant le seul
 * modèle tenant-scoped disponible — voir sa propre note sur
 * `DEMO_TENANT_ID`, non branché sur l'auth réelle, hors périmètre de ce
 * ticket). Il démontre que l'infrastructure de fixtures
 * (`tenantIsolationFixtures.ts`) permet bien de faire remonter, à travers
 * la chaîne complète `requireAuth` -> `resolveTenant` -> `BaseRepository`,
 * le comportement attendu par doc 06 §6.4 point 3 : un tenant B ne peut
 * ni lire ni modifier une ressource de tenant A — toujours 404, jamais
 * 403 (anti-IDOR).
 */
describe.skipIf(!hasRealCredentials)("Infrastructure de tests d'isolation multi-tenant", () => {
  const repository = new HelloWorldRepository();
  const fixtures: TenantFixture[] = [];

  function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use(correlationIdMiddleware);
    app.use(i18nMiddleware);

    app.get('/resources/:id', requireAuth, resolveTenant, (req, res, next) => {
      repository
        .findOne({ _id: req.params.id }, { tenantId: req.context?.tenantId as string })
        .then((doc) => {
          if (!doc) {
            next(new NotFoundError('RESOURCE_NOT_FOUND', 'Ressource introuvable.'));
            return;
          }
          res.status(200).json({ success: true, data: doc });
        })
        .catch(next);
    });

    app.delete('/resources/:id', requireAuth, resolveTenant, (req, res, next) => {
      repository
        .deleteOne({ _id: req.params.id }, { tenantId: req.context?.tenantId as string })
        .then((result) => {
          if (result.deletedCount === 0) {
            next(new NotFoundError('RESOURCE_NOT_FOUND', 'Ressource introuvable.'));
            return;
          }
          res.status(204).send();
        })
        .catch(next);
    });

    app.use(errorHandlerMiddleware);
    return app;
  }

  async function fixture(tenantId: string): Promise<TenantFixture> {
    const created = await createTenantFixture({ tenantId, jwtSecret: jwtSecret as string });
    fixtures.push(created);
    return created;
  }

  beforeAll(async () => {
    await connectDatabase(mongodbUri as string);
  });

  afterAll(async () => {
    await cleanupTenantFixtures(fixtures);
    await HelloWorldModel.collection.deleteMany({
      tenantId: { $in: ['isolation-infra-tenant-a', 'isolation-infra-tenant-b'] },
    });
    await disconnectDatabase();
  });

  it('permet à un tenant de lire sa propre ressource (200)', async () => {
    const tenantA = await fixture('isolation-infra-tenant-a');
    const doc = await repository.create(
      { message: 'ressource tenant A' },
      { tenantId: tenantA.tenantId },
    );

    const response = await request(createTestApp())
      .get(`/resources/${doc._id.toString()}`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`);

    expect(response.status).toBe(200);
  });

  it("rejette (404 anti-IDOR) la lecture d'une ressource d'un autre tenant", async () => {
    const tenantA = await fixture('isolation-infra-tenant-a');
    const tenantB = await fixture('isolation-infra-tenant-b');
    const doc = await repository.create(
      { message: 'ressource tenant A' },
      { tenantId: tenantA.tenantId },
    );

    const response = await request(createTestApp())
      .get(`/resources/${doc._id.toString()}`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`);

    expect(response.status).toBe(404);
    expect((response.body as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it("rejette (404 anti-IDOR) la suppression d'une ressource d'un autre tenant, qui reste intacte", async () => {
    const tenantA = await fixture('isolation-infra-tenant-a');
    const tenantB = await fixture('isolation-infra-tenant-b');
    const doc = await repository.create(
      { message: 'ressource tenant A' },
      { tenantId: tenantA.tenantId },
    );

    const response = await request(createTestApp())
      .delete(`/resources/${doc._id.toString()}`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`);

    expect(response.status).toBe(404);
    const stillExists = await repository.findOne({ _id: doc._id }, { tenantId: tenantA.tenantId });
    expect(stillExists).not.toBeNull();
  });
});
