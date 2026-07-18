import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../../app.js';
import { connectDatabase, disconnectDatabase } from '../../../config/database.js';
import { connectRedis, disconnectRedis } from '../../../config/redis.js';
import { HelloWorldModel } from '../../../database/models/helloWorld.model.js';
import {
  cleanupTenantFixtures,
  createTenantFixture,
  type TenantFixture,
} from '../../../shared/testing/tenantIsolationFixtures.js';

interface SuccessBody {
  success: true;
  data: { message: string; tenantId: string }[] | { message: string; tenantId: string };
}
interface ErrorBody {
  success: false;
  error: { code: string; message: string; details: unknown[] };
}

// En local, `.env` n'est chargé par personne avant ce fichier (volontaire :
// config/env.ts ne doit pas être importé ici, doc 14 §14.6 — un contributeur
// sans `.env` ne doit pas casser les tests unitaires des autres fichiers).
// En CI, `.env` n'existe pas et n'a pas besoin d'exister : les secrets sont
// déjà dans `process.env` (`.github/workflows/ci.yml`).
const envPath = resolve(import.meta.dirname, '../../../../../../.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const mongodbUri = process.env.MONGODB_URI;
const redisUrl = process.env.REDIS_URL;
const jwtSecret = process.env.JWT_SECRET;
const hasRealCredentials = Boolean(mongodbUri && redisUrl && jwtSecret);

/**
 * Test d'intégration bout-en-bout du module de référence (doc 12, doc 15
 * §Phase 0) : HTTP -> `requireAuth` -> `resolveTenant` -> controller ->
 * service -> repository -> BaseRepository (tenantId obligatoire) ->
 * tenantScope (champ + garde-fou) -> vrai MongoDB Atlas (base
 * `quicktable-staging`) + Redis Upstash — pas des mocks. Branché sur
 * l'auth réelle depuis que `tenant.middleware.ts` existe (Feature 1.3) —
 * remplace le `DEMO_TENANT_ID` fixe de Feature 0.3, qui a servi tant
 * qu'aucun middleware tenant n'existait. Tourne en CI via les secrets
 * `MONGODB_URI`/`REDIS_URL`/`JWT_SECRET` (`.github/workflows/ci.yml`), et
 * localement via `.env`. Sauté proprement (pas d'échec) si absent, pour
 * qu'un contributeur sans ces credentials ne casse pas toute la suite.
 */
describe.skipIf(!hasRealCredentials)('hello-world — intégration bout-en-bout', () => {
  const fixtures: TenantFixture[] = [];

  async function fixture(tenantId: string): Promise<TenantFixture> {
    const created = await createTenantFixture({ tenantId, jwtSecret: jwtSecret as string });
    fixtures.push(created);
    return created;
  }

  beforeAll(async () => {
    await connectDatabase(mongodbUri as string);
    await connectRedis(redisUrl as string);
    await HelloWorldModel.collection.deleteMany({});
  });

  afterAll(async () => {
    await cleanupTenantFixtures(fixtures);
    await HelloWorldModel.collection.deleteMany({});
    await disconnectDatabase();
    await disconnectRedis();
  });

  it('POST crée un document réel, GET le retrouve, scoping tenant respecté', async () => {
    const tenantA = await fixture('hello-world-integration-tenant-a');
    const app = createApp();

    const createResponse = await request(app)
      .post('/api/v1/hello-world')
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ message: 'Bonjour QuickTable' });
    const createBody = createResponse.body as SuccessBody;

    expect(createResponse.status).toBe(201);
    expect(createBody.data).toMatchObject({
      message: 'Bonjour QuickTable',
      tenantId: tenantA.tenantId,
    });

    const listResponse = await request(app)
      .get('/api/v1/hello-world')
      .set('Authorization', `Bearer ${tenantA.accessToken}`);
    const listBody = listResponse.body as SuccessBody;
    const messages = (listBody.data as { message: string }[]).map((d) => d.message);

    expect(listResponse.status).toBe(200);
    expect(messages).toContain('Bonjour QuickTable');
  });

  it('rejette (401 AUTH_TOKEN_MISSING) une requête sans Authorization', async () => {
    const response = await request(createApp()).get('/api/v1/hello-world');
    const body = response.body as ErrorBody;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('AUTH_TOKEN_MISSING');
  });

  it("n'expose jamais à un tenant B un document créé par un tenant A (isolation réelle, doc 06 §6.4)", async () => {
    const tenantA = await fixture('hello-world-integration-tenant-a');
    const tenantB = await fixture('hello-world-integration-tenant-b');
    const app = createApp();

    await request(app)
      .post('/api/v1/hello-world')
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ message: 'Secret tenant A' });

    const response = await request(app)
      .get('/api/v1/hello-world')
      .set('Authorization', `Bearer ${tenantB.accessToken}`);
    const body = response.body as SuccessBody;
    const messages = (body.data as { message: string }[]).map((d) => d.message);

    expect(messages).not.toContain('Secret tenant A');
  });

  it('rejette un payload invalide en 400 avec un code typé, jamais 500', async () => {
    const tenantA = await fixture('hello-world-integration-tenant-a');

    const response = await request(createApp())
      .post('/api/v1/hello-world')
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ message: '' });
    const body = response.body as ErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('HELLO_WORLD_INVALID_PAYLOAD');
  });
});
