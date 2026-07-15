import { describe, expect, it, vi } from 'vitest';

vi.mock('argon2', () => ({ default: { verify: vi.fn() } }));

import argon2 from 'argon2';

import type { AuthRepository } from '../auth.repository.js';
import { AuthService } from '../auth.service.js';
import { verifyAccessToken } from '../jwt.js';
import type { UsersRepository } from '../../users/users.repository.js';

const SECRET = 's'.repeat(32);

function createUserDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: { toString: () => 'user-a' },
    email: 'chef@quicktable.io',
    passwordHash: 'stored-hash',
    isSuperAdmin: false,
    lastLoginAt: undefined,
    save: vi.fn().mockResolvedValue(undefined),
    toJSON: vi.fn().mockReturnValue({ email: 'chef@quicktable.io' }),
    ...overrides,
  };
}

function createMembership(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'membership-a',
    tenantId: 'tenant-a',
    role: 'waiter',
    ...overrides,
  };
}

function createServices(userDoc: unknown, memberships: unknown[]) {
  const usersRepository = {
    findByEmailWithPasswordHash: vi.fn().mockResolvedValue(userDoc),
  } as unknown as UsersRepository;
  const authRepository = {
    findMembershipsByUserId: vi.fn().mockResolvedValue(memberships),
    createRefreshToken: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuthRepository;

  return { usersRepository, authRepository };
}

describe('AuthService#login', () => {
  it('connecte avec succès, résout automatiquement le tenant unique, réinitialise lastLoginAt', async () => {
    vi.mocked(argon2.verify).mockResolvedValue(true);
    const userDoc = createUserDoc();
    const membership = createMembership();
    const { usersRepository, authRepository } = createServices(userDoc, [membership]);
    const service = new AuthService(usersRepository, authRepository, SECRET);

    const result = await service.login(
      { email: 'chef@quicktable.io', password: 'le-bon-mdp' },
      { ip: '203.0.113.42', userAgent: 'test-agent' },
    );

    const decoded = verifyAccessToken(result.accessToken, SECRET);
    expect(decoded).toMatchObject({
      sub: 'user-a',
      tenantId: 'tenant-a',
      role: 'waiter',
      membershipId: 'membership-a',
      isSuperAdmin: false,
      permissionsVersion: 0,
    });
    expect(result.tenants).toEqual([
      { tenantId: 'tenant-a', role: 'waiter', membershipId: 'membership-a' },
    ]);
    expect(result.user).toEqual({ email: 'chef@quicktable.io' });
    expect(result.refreshToken).toMatch(/^[0-9a-f-]{36}$/i);
    expect(authRepository.createRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-a' }),
    );
    expect(userDoc.save).toHaveBeenCalledOnce();
    expect(userDoc.lastLoginAt).toBeInstanceOf(Date);
  });

  it("rejette avec un code générique si l'utilisateur n'existe pas (anti-énumération)", async () => {
    vi.mocked(argon2.verify).mockResolvedValue(false);
    const { usersRepository, authRepository } = createServices(null, []);
    const service = new AuthService(usersRepository, authRepository, SECRET);

    await expect(
      service.login({ email: 'inconnu@quicktable.io', password: 'x' }, {}),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS', httpStatus: 401 });
    // Timing-safe : argon2.verify est appelé même quand l'utilisateur n'existe pas.
    expect(argon2.verify).toHaveBeenCalled();
  });

  it('rejette avec le même code générique si le mot de passe est incorrect', async () => {
    vi.mocked(argon2.verify).mockResolvedValue(false);
    const userDoc = createUserDoc();
    const { usersRepository, authRepository } = createServices(userDoc, []);
    const service = new AuthService(usersRepository, authRepository, SECRET);

    await expect(
      service.login({ email: 'chef@quicktable.io', password: 'mauvais-mdp' }, {}),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS', httpStatus: 401 });
  });

  it("laisse tenantId/role/membershipId à null si l'utilisateur n'a aucun membership (ex. super_admin)", async () => {
    vi.mocked(argon2.verify).mockResolvedValue(true);
    const userDoc = createUserDoc({ isSuperAdmin: true });
    const { usersRepository, authRepository } = createServices(userDoc, []);
    const service = new AuthService(usersRepository, authRepository, SECRET);

    const result = await service.login({ email: 'chef@quicktable.io', password: 'x' }, {});

    const decoded = verifyAccessToken(result.accessToken, SECRET);
    expect(decoded).toMatchObject({
      tenantId: null,
      role: null,
      membershipId: null,
      isSuperAdmin: true,
    });
    expect(result.tenants).toEqual([]);
  });

  it("laisse tenantId/role/membershipId à null si l'utilisateur a plusieurs memberships (doc 07 §7.3 : select-tenant requis)", async () => {
    vi.mocked(argon2.verify).mockResolvedValue(true);
    const userDoc = createUserDoc();
    const membershipA = createMembership({ id: 'membership-a', tenantId: 'tenant-a' });
    const membershipB = createMembership({
      id: 'membership-b',
      tenantId: 'tenant-b',
      role: 'manager',
    });
    const { usersRepository, authRepository } = createServices(userDoc, [membershipA, membershipB]);
    const service = new AuthService(usersRepository, authRepository, SECRET);

    const result = await service.login({ email: 'chef@quicktable.io', password: 'x' }, {});

    const decoded = verifyAccessToken(result.accessToken, SECRET);
    expect(decoded).toMatchObject({ tenantId: null, role: null, membershipId: null });
    expect(result.tenants).toHaveLength(2);
  });
});
