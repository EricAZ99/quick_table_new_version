import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../database/models/user.model.js', () => ({
  UserModel: { create: vi.fn(), collection: { deleteMany: vi.fn() } },
}));
vi.mock('../../../database/models/membership.model.js', () => ({
  MembershipModel: { create: vi.fn(), collection: { deleteMany: vi.fn() } },
}));
vi.mock('../../../modules/auth/jwt.js', () => ({ signAccessToken: vi.fn() }));

import { MembershipModel } from '../../../database/models/membership.model.js';
import { UserModel } from '../../../database/models/user.model.js';
import { signAccessToken } from '../../../modules/auth/jwt.js';
import { cleanupTenantFixtures, createTenantFixture } from '../tenantIsolationFixtures.js';

const USER_ID = new Types.ObjectId('65f000000000000000000001');
const MEMBERSHIP_ID = new Types.ObjectId('65f000000000000000000002');

describe('createTenantFixture', () => {
  it('crée un user puis un membership rattaché au tenant fourni, et signe un Access Token cohérent', async () => {
    vi.mocked(UserModel.create).mockResolvedValue({ _id: USER_ID } as never);
    vi.mocked(MembershipModel.create).mockResolvedValue({ _id: MEMBERSHIP_ID } as never);
    vi.mocked(signAccessToken).mockReturnValue('signed-token');

    const fixture = await createTenantFixture({ tenantId: 'tenant-a', jwtSecret: 'secret' });

    expect(MembershipModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', userId: USER_ID, role: 'waiter' }),
    );
    expect(signAccessToken).toHaveBeenCalledWith(
      {
        sub: USER_ID.toString(),
        tenantId: 'tenant-a',
        membershipId: MEMBERSHIP_ID.toString(),
        role: 'waiter',
        isSuperAdmin: false,
        permissionsVersion: 0,
      },
      'secret',
    );
    expect(fixture).toEqual({
      tenantId: 'tenant-a',
      userId: USER_ID.toString(),
      membershipId: MEMBERSHIP_ID.toString(),
      accessToken: 'signed-token',
    });
  });

  it('utilise le rôle fourni au lieu du défaut waiter', async () => {
    vi.mocked(UserModel.create).mockResolvedValue({ _id: USER_ID } as never);
    vi.mocked(MembershipModel.create).mockResolvedValue({ _id: MEMBERSHIP_ID } as never);
    vi.mocked(signAccessToken).mockReturnValue('signed-token');

    await createTenantFixture({ tenantId: 'tenant-a', jwtSecret: 'secret', role: 'manager' });

    expect(MembershipModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'manager' }),
    );
  });
});

describe('cleanupTenantFixtures', () => {
  it('supprime les users et memberships par _id exact (jamais par simple filtre tenantId)', async () => {
    await cleanupTenantFixtures([
      {
        tenantId: 'tenant-a',
        userId: USER_ID.toString(),
        membershipId: MEMBERSHIP_ID.toString(),
        accessToken: 'x',
      },
    ]);

    expect(MembershipModel.collection.deleteMany).toHaveBeenCalledWith({
      _id: { $in: [MEMBERSHIP_ID] },
    });
    expect(UserModel.collection.deleteMany).toHaveBeenCalledWith({
      _id: { $in: [USER_ID] },
    });
  });
});
