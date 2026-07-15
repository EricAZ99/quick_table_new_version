import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../../app.js';
import { connectDatabase, disconnectDatabase } from '../../../config/database.js';
import { connectRedis, disconnectRedis } from '../../../config/redis.js';
import { HelloWorldModel } from '../../../database/models/helloWorld.model.js';
import { DEMO_TENANT_ID } from '../hello-world.controller.js';

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
const hasRealCredentials = Boolean(mongodbUri && redisUrl);

/**
 * Test d'intégration bout-en-bout du module de référence (doc 12, doc 15
 * §Phase 0) : HTTP -> controller -> service -> repository -> BaseRepository
 * (tenantId obligatoire) -> tenantScope (champ + garde-fou) -> vrai MongoDB
 * Atlas (base `quicktable-staging`) + Redis Upstash — pas des mocks. Tourne
 * en CI via les secrets `MONGODB_URI`/`REDIS_URL` (`.github/workflows/ci.yml`),
 * et localement via `.env`. Sauté proprement (pas d'échec) si absent, pour
 * qu'un contributeur sans ces credentials ne casse pas toute la suite.
 */
describe.skipIf(!hasRealCredentials)('hello-world — intégration bout-en-bout', () => {
  beforeAll(async () => {
    await connectDatabase(mongodbUri as string);
    await connectRedis(redisUrl as string);
    await HelloWorldModel.collection.deleteMany({});
  });

  afterAll(async () => {
    await HelloWorldModel.collection.deleteMany({});
    await disconnectDatabase();
    await disconnectRedis();
  });

  it('POST crée un document réel, GET le retrouve, scoping tenant respecté', async () => {
    const app = createApp();

    const createResponse = await request(app)
      .post('/api/v1/hello-world')
      .send({ message: 'Bonjour QuickTable' });
    const createBody = createResponse.body as SuccessBody;

    expect(createResponse.status).toBe(201);
    expect(createBody.data).toMatchObject({
      message: 'Bonjour QuickTable',
      tenantId: DEMO_TENANT_ID,
    });

    const listResponse = await request(app).get('/api/v1/hello-world');
    const listBody = listResponse.body as SuccessBody;
    const messages = (listBody.data as { message: string }[]).map((d) => d.message);

    expect(listResponse.status).toBe(200);
    expect(messages).toContain('Bonjour QuickTable');
  });

  it("n'expose jamais un document d'un autre tenant (isolation réelle, doc 06)", async () => {
    await HelloWorldModel.create({ tenantId: 'un-autre-tenant', message: 'Secret autre tenant' });

    const response = await request(createApp()).get('/api/v1/hello-world');
    const body = response.body as SuccessBody;
    const messages = (body.data as { message: string }[]).map((d) => d.message);

    expect(messages).not.toContain('Secret autre tenant');
  });

  it('rejette un payload invalide en 400 avec un code typé, jamais 500', async () => {
    const response = await request(createApp()).post('/api/v1/hello-world').send({ message: '' });
    const body = response.body as ErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('HELLO_WORLD_INVALID_PAYLOAD');
  });
});
