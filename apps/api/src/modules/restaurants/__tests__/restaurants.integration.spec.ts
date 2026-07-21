import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectDatabase, disconnectDatabase } from '../../../config/database.js';
import { RestaurantModel } from '../../../database/models/restaurant.model.js';
import { UserModel } from '../../../database/models/user.model.js';
import { seedRoleDefinitions } from '../../../database/seeders/roleDefinitions.seed.js';
import { signAccessToken } from '../../auth/jwt.js';
import {
  cleanupTenantFixtures,
  createTenantFixture,
  type TenantFixture,
} from '../../../shared/testing/tenantIsolationFixtures.js';
import { createApp } from '../../../app.js';

interface SuccessBody {
  success: true;
  data: Record<string, unknown> | { country: string | null; city: string | null };
}
interface ErrorBody {
  success: false;
  error: { code: string; message: string; details: unknown[] };
}

describe('GET /api/v1/restaurants/detect-location — intégration Express réelle', () => {
  it('répond 200 avec une enveloppe standard, jamais une erreur, pour une IP de test locale', async () => {
    const response = await request(createApp()).get('/api/v1/restaurants/detect-location');
    const body = response.body as SuccessBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('country');
    expect(body.data).toHaveProperty('city');
  }, 10000);

  it('est accessible sans authentification (endpoint Public, doc 09 §9.1)', async () => {
    const response = await request(createApp()).get('/api/v1/restaurants/detect-location');

    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  }, 10000);
});

