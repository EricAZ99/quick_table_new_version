import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../../app.js';
import { connectDatabase, disconnectDatabase } from '../../../config/database.js';
import { MembershipModel } from '../../../database/models/membership.model.js';
import { UserModel } from '../../../database/models/user.model.js';
import { seedRoleDefinitions } from '../../../database/seeders/roleDefinitions.seed.js';
import {
  cleanupTenantFixtures,
  createTenantFixture,
  type TenantFixture,
} from '../../../shared/testing/tenantIsolationFixtures.js';

interface SuccessBody {
  success: true;
  data: Record<string, unknown> | Record<string, unknown>[];
  meta?: { page: number; limit: number; total: number };
}
interface ErrorBody {
  success: false;
  error: { code: string; message: string };
}

const envPath = resolve(import.meta.dirname, '../../../../../../.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const mongodbUri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET;
const hasRealCredentials = Boolean(mongodbUri && jwtSecret);

/**
 * `employees` CRUD (doc 09 §9.5, Feature 2.2) contre un vrai MongoDB Atlas
 * (doc 14 §14.6). Contrairement à `restaurants.integration.spec.ts`, ne
 * provisionne pas de vrai `restaurants` document : `resolveTenant`
 * (`tenant.middleware.ts`) ne vérifie que le `membership`, jamais
 * l'existence d'un `restaurants` — même choix que
 * `tenantIsolationFixtures.integration.spec.ts`/
 * `rbac.middleware.integration.spec.ts`. Un `tenantId` frais
 * (`new Types.ObjectId().toString()`) par groupe de tests évite que des
 * employés créés par un test faussent la pagination/le comptage d'un
 * autre.
 */
describe.skipIf(!hasRealCredentials)('employees CRUD — intégration réelle', () => {
  const fixtures: TenantFixture[] = [];
  const inviteCreatedUserEmails: string[] = [];

  function freshTenantId(): string {
    return new Types.ObjectId().toString();
  }

  async function ownerFor(tenantId: string): Promise<TenantFixture> {
    const fixture = await createTenantFixture({
      tenantId,
      jwtSecret: jwtSecret as string,
      role: 'restaurant_owner',
    });
    fixtures.push(fixture);
    return fixture;
  }

  async function managerFor(
    tenantId: string,
    permissionsOverrides: string[] = [],
  ): Promise<TenantFixture> {
    const fixture = await createTenantFixture({
      tenantId,
      jwtSecret: jwtSecret as string,
      role: 'manager',
      permissionsOverrides,
    });
    fixtures.push(fixture);
    return fixture;
  }

  async function waiterFor(tenantId: string): Promise<TenantFixture> {
    const fixture = await createTenantFixture({
      tenantId,
      jwtSecret: jwtSecret as string,
      role: 'waiter',
    });
    fixtures.push(fixture);
    return fixture;
  }

  beforeAll(async () => {
    await connectDatabase(mongodbUri as string);
    await seedRoleDefinitions();
  });

  afterAll(async () => {
    // `POST /employees` (invite) crée des users/memberships hors de
    // `createTenantFixture` — chaque test y crée toujours au moins un
    // owner/manager/waiter via fixture dans le même tenant, donc nettoyer
    // par `tenantId` (plutôt que par id individuel de membership invité,
    // jamais tracké) couvre aussi bien les fixtures que les employés
    // invités, sans jamais toucher les tenants d'autres fichiers de test
    // (chaque `tenantId` ici est généré frais, `new Types.ObjectId()`).
    await UserModel.collection.deleteMany({ email: { $in: inviteCreatedUserEmails } });
    const tenantIds = [...new Set(fixtures.map((fixture) => fixture.tenantId))];
    await MembershipModel.collection.deleteMany({ tenantId: { $in: tenantIds } });
    await cleanupTenantFixtures(fixtures);
    await disconnectDatabase();
  });

  describe('POST /api/v1/employees', () => {
    it("crée un compte quand l'email est inconnu, et le membership (201)", async () => {
      const tenantId = freshTenantId();
      const owner = await ownerFor(tenantId);
      const email = `nouveau-${Date.now()}@employees-integration.local`;
      inviteCreatedUserEmails.push(email);

      const response = await request(createApp())
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          email,
          fullName: 'Nouvel Employé',
          role: 'waiter',
          jobTitle: 'Serveur',
          salary: 120000,
        });
      const body = response.body as SuccessBody;
      const employee = body.data as {
        role: string;
        jobTitle: string;
        salary: number;
        user: { email: string };
      };

      expect(response.status).toBe(201);
      expect(employee.role).toBe('waiter');
      expect(employee.jobTitle).toBe('Serveur');
      expect(employee.salary).toBe(120000);
      expect(employee.user.email).toBe(email);

      const createdUser = await UserModel.findOne({ email }).select('+passwordHash');
      expect(createdUser).not.toBeNull();
      expect(createdUser?.passwordHash).toBeTruthy();
    });

    it('réutilise un utilisateur déjà existant (aucun doublon créé)', async () => {
      const tenantId = freshTenantId();
      const owner = await ownerFor(tenantId);
      const otherTenantId = freshTenantId();
      const alreadyExisting = await waiterFor(otherTenantId);
      const existingUser = await UserModel.findById(alreadyExisting.userId);

      const response = await request(createApp())
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email: existingUser?.email, fullName: existingUser?.fullName, role: 'cashier' });
      const body = response.body as SuccessBody;
      const employee = body.data as { user: { id: string } };

      expect(response.status).toBe(201);
      expect(employee.user.id).toBe(alreadyExisting.userId);
    });

    it('rejette (409 EMPLOYEE_ALREADY_MEMBER) un email déjà membre de ce restaurant', async () => {
      const tenantId = freshTenantId();
      const owner = await ownerFor(tenantId);
      const existingMember = await waiterFor(tenantId);
      const existingUser = await UserModel.findById(existingMember.userId);

      const response = await request(createApp())
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email: existingUser?.email, fullName: existingUser?.fullName, role: 'manager' });
      const body = response.body as ErrorBody;

      expect(response.status).toBe(409);
      expect(body.error.code).toBe('EMPLOYEE_ALREADY_MEMBER');
    });

    it('rejette (403 RBAC_PERMISSION_DENIED) un waiter (employees:create réservé à owner/manager)', async () => {
      const tenantId = freshTenantId();
      const waiter = await waiterFor(tenantId);

      const response = await request(createApp())
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${waiter.accessToken}`)
        .send({
          email: `x-${Date.now()}@employees-integration.local`,
          fullName: 'X',
          role: 'waiter',
        });

      expect(response.status).toBe(403);
    });

    it('rejette (400 EMPLOYEE_INVALID_PAYLOAD) un payload sans role', async () => {
      const tenantId = freshTenantId();
      const owner = await ownerFor(tenantId);

      const response = await request(createApp())
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email: `x-${Date.now()}@employees-integration.local`, fullName: 'X' });
      const body = response.body as ErrorBody;

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('EMPLOYEE_INVALID_PAYLOAD');
    });

    it('rejette (401) une requête sans token', async () => {
      const response = await request(createApp())
        .post('/api/v1/employees')
        .send({ email: 'x@y.com', fullName: 'X', role: 'waiter' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/employees', () => {
    it('liste, pagine (page/limit) et filtre par role/status', async () => {
      const tenantId = freshTenantId();
      const owner = await ownerFor(tenantId);
      await waiterFor(tenantId);
      await managerFor(tenantId);

      const page1 = await request(createApp())
        .get('/api/v1/employees?page=1&limit=2')
        .set('Authorization', `Bearer ${owner.accessToken}`);
      const page1Body = page1.body as SuccessBody;

      expect(page1.status).toBe(200);
      expect(page1Body.meta).toEqual({ page: 1, limit: 2, total: 3 });
      expect(page1Body.data).toHaveLength(2);

      const filtered = await request(createApp())
        .get('/api/v1/employees?role=waiter')
        .set('Authorization', `Bearer ${owner.accessToken}`);
      const filteredBody = filtered.body as SuccessBody;
      expect(filteredBody.meta?.total).toBe(1);
    });

    it('owner voit salary, manager sans override ne le voit pas (doc 08 §8.4)', async () => {
      const tenantId = freshTenantId();
      const owner = await ownerFor(tenantId);
      const manager = await managerFor(tenantId);
      await waiterFor(tenantId);

      const ownerView = await request(createApp())
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${owner.accessToken}`);
      const ownerEmployees = (ownerView.body as SuccessBody).data as Record<string, unknown>[];
      expect(ownerEmployees.every((employee) => 'salary' in employee)).toBe(true);

      const managerView = await request(createApp())
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${manager.accessToken}`);
      const managerEmployees = (managerView.body as SuccessBody).data as Record<string, unknown>[];
      expect(managerEmployees.some((employee) => 'salary' in employee)).toBe(false);
    });

    it('manager avec un override employees:view_salary le voit (doc 08 §8.4, 🔒)', async () => {
      const tenantId = freshTenantId();
      const manager = await managerFor(tenantId, ['employees:view_salary']);
      await waiterFor(tenantId);

      const response = await request(createApp())
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${manager.accessToken}`);
      const employees = (response.body as SuccessBody).data as Record<string, unknown>[];

      expect(employees.every((employee) => 'salary' in employee)).toBe(true);
    });

    it('rejette (403) un waiter (employees:read réservé à owner/manager)', async () => {
      const tenantId = freshTenantId();
      const waiter = await waiterFor(tenantId);

      const response = await request(createApp())
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${waiter.accessToken}`);

      expect(response.status).toBe(403);
    });

    it("n'expose jamais les employés d'un autre tenant (anti-IDOR, doc 06 §6.4)", async () => {
      const tenantA = freshTenantId();
      const tenantB = freshTenantId();
      await waiterFor(tenantA);
      const ownerB = await ownerFor(tenantB);

      const response = await request(createApp())
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${ownerB.accessToken}`);
      const employees = (response.body as SuccessBody).data as Record<string, unknown>[];

      // Seul le membership owner du tenant B lui-même doit apparaître.
      expect(employees).toHaveLength(1);
    });
  });

  describe('GET /api/v1/employees/:id', () => {
    it('renvoie le détail avec salary pour un owner', async () => {
      const tenantId = freshTenantId();
      const owner = await ownerFor(tenantId);
      const waiter = await waiterFor(tenantId);

      const response = await request(createApp())
        .get(`/api/v1/employees/${waiter.membershipId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      const employee = response.body as SuccessBody;

      expect(response.status).toBe(200);
      expect((employee.data as Record<string, unknown>).id).toBe(waiter.membershipId);
    });

    it('rejette (404 anti-IDOR) un id appartenant à un autre tenant', async () => {
      const tenantA = freshTenantId();
      const tenantB = freshTenantId();
      const waiterA = await waiterFor(tenantA);
      const ownerB = await ownerFor(tenantB);

      const response = await request(createApp())
        .get(`/api/v1/employees/${waiterA.membershipId}`)
        .set('Authorization', `Bearer ${ownerB.accessToken}`);
      const body = response.body as ErrorBody;

      expect(response.status).toBe(404);
      expect(body.error.code).toBe('EMPLOYEE_NOT_FOUND');
    });

    it('rejette (404) un id inconnu', async () => {
      const tenantId = freshTenantId();
      const owner = await ownerFor(tenantId);

      const response = await request(createApp())
        .get(`/api/v1/employees/${new Types.ObjectId().toString()}`)
        .set('Authorization', `Bearer ${owner.accessToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/employees/:id', () => {
    it('met réellement à jour jobTitle/salary/employmentStatus (owner)', async () => {
      const tenantId = freshTenantId();
      const owner = await ownerFor(tenantId);
      const waiter = await waiterFor(tenantId);

      const response = await request(createApp())
        .patch(`/api/v1/employees/${waiter.membershipId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ jobTitle: 'Chef de rang', salary: 180000, employmentStatus: 'inactive' });
      const employee = (response.body as SuccessBody).data as {
        jobTitle: string;
        salary: number;
        employmentStatus: string;
      };

      expect(response.status).toBe(200);
      expect(employee.jobTitle).toBe('Chef de rang');
      expect(employee.salary).toBe(180000);
      expect(employee.employmentStatus).toBe('inactive');
    });

    it('rejette (403) un waiter (employees:update réservé à owner/manager)', async () => {
      const tenantId = freshTenantId();
      const waiter = await waiterFor(tenantId);
      const otherWaiter = await waiterFor(tenantId);

      const response = await request(createApp())
        .patch(`/api/v1/employees/${otherWaiter.membershipId}`)
        .set('Authorization', `Bearer ${waiter.accessToken}`)
        .send({ jobTitle: 'Nouveau poste' });

      expect(response.status).toBe(403);
    });

    it('rejette (404 anti-IDOR) un id appartenant à un autre tenant', async () => {
      const tenantA = freshTenantId();
      const tenantB = freshTenantId();
      const waiterA = await waiterFor(tenantA);
      const ownerB = await ownerFor(tenantB);

      const response = await request(createApp())
        .patch(`/api/v1/employees/${waiterA.membershipId}`)
        .set('Authorization', `Bearer ${ownerB.accessToken}`)
        .send({ jobTitle: 'Piraté' });

      expect(response.status).toBe(404);
    });

    it('rejette (400 EMPLOYEE_INVALID_PAYLOAD) un employmentStatus invalide', async () => {
      const tenantId = freshTenantId();
      const owner = await ownerFor(tenantId);
      const waiter = await waiterFor(tenantId);

      const response = await request(createApp())
        .patch(`/api/v1/employees/${waiter.membershipId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ employmentStatus: 'pending' });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/employees/:id', () => {
    it('désactive le membership (204) sans le supprimer réellement (soft delete, doc 09 §9.5)', async () => {
      const tenantId = freshTenantId();
      const owner = await ownerFor(tenantId);
      const waiter = await waiterFor(tenantId);

      const response = await request(createApp())
        .delete(`/api/v1/employees/${waiter.membershipId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`);

      expect(response.status).toBe(204);

      // `tenantScope` (doc 06 §6.4) exige `tenantId` dans le filtre de
      // toute requête sur cette collection, même une lecture de
      // vérification directe dans le test — filet de sécurité volontaire,
      // pas un détail à contourner.
      const stillExists = await MembershipModel.findOne({ _id: waiter.membershipId, tenantId });
      expect(stillExists).not.toBeNull();
      expect(stillExists?.employmentStatus).toBe('inactive');
    });

    it('rejette (403) un waiter (employees:delete réservé à owner/manager)', async () => {
      const tenantId = freshTenantId();
      const waiter = await waiterFor(tenantId);
      const otherWaiter = await waiterFor(tenantId);

      const response = await request(createApp())
        .delete(`/api/v1/employees/${otherWaiter.membershipId}`)
        .set('Authorization', `Bearer ${waiter.accessToken}`);

      expect(response.status).toBe(403);
    });

    it('rejette (404) un id inconnu', async () => {
      const tenantId = freshTenantId();
      const owner = await ownerFor(tenantId);

      const response = await request(createApp())
        .delete(`/api/v1/employees/${new Types.ObjectId().toString()}`)
        .set('Authorization', `Bearer ${owner.accessToken}`);

      expect(response.status).toBe(404);
    });
  });
});
