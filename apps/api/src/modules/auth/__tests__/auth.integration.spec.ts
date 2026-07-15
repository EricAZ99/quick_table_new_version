import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../../app.js';
import { connectDatabase, disconnectDatabase } from '../../../config/database.js';
import { connectRedis, disconnectRedis } from '../../../config/redis.js';
import { MembershipModel } from '../../../database/models/membership.model.js';
import { UserModel } from '../../../database/models/user.model.js';

// Même convention que hello-world.integration.spec.ts (doc 14 §14.6).
const envPath = resolve(import.meta.dirname, '../../../../../../.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const mongodbUri = process.env.MONGODB_URI;
const redisUrl = process.env.REDIS_URL;
const jwtSecret = process.env.JWT_SECRET;
const hasRealCredentials = Boolean(mongodbUri && redisUrl && jwtSecret);

interface SuccessBody {
  success: true;
  data: {
    accessToken: string;
    user: { email: string; passwordHash?: string };
    tenants: { tenantId: string; role: string; membershipId: string }[];
  };
}
interface ErrorBody {
  success: false;
  error: { code: string; message: string };
}

/**
 * Intégration Express réelle bout en bout (doc 12, Feature 1.2) :
 * HTTP -> controller -> service -> Argon2id -> repositories -> vrai
 * MongoDB Atlas + vrai Redis Upstash (rate limiting), pas des mocks.
 */
describe.skipIf(!hasRealCredentials)('POST /api/v1/auth/login — intégration réelle', () => {
  const password = 'un-mot-de-passe-de-test-solide';
  let email: string;

  beforeAll(async () => {
    await connectDatabase(mongodbUri as string);
    await connectRedis(redisUrl as string);
  });

  afterAll(async () => {
    await UserModel.collection.deleteMany({ email: /^auth-integration-/ });
    await MembershipModel.collection.deleteMany({ tenantId: 'auth-integration-tenant' });
    await disconnectDatabase();
    await disconnectRedis();
  });

  beforeAll(() => {
    email = `auth-integration-${Date.now()}@quicktable.io`;
  });

  it('connecte avec succès un utilisateur avec un seul membership, résout automatiquement le tenant', async () => {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await UserModel.create({ email, passwordHash, fullName: 'Intégration Login' });
    await MembershipModel.create({
      tenantId: 'auth-integration-tenant',
      userId: user._id,
      role: 'waiter',
    });

    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email, password });
    const body = response.body as SuccessBody;

    expect(response.status).toBe(200);
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.user.email).toBe(email);
    expect(body.data.user.passwordHash).toBeUndefined();
    expect(body.data.tenants).toHaveLength(1);
    expect(body.data.tenants[0]).toMatchObject({
      tenantId: 'auth-integration-tenant',
      role: 'waiter',
    });
    expect(typeof body.data.tenants[0]?.membershipId).toBe('string');

    const setCookie = response.headers['set-cookie'] as unknown as string[];
    expect(setCookie.some((cookie) => cookie.startsWith('refreshToken='))).toBe(true);
    expect(setCookie.some((cookie) => /httponly/i.test(cookie))).toBe(true);
  });

  it('rejette un mot de passe incorrect avec un code générique (401 AUTH_INVALID_CREDENTIALS)', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email, password: 'mauvais-mot-de-passe' });
    const body = response.body as ErrorBody;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('rejette un email inconnu avec le même code générique (anti-énumération)', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email: `inconnu-${Date.now()}@quicktable.io`, password });
    const body = response.body as ErrorBody;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('rejette un payload invalide en 400 AUTH_INVALID_PAYLOAD', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email: 'pas-un-email' });
    const body = response.body as ErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('AUTH_INVALID_PAYLOAD');
  });

  it('verrouille progressivement après 5 tentatives échouées (doc 07 §7.8, doc 13 §13.2)', async () => {
    const lockedEmail = `auth-integration-ratelimit-${Date.now()}@quicktable.io`;
    const app = createApp();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: lockedEmail, password: 'toujours-faux' });
      expect(response.status).toBe(401);
    }

    const sixthAttempt = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: lockedEmail, password: 'toujours-faux' });
    const body = sixthAttempt.body as ErrorBody;

    expect(sixthAttempt.status).toBe(429);
    expect(body.error.code).toBe('AUTH_LOGIN_RATE_LIMITED');
  }, 20000);
});