const envPath = resolve(import.meta.dirname, '../../../../../../.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const mongodbUri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET;
const hasRealCredentials = Boolean(mongodbUri && jwtSecret);

/**
 * `restaurants` CRUD (doc 09 §9.3/§9.4) contre un vrai MongoDB Atlas (doc
 * 14 §14.6) : `POST /platform/restaurants` (provisioning réduit, doc 06
 * §6.7, décision validée avec toi — restaurant + membership owner, pas de
 * `subscriptions`, Feature 9.1 pas commencée) et `GET/PATCH
 * /restaurants/me`(`/settings`). Utilise `seedRoleDefinitions()` (réel,
 * idempotent, jamais de `deleteMany` sur cette collection globale — voir
 * la note de `roleDefinitions.integration.spec.ts`, Feature 1.4) pour que
 * les vérifications RBAC (`restaurant_owner` vs `waiter`) soient réelles.
 */
describe.skipIf(!hasRealCredentials)('restaurants CRUD — intégration réelle', () => {
  const createdUserIds: string[] = [];
  const createdRestaurantIds: string[] = [];
  const fixtures: TenantFixture[] = [];

  function superAdminToken(): string {
    return signAccessToken(
      {
        sub: 'super-admin-restaurants-integration',
        tenantId: null,
        membershipId: null,
        role: null,
        isSuperAdmin: true,
        permissionsVersion: 0,
      },
      jwtSecret as string,
    );
  }

  async function createOwnerUser(): Promise<string> {
    const user = await UserModel.create({
      email: `owner-${Date.now()}-${Math.random().toString(36).slice(2)}@restaurants-integration.local`,
      passwordHash: 'irrelevant-for-this-test',
      fullName: 'Owner Integration Test',
    });
    createdUserIds.push(user._id.toString());
    return user._id.toString();
  }

  async function createRealRestaurant(): Promise<{ restaurantId: string; ownerId: string }> {
    const ownerId = await createOwnerUser();
    const response = await request(createApp())
      .post('/api/v1/platform/restaurants')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({
        name: `Chez Amara ${Date.now()}`,
        country: 'BJ',
        countryDetectionMethod: 'manual',
        locale: 'fr',
        timezone: 'Africa/Porto-Novo',
        currency: 'XOF',
        ownerId,
      });
    const body = response.body as SuccessBody;
    const restaurantId = (body.data as { _id: string })._id;
    createdRestaurantIds.push(restaurantId);
    return { restaurantId, ownerId };
  }

  async function fixtureFor(
    tenantId: string,
    role: 'restaurant_owner' | 'waiter',
  ): Promise<TenantFixture> {
    const created = await createTenantFixture({ tenantId, jwtSecret: jwtSecret as string, role });
    fixtures.push(created);
    return created;
  }

  beforeAll(async () => {
    await connectDatabase(mongodbUri as string);
    await seedRoleDefinitions();
  });

  afterAll(async () => {
    await cleanupTenantFixtures(fixtures);
    await RestaurantModel.collection.deleteMany({
      _id: { $in: createdRestaurantIds.map((id) => new Types.ObjectId(id)) },
    });
    await UserModel.collection.deleteMany({
      _id: { $in: createdUserIds.map((id) => new Types.ObjectId(id)) },
    });
    await disconnectDatabase();
  });

  describe('POST /api/v1/platform/restaurants', () => {
    it('crée réellement le restaurant et le membership restaurant_owner (provisioning réduit, doc 06 §6.7)', async () => {
      const ownerId = await createOwnerUser();

      const response = await request(createApp())
        .post('/api/v1/platform/restaurants')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({
          name: 'Chez Amara',
          country: 'BJ',
          countryDetectionMethod: 'manual',
          locale: 'fr',
          timezone: 'Africa/Porto-Novo',
          currency: 'XOF',
          ownerId,
        });
      const body = response.body as SuccessBody;
      const restaurant = body.data as { _id: string; slug: string; status: string };
      createdRestaurantIds.push(restaurant._id);

      expect(response.status).toBe(201);
      expect(restaurant.slug).toBe('chez-amara');
      expect(restaurant.status).toBe('trial');

      const owner = await fixtureFor(restaurant._id, 'restaurant_owner');
      const meResponse = await request(createApp())
        .get('/api/v1/restaurants/me')
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(meResponse.status).toBe(200);
    });

    it('rejette (403 RBAC_PERMISSION_DENIED) un appelant non super_admin', async () => {
      const { restaurantId } = await createRealRestaurant();
      const owner = await fixtureFor(restaurantId, 'restaurant_owner');

      const response = await request(createApp())
        .post('/api/v1/platform/restaurants')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          name: 'Autre restaurant',
          country: 'FR',
          countryDetectionMethod: 'manual',
          locale: 'fr',
          timezone: 'Europe/Paris',
          currency: 'EUR',
          ownerId: owner.userId,
        });

      expect(response.status).toBe(403);
      expect((response.body as ErrorBody).error.code).toBe('RBAC_PERMISSION_DENIED');
    });

    it('rejette (404 RESTAURANT_OWNER_NOT_FOUND) un ownerId qui ne correspond à aucun utilisateur', async () => {
      const response = await request(createApp())
        .post('/api/v1/platform/restaurants')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({
          name: 'Restaurant fantôme',
          country: 'BJ',
          countryDetectionMethod: 'manual',
          locale: 'fr',
          timezone: 'Africa/Porto-Novo',
          currency: 'XOF',
          ownerId: '65f0000000000000000000ff',
        });

      expect(response.status).toBe(404);
      expect((response.body as ErrorBody).error.code).toBe('RESTAURANT_OWNER_NOT_FOUND');
    });

    it('rejette (400 RESTAURANT_INVALID_PAYLOAD) un payload sans country', async () => {
      const ownerId = await createOwnerUser();

      const response = await request(createApp())
        .post('/api/v1/platform/restaurants')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({
          name: 'Restaurant incomplet',
          countryDetectionMethod: 'manual',
          locale: 'fr',
          timezone: 'Africa/Porto-Novo',
          currency: 'XOF',
          ownerId,
        });

      expect(response.status).toBe(400);
      expect((response.body as ErrorBody).error.code).toBe('RESTAURANT_INVALID_PAYLOAD');
    });

    it('rejette (401 AUTH_TOKEN_MISSING) une requête sans Authorization', async () => {
      const response = await request(createApp()).post('/api/v1/platform/restaurants').send({});

      expect(response.status).toBe(401);
      expect((response.body as ErrorBody).error.code).toBe('AUTH_TOKEN_MISSING');
    });
  });

  describe('GET /api/v1/restaurants/me', () => {
    it('répond 200 avec le restaurant du tenant courant', async () => {
      const { restaurantId } = await createRealRestaurant();
      const owner = await fixtureFor(restaurantId, 'restaurant_owner');

      const response = await request(createApp())
        .get('/api/v1/restaurants/me')
        .set('Authorization', `Bearer ${owner.accessToken}`);
      const body = response.body as SuccessBody;

      expect(response.status).toBe(200);
      expect((body.data as { _id: string })._id).toBe(restaurantId);
    });

    it('rejette (401 AUTH_TOKEN_MISSING) une requête sans Authorization', async () => {
      const response = await request(createApp()).get('/api/v1/restaurants/me');

      expect(response.status).toBe(401);
      expect((response.body as ErrorBody).error.code).toBe('AUTH_TOKEN_MISSING');
    });
  });

  describe('PATCH /api/v1/restaurants/me', () => {
    it('met réellement à jour le nom (restaurant_owner, restaurants:update)', async () => {
      const { restaurantId } = await createRealRestaurant();
      const owner = await fixtureFor(restaurantId, 'restaurant_owner');

      const response = await request(createApp())
        .patch('/api/v1/restaurants/me')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name: 'Nouveau nom' });
      const body = response.body as SuccessBody;

      expect(response.status).toBe(200);
      expect((body.data as { name: string }).name).toBe('Nouveau nom');

      const persisted = await RestaurantModel.findById(restaurantId).lean();
      expect(persisted?.name).toBe('Nouveau nom');
    });

    it('rejette (403 RBAC_PERMISSION_DENIED) un waiter (restaurants:update réservé à owner/manager)', async () => {
      const { restaurantId } = await createRealRestaurant();
      const waiter = await fixtureFor(restaurantId, 'waiter');

      const response = await request(createApp())
        .patch('/api/v1/restaurants/me')
        .set('Authorization', `Bearer ${waiter.accessToken}`)
        .send({ name: 'Nouveau nom' });

      expect(response.status).toBe(403);
      expect((response.body as ErrorBody).error.code).toBe('RBAC_PERMISSION_DENIED');
    });

    it('rejette (400 RESTAURANT_INVALID_PAYLOAD) un openingHours mal formé', async () => {
      const { restaurantId } = await createRealRestaurant();
      const owner = await fixtureFor(restaurantId, 'restaurant_owner');

      const response = await request(createApp())
        .patch('/api/v1/restaurants/me')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ openingHours: [{ day: 'monday', open: '9h', close: '18:00' }] });

      expect(response.status).toBe(400);
      expect((response.body as ErrorBody).error.code).toBe('RESTAURANT_INVALID_PAYLOAD');
    });
  });

  describe('PATCH /api/v1/restaurants/me/settings', () => {
    it('met réellement à jour la devise (restaurant_owner, restaurants:manage_settings)', async () => {
      const { restaurantId } = await createRealRestaurant();
      const owner = await fixtureFor(restaurantId, 'restaurant_owner');

      const response = await request(createApp())
        .patch('/api/v1/restaurants/me/settings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ currency: 'eur' });
      const body = response.body as SuccessBody;

      expect(response.status).toBe(200);
      expect((body.data as { currency: string }).currency).toBe('EUR');
    });

    it('rejette (403 RBAC_PERMISSION_DENIED) un waiter', async () => {
      const { restaurantId } = await createRealRestaurant();
      const waiter = await fixtureFor(restaurantId, 'waiter');

      const response = await request(createApp())
        .patch('/api/v1/restaurants/me/settings')
        .set('Authorization', `Bearer ${waiter.accessToken}`)
        .send({ currency: 'eur' });

      expect(response.status).toBe(403);
      expect((response.body as ErrorBody).error.code).toBe('RBAC_PERMISSION_DENIED');
    });
  });
});
