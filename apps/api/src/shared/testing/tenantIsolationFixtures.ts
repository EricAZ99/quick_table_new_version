import { randomUUID } from 'node:crypto';

import { Types } from 'mongoose';

import { MembershipModel, type MembershipRole } from '../../database/models/membership.model.js';
import { UserModel } from '../../database/models/user.model.js';
import { signAccessToken } from '../../modules/auth/jwt.js';

/**
 * Infrastructure de test d'isolation multi-tenant (doc 06 §6.4 point 3,
 * Feature 1.3) — premier module sous `shared/testing/` : aucune
 * convention préexistante pour un dossier de test-utils transverse dans
 * ce projet (chaque `__tests__` co-localisait jusqu'ici ses propres
 * helpers, ex. `signToken` dans `tenant.middleware.integration.spec.ts`).
 * Ce module ne fait qu'une chose : fabriquer un couple utilisateur +
 * membership réel pour un tenant donné et signer l'Access Token
 * correspondant, exploitable directement contre
 * `requireAuth`/`resolveTenant` — la construction des requêtes HTTP et
 * les assertions (404 anti-IDOR, doc 06 §6.2) restent la responsabilité
 * de chaque suite de test par endpoint (ticket suivant, "tests
 * d'isolation pour les endpoints Epic 1"), pas généralisées ici
 * (doc 14 §14.5 KISS — une assertion générique across des formes de
 * réponse HTTP arbitraires serait plus complexe à maintenir que
 * plusieurs assertions explicites).
 */
export interface TenantFixture {
  tenantId: string;
  userId: string;
  membershipId: string;
  accessToken: string;
}

export async function createTenantFixture(params: {
  tenantId: string;
  jwtSecret: string;
  role?: MembershipRole;
}): Promise<TenantFixture> {
  const role = params.role ?? 'waiter';

  const user = await UserModel.create({
    email: `${randomUUID()}@tenant-isolation-test.local`,
    passwordHash: 'irrelevant-for-isolation-tests',
    fullName: 'Tenant Isolation Test User',
  });

  const membership = await MembershipModel.create({
    tenantId: params.tenantId,
    userId: user._id,
    role,
  });

  const accessToken = signAccessToken(
    {
      sub: user._id.toString(),
      tenantId: params.tenantId,
      membershipId: membership._id.toString(),
      role,
      isSuperAdmin: false,
      permissionsVersion: 0,
    },
    params.jwtSecret,
  );

  return {
    tenantId: params.tenantId,
    userId: user._id.toString(),
    membershipId: membership._id.toString(),
    accessToken,
  };
}

/**
 * Nettoyage par `_id` exact (jamais par simple filtre `tenantId`) : deux
 * suites de test utilisant des tenants différents ne doivent jamais
 * pouvoir se marcher dessus si elles tournent en parallèle.
 */
export async function cleanupTenantFixtures(fixtures: TenantFixture[]): Promise<void> {
  const userIds = fixtures.map((fixture) => new Types.ObjectId(fixture.userId));
  const membershipIds = fixtures.map((fixture) => new Types.ObjectId(fixture.membershipId));

  await MembershipModel.collection.deleteMany({ _id: { $in: membershipIds } });
  await UserModel.collection.deleteMany({ _id: { $in: userIds } });
}
