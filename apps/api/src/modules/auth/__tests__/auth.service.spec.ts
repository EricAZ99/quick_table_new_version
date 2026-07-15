import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';

vi.mock('argon2', () => ({ default: { verify: vi.fn() } }));

import argon2 from 'argon2';

import type { AuthRepository } from '../auth.repository.js';
import { AuthService } from '../auth.service.js';
import type { AccessTokenPayload } from '../jwt.js';
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

function createAuthRepositoryMock(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    findMembershipsByUserId: vi.fn().mockResolvedValue([]),
    createRefreshToken: vi.fn().mockResolvedValue(undefined),
    findRefreshTokenByHash: vi.fn().mockResolvedValue(null),
    revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
    revokeAllUserRefreshTokens: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as AuthRepository;
}

function createServices(userDoc: unknown, memberships: unknown[]) {
  const usersRepository = {
    findByEmailWithPasswordHash: vi.fn().mockResolvedValue(userDoc),
  } as unknown as UsersRepository;
  const authRepository = createAuthRepositoryMock({
    findMembershipsByUserId: vi.fn().mockResolvedValue(memberships),
  });

  return { usersRepository, authRepository };
}

function createStoredRefreshToken(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'refresh-token-id-a',
    userId: { toString: () => 'user-a' },
    tokenHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    ...overrides,
  };
}

const PREVIOUS_PAYLOAD: AccessTokenPayload = {
  sub: 'user-a',
  membershipId: 'membership-a',
  tenantId: 'tenant-a',
  role: 'waiter',
  isSuperAdmin: false,
  permissionsVersion: 0,
};

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

const NOOP_USERS_REPOSITORY = {} as unknown as UsersRepository;

describe('AuthService#refresh', () => {
  it("effectue la rotation : révoque l'ancien token, en émet un nouveau, reprend les claims de l'ancien Access Token (doc 06 §6.3)", async () => {
    const expiredAccessToken = jwt.sign(PREVIOUS_PAYLOAD, SECRET, { expiresIn: -10 });
    const storedToken = createStoredRefreshToken();
    const authRepository = createAuthRepositoryMock({
      findRefreshTokenByHash: vi.fn().mockResolvedValue(storedToken),
    });
    const service = new AuthService(NOOP_USERS_REPOSITORY, authRepository, SECRET);

    const result = await service.refresh('raw-refresh-token', expiredAccessToken, {
      ip: '203.0.113.42',
    });

    const decoded = verifyAccessToken(result.accessToken, SECRET);
    expect(decoded).toMatchObject(PREVIOUS_PAYLOAD);
    expect(authRepository.revokeRefreshToken).toHaveBeenCalledWith('refresh-token-id-a');
    expect(authRepository.createRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-a' }),
    );
    expect(result.refreshToken).not.toBe('raw-refresh-token');
  });

  it('rejette si le cookie refreshToken est absent', async () => {
    const authRepository = createAuthRepositoryMock();
    const service = new AuthService(NOOP_USERS_REPOSITORY, authRepository, SECRET);

    await expect(
      service.refresh(undefined, jwt.sign(PREVIOUS_PAYLOAD, SECRET, { expiresIn: -10 }), {}),
    ).rejects.toMatchObject({ code: 'AUTH_REFRESH_TOKEN_INVALID', httpStatus: 401 });
  });

  it("rejette si l'Access Token expiré est absent", async () => {
    const authRepository = createAuthRepositoryMock();
    const service = new AuthService(NOOP_USERS_REPOSITORY, authRepository, SECRET);

    await expect(service.refresh('raw-refresh-token', undefined, {})).rejects.toMatchObject({
      code: 'AUTH_REFRESH_TOKEN_INVALID',
      httpStatus: 401,
    });
  });

  it("rejette si la signature de l'Access Token est invalide (même expiré)", async () => {
    const forgedToken = jwt.sign(PREVIOUS_PAYLOAD, 'un-autre-secret-de-32-caracteres', {
      expiresIn: -10,
    });
    const authRepository = createAuthRepositoryMock();
    const service = new AuthService(NOOP_USERS_REPOSITORY, authRepository, SECRET);

    await expect(service.refresh('raw-refresh-token', forgedToken, {})).rejects.toMatchObject({
      code: 'AUTH_REFRESH_TOKEN_INVALID',
      httpStatus: 401,
    });
  });

  it('rejette si aucun refresh token stocké ne correspond au hash', async () => {
    const expiredAccessToken = jwt.sign(PREVIOUS_PAYLOAD, SECRET, { expiresIn: -10 });
    const authRepository = createAuthRepositoryMock({
      findRefreshTokenByHash: vi.fn().mockResolvedValue(null),
    });
    const service = new AuthService(NOOP_USERS_REPOSITORY, authRepository, SECRET);

    await expect(
      service.refresh('raw-refresh-token', expiredAccessToken, {}),
    ).rejects.toMatchObject({ code: 'AUTH_REFRESH_TOKEN_INVALID', httpStatus: 401 });
  });

  it('rejette si le refresh token stocké est expiré', async () => {
    const expiredAccessToken = jwt.sign(PREVIOUS_PAYLOAD, SECRET, { expiresIn: -10 });
    const storedToken = createStoredRefreshToken({ expiresAt: new Date(Date.now() - 1000) });
    const authRepository = createAuthRepositoryMock({
      findRefreshTokenByHash: vi.fn().mockResolvedValue(storedToken),
    });
    const service = new AuthService(NOOP_USERS_REPOSITORY, authRepository, SECRET);

    await expect(
      service.refresh('raw-refresh-token', expiredAccessToken, {}),
    ).rejects.toMatchObject({ code: 'AUTH_REFRESH_TOKEN_INVALID', httpStatus: 401 });
  });

  it("rejette si le refresh token stocké appartient à un autre utilisateur que l'Access Token (couple dépareillé)", async () => {
    const expiredAccessToken = jwt.sign(PREVIOUS_PAYLOAD, SECRET, { expiresIn: -10 });
    const storedToken = createStoredRefreshToken({ userId: { toString: () => 'un-autre-user' } });
    const authRepository = createAuthRepositoryMock({
      findRefreshTokenByHash: vi.fn().mockResolvedValue(storedToken),
    });
    const service = new AuthService(NOOP_USERS_REPOSITORY, authRepository, SECRET);

    await expect(
      service.refresh('raw-refresh-token', expiredAccessToken, {}),
    ).rejects.toMatchObject({ code: 'AUTH_REFRESH_TOKEN_INVALID', httpStatus: 401 });
  });

  it('détecte le rejeu (token déjà révoqué) et révoque toute la famille de sessions (doc 07 §7.1)', async () => {
    const expiredAccessToken = jwt.sign(PREVIOUS_PAYLOAD, SECRET, { expiresIn: -10 });
    const storedToken = createStoredRefreshToken({ revokedAt: new Date() });
    const authRepository = createAuthRepositoryMock({
      findRefreshTokenByHash: vi.fn().mockResolvedValue(storedToken),
    });
    const service = new AuthService(NOOP_USERS_REPOSITORY, authRepository, SECRET);

    await expect(
      service.refresh('raw-refresh-token', expiredAccessToken, {}),
    ).rejects.toMatchObject({ code: 'AUTH_REFRESH_TOKEN_REUSED', httpStatus: 401 });
    expect(authRepository.revokeAllUserRefreshTokens).toHaveBeenCalledWith('user-a');
  });
});
