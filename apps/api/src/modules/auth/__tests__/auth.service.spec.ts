import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';

vi.mock('argon2', () => ({
  default: { verify: vi.fn(), hash: vi.fn().mockResolvedValue('new-hashed-password'), argon2id: 2 },
}));

const { verifyTotpCodeMock } = vi.hoisted(() => ({ verifyTotpCodeMock: vi.fn() }));
vi.mock('../totp.util.js', () => ({
  generateTotpSecret: vi.fn().mockReturnValue('GENERATED-TOTP-SECRET'),
  generateTotpQrCodeDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,fake-qr'),
  verifyTotpCode: verifyTotpCodeMock,
}));

import argon2 from 'argon2';

import type { EmailJobData } from '../../../jobs/queues.js';
import type { AuthRepository } from '../auth.repository.js';
import { AuthService, type LoginOutcome, type LoginSessionResult } from '../auth.service.js';
import type { AccessTokenPayload } from '../jwt.js';
import { verifyAccessToken } from '../jwt.js';
import { hashRecoveryCode } from '../recoveryCode.util.js';
import { encryptTwoFactorSecret } from '../twoFactorSecret.util.js';
import { signTwoFactorChallengeToken } from '../twoFactorChallengeToken.js';
import type { UsersRepository } from '../../users/users.repository.js';

const SECRET = 's'.repeat(32);
const TWO_FACTOR_KEY = 'a'.repeat(64);

function createService(
  usersRepository: UsersRepository,
  authRepository: AuthRepository,
  enqueueEmailJob: (data: EmailJobData) => Promise<void> = vi.fn().mockResolvedValue(undefined),
) {
  return new AuthService(usersRepository, authRepository, SECRET, enqueueEmailJob, TWO_FACTOR_KEY);
}

/** Narrowing pour les tests de login sans 2FA — échoue bruyamment si le résultat est un challenge inattendu. */
function assertSession(result: LoginOutcome): asserts result is LoginSessionResult {
  if (result.requires2FA) {
    throw new Error('Résultat inattendu : challenge 2FA au lieu d’une session complète.');
  }
}

function createUserDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: { toString: () => 'user-a' },
    email: 'chef@quicktable.io',
    passwordHash: 'stored-hash',
    isSuperAdmin: false,
    twoFactorEnabled: false,
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
    createPasswordResetToken: vi.fn().mockResolvedValue(undefined),
    findPasswordResetTokenByHash: vi.fn().mockResolvedValue(null),
    markPasswordResetTokenUsed: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as AuthRepository;
}

function createUsersRepositoryMock(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    findByEmailWithPasswordHash: vi.fn().mockResolvedValue(null),
    findByEmail: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(null),
    updatePasswordHash: vi.fn().mockResolvedValue(undefined),
    findByIdWithTwoFactorSecret: vi.fn().mockResolvedValue(null),
    findByIdWithPasswordAndTwoFactorSecret: vi.fn().mockResolvedValue(null),
    setPendingTwoFactorSecret: vi.fn().mockResolvedValue(undefined),
    confirmTwoFactor: vi.fn().mockResolvedValue(undefined),
    disableTwoFactor: vi.fn().mockResolvedValue(undefined),
    markRecoveryCodeUsed: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as UsersRepository;
}

function createServices(userDoc: unknown, memberships: unknown[]) {
  const usersRepository = createUsersRepositoryMock({
    findByEmailWithPasswordHash: vi.fn().mockResolvedValue(userDoc),
  });
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

function createStoredPasswordResetToken(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'reset-token-id-a',
    userId: { toString: () => 'user-a' },
    tokenHash: 'b'.repeat(64),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    usedAt: null,
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
    const service = createService(usersRepository, authRepository);

    const result = await service.login(
      { email: 'chef@quicktable.io', password: 'le-bon-mdp' },
      { ip: '203.0.113.42', userAgent: 'test-agent' },
    );
    assertSession(result);

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
    const service = createService(usersRepository, authRepository);

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
    const service = createService(usersRepository, authRepository);

    await expect(
      service.login({ email: 'chef@quicktable.io', password: 'mauvais-mdp' }, {}),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS', httpStatus: 401 });
  });

  it("laisse tenantId/role/membershipId à null si l'utilisateur n'a aucun membership (ex. super_admin)", async () => {
    vi.mocked(argon2.verify).mockResolvedValue(true);
    const userDoc = createUserDoc({ isSuperAdmin: true });
    const { usersRepository, authRepository } = createServices(userDoc, []);
    const service = createService(usersRepository, authRepository);

    const result = await service.login({ email: 'chef@quicktable.io', password: 'x' }, {});
    assertSession(result);

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
    const service = createService(usersRepository, authRepository);

    const result = await service.login({ email: 'chef@quicktable.io', password: 'x' }, {});
    assertSession(result);

    const decoded = verifyAccessToken(result.accessToken, SECRET);
    expect(decoded).toMatchObject({ tenantId: null, role: null, membershipId: null });
    expect(result.tenants).toHaveLength(2);
  });

  it("renvoie un challengeToken sans émettre de session si l'utilisateur a la 2FA activée (doc 07 §7.3)", async () => {
    vi.mocked(argon2.verify).mockResolvedValue(true);
    const userDoc = createUserDoc({ twoFactorEnabled: true });
    const { usersRepository, authRepository } = createServices(userDoc, []);
    const service = createService(usersRepository, authRepository);

    const result = await service.login({ email: 'chef@quicktable.io', password: 'x' }, {});

    expect(result.requires2FA).toBe(true);
    expect((result as { challengeToken: string }).challengeToken).toEqual(expect.any(String));
    expect(authRepository.createRefreshToken).not.toHaveBeenCalled();
    expect(userDoc.save).not.toHaveBeenCalled();
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
    const service = createService(NOOP_USERS_REPOSITORY, authRepository);

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
    const service = createService(NOOP_USERS_REPOSITORY, authRepository);

    await expect(
      service.refresh(undefined, jwt.sign(PREVIOUS_PAYLOAD, SECRET, { expiresIn: -10 }), {}),
    ).rejects.toMatchObject({ code: 'AUTH_REFRESH_TOKEN_INVALID', httpStatus: 401 });
  });

  it("rejette si l'Access Token expiré est absent", async () => {
    const authRepository = createAuthRepositoryMock();
    const service = createService(NOOP_USERS_REPOSITORY, authRepository);

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
    const service = createService(NOOP_USERS_REPOSITORY, authRepository);

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
    const service = createService(NOOP_USERS_REPOSITORY, authRepository);

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
    const service = createService(NOOP_USERS_REPOSITORY, authRepository);

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
    const service = createService(NOOP_USERS_REPOSITORY, authRepository);

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
    const service = createService(NOOP_USERS_REPOSITORY, authRepository);

    await expect(
      service.refresh('raw-refresh-token', expiredAccessToken, {}),
    ).rejects.toMatchObject({ code: 'AUTH_REFRESH_TOKEN_REUSED', httpStatus: 401 });
    expect(authRepository.revokeAllUserRefreshTokens).toHaveBeenCalledWith('user-a');
  });
});

describe('AuthService#logout', () => {
  it('révoque la session correspondant au refresh token présenté', async () => {
    const storedToken = createStoredRefreshToken();
    const authRepository = createAuthRepositoryMock({
      findRefreshTokenByHash: vi.fn().mockResolvedValue(storedToken),
    });
    const service = createService(NOOP_USERS_REPOSITORY, authRepository);

    await service.logout('raw-refresh-token');

    expect(authRepository.revokeRefreshToken).toHaveBeenCalledWith('refresh-token-id-a');
  });

  it("ne fait rien (pas d'exception) si aucun refresh token n'est fourni — logout idempotent", async () => {
    const authRepository = createAuthRepositoryMock();
    const service = createService(NOOP_USERS_REPOSITORY, authRepository);

    await expect(service.logout(undefined)).resolves.toBeUndefined();
    expect(authRepository.findRefreshTokenByHash).not.toHaveBeenCalled();
  });

  it('ne fait rien si le token présenté ne correspond à aucune session connue — pas une erreur', async () => {
    const authRepository = createAuthRepositoryMock({
      findRefreshTokenByHash: vi.fn().mockResolvedValue(null),
    });
    const service = createService(NOOP_USERS_REPOSITORY, authRepository);

    await expect(service.logout('token-inconnu')).resolves.toBeUndefined();
    expect(authRepository.revokeRefreshToken).not.toHaveBeenCalled();
  });

  it('ne re-révoque pas un token déjà révoqué (pas de mutation superflue)', async () => {
    const storedToken = createStoredRefreshToken({ revokedAt: new Date() });
    const authRepository = createAuthRepositoryMock({
      findRefreshTokenByHash: vi.fn().mockResolvedValue(storedToken),
    });
    const service = createService(NOOP_USERS_REPOSITORY, authRepository);

    await service.logout('raw-refresh-token');

    expect(authRepository.revokeRefreshToken).not.toHaveBeenCalled();
  });
});

describe('AuthService#forgotPassword', () => {
  it('génère et stocke un token de reset quand l’utilisateur existe, puis enfile l’email de réinitialisation', async () => {
    const userDoc = createUserDoc();
    const usersRepository = createUsersRepositoryMock({
      findByEmail: vi.fn().mockResolvedValue(userDoc),
    });
    const authRepository = createAuthRepositoryMock();
    const enqueueEmailJob = vi.fn().mockResolvedValue(undefined);
    const service = createService(usersRepository, authRepository, enqueueEmailJob);

    await service.forgotPassword({ email: 'chef@quicktable.io' });

    expect(authRepository.createPasswordResetToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-a' }),
    );
    expect(enqueueEmailJob).toHaveBeenCalledOnce();
    const [emailJob] = vi.mocked(enqueueEmailJob).mock.calls[0] as [{ to: string }];
    expect(emailJob.to).toBe('chef@quicktable.io');
  });

  it("ne fait rien (pas d'exception, pas d'email) si l'email n'existe pas — anti-énumération (doc 07 §7.5)", async () => {
    const usersRepository = createUsersRepositoryMock({
      findByEmail: vi.fn().mockResolvedValue(null),
    });
    const authRepository = createAuthRepositoryMock();
    const enqueueEmailJob = vi.fn().mockResolvedValue(undefined);
    const service = createService(usersRepository, authRepository, enqueueEmailJob);

    await expect(
      service.forgotPassword({ email: 'inconnu@quicktable.io' }),
    ).resolves.toBeUndefined();
    expect(authRepository.createPasswordResetToken).not.toHaveBeenCalled();
    expect(enqueueEmailJob).not.toHaveBeenCalled();
  });
});

describe('AuthService#resetPassword', () => {
  it('met à jour le mot de passe, marque le token utilisé, révoque toutes les sessions, enfile l’email de confirmation (doc 07 §7.5)', async () => {
    const storedToken = createStoredPasswordResetToken();
    const userDoc = createUserDoc();
    const usersRepository = createUsersRepositoryMock({
      findById: vi.fn().mockResolvedValue(userDoc),
    });
    const authRepository = createAuthRepositoryMock({
      findPasswordResetTokenByHash: vi.fn().mockResolvedValue(storedToken),
    });
    const enqueueEmailJob = vi.fn().mockResolvedValue(undefined);
    const service = createService(usersRepository, authRepository, enqueueEmailJob);

    await service.resetPassword('raw-reset-token', 'un-nouveau-mdp-solide');

    expect(usersRepository.updatePasswordHash).toHaveBeenCalledWith(
      'user-a',
      'new-hashed-password',
    );
    expect(authRepository.markPasswordResetTokenUsed).toHaveBeenCalledWith('reset-token-id-a');
    expect(authRepository.revokeAllUserRefreshTokens).toHaveBeenCalledWith('user-a');
    expect(enqueueEmailJob).toHaveBeenCalledOnce();
    const [emailJob] = vi.mocked(enqueueEmailJob).mock.calls[0] as [{ to: string }];
    expect(emailJob.to).toBe('chef@quicktable.io');
  });

  it("n'envoie pas d'email de confirmation si l'utilisateur n'est plus trouvable (compte supprimé entre-temps)", async () => {
    const storedToken = createStoredPasswordResetToken();
    const usersRepository = createUsersRepositoryMock({
      findById: vi.fn().mockResolvedValue(null),
    });
    const authRepository = createAuthRepositoryMock({
      findPasswordResetTokenByHash: vi.fn().mockResolvedValue(storedToken),
    });
    const enqueueEmailJob = vi.fn().mockResolvedValue(undefined);
    const service = createService(usersRepository, authRepository, enqueueEmailJob);

    await expect(
      service.resetPassword('raw-reset-token', 'un-nouveau-mdp-solide'),
    ).resolves.toBeUndefined();
    expect(enqueueEmailJob).not.toHaveBeenCalled();
  });

  it('rejette si le token ne correspond à aucun reset connu', async () => {
    const usersRepository = createUsersRepositoryMock();
    const authRepository = createAuthRepositoryMock({
      findPasswordResetTokenByHash: vi.fn().mockResolvedValue(null),
    });
    const service = createService(usersRepository, authRepository);

    await expect(
      service.resetPassword('token-inconnu', 'un-nouveau-mdp-solide'),
    ).rejects.toMatchObject({ code: 'AUTH_RESET_TOKEN_INVALID', httpStatus: 401 });
    expect(usersRepository.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('rejette si le token a déjà été utilisé (usage unique, doc 07 §7.5)', async () => {
    const storedToken = createStoredPasswordResetToken({ usedAt: new Date() });
    const usersRepository = createUsersRepositoryMock();
    const authRepository = createAuthRepositoryMock({
      findPasswordResetTokenByHash: vi.fn().mockResolvedValue(storedToken),
    });
    const service = createService(usersRepository, authRepository);

    await expect(
      service.resetPassword('raw-reset-token', 'un-nouveau-mdp-solide'),
    ).rejects.toMatchObject({ code: 'AUTH_RESET_TOKEN_INVALID', httpStatus: 401 });
  });

  it('rejette si le token est expiré', async () => {
    const storedToken = createStoredPasswordResetToken({ expiresAt: new Date(Date.now() - 1000) });
    const usersRepository = createUsersRepositoryMock();
    const authRepository = createAuthRepositoryMock({
      findPasswordResetTokenByHash: vi.fn().mockResolvedValue(storedToken),
    });
    const service = createService(usersRepository, authRepository);

    await expect(
      service.resetPassword('raw-reset-token', 'un-nouveau-mdp-solide'),
    ).rejects.toMatchObject({ code: 'AUTH_RESET_TOKEN_INVALID', httpStatus: 401 });
  });
});

const RECOVERY_CODE_RAW = 'AB12-CD34-EF56';

function createTwoFactorUserDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return createUserDoc({
    twoFactorEnabled: true,
    twoFactorSecret: encryptTwoFactorSecret('BASE32SECRET', TWO_FACTOR_KEY),
    twoFactorRecoveryCodes: [{ codeHash: hashRecoveryCode(RECOVERY_CODE_RAW), usedAt: null }],
    ...overrides,
  });
}

describe('AuthService#verifyTwoFactor', () => {
  it('émet une session valide quand le code TOTP est correct', async () => {
    verifyTotpCodeMock.mockResolvedValue(true);
    const userDoc = createTwoFactorUserDoc();
    const usersRepository = createUsersRepositoryMock({
      findByIdWithTwoFactorSecret: vi.fn().mockResolvedValue(userDoc),
    });
    const authRepository = createAuthRepositoryMock({
      findMembershipsByUserId: vi.fn().mockResolvedValue([createMembership()]),
    });
    const service = createService(usersRepository, authRepository);
    const challengeToken = signTwoFactorChallengeToken('user-a', SECRET);

    const result = await service.verifyTwoFactor(challengeToken, '123456', {});

    expect(result.accessToken).toEqual(expect.any(String));
    expect(usersRepository.markRecoveryCodeUsed).not.toHaveBeenCalled();
  });

  it('accepte un code de récupération non utilisé si le code TOTP est incorrect, et le marque consommé', async () => {
    verifyTotpCodeMock.mockResolvedValue(false);
    const userDoc = createTwoFactorUserDoc();
    const usersRepository = createUsersRepositoryMock({
      findByIdWithTwoFactorSecret: vi.fn().mockResolvedValue(userDoc),
    });
    const authRepository = createAuthRepositoryMock({
      findMembershipsByUserId: vi.fn().mockResolvedValue([createMembership()]),
    });
    const service = createService(usersRepository, authRepository);
    const challengeToken = signTwoFactorChallengeToken('user-a', SECRET);

    const result = await service.verifyTwoFactor(challengeToken, RECOVERY_CODE_RAW, {});

    expect(result.accessToken).toEqual(expect.any(String));
    expect(usersRepository.markRecoveryCodeUsed).toHaveBeenCalledWith(
      'user-a',
      hashRecoveryCode(RECOVERY_CODE_RAW),
    );
  });

  it('rejette si ni le code TOTP ni un code de récupération non utilisé ne correspondent', async () => {
    verifyTotpCodeMock.mockResolvedValue(false);
    const userDoc = createTwoFactorUserDoc();
    const usersRepository = createUsersRepositoryMock({
      findByIdWithTwoFactorSecret: vi.fn().mockResolvedValue(userDoc),
    });
    const service = createService(usersRepository, createAuthRepositoryMock());
    const challengeToken = signTwoFactorChallengeToken('user-a', SECRET);

    await expect(service.verifyTwoFactor(challengeToken, '000000', {})).rejects.toMatchObject({
      code: 'AUTH_2FA_INVALID_CODE',
      httpStatus: 401,
    });
  });

  it('rejette un code de récupération déjà utilisé', async () => {
    verifyTotpCodeMock.mockResolvedValue(false);
    const userDoc = createTwoFactorUserDoc({
      twoFactorRecoveryCodes: [
        { codeHash: hashRecoveryCode(RECOVERY_CODE_RAW), usedAt: new Date() },
      ],
    });
    const usersRepository = createUsersRepositoryMock({
      findByIdWithTwoFactorSecret: vi.fn().mockResolvedValue(userDoc),
    });
    const service = createService(usersRepository, createAuthRepositoryMock());
    const challengeToken = signTwoFactorChallengeToken('user-a', SECRET);

    await expect(
      service.verifyTwoFactor(challengeToken, RECOVERY_CODE_RAW, {}),
    ).rejects.toMatchObject({ code: 'AUTH_2FA_INVALID_CODE', httpStatus: 401 });
  });

  it('rejette un challengeToken invalide (signature/expiration)', async () => {
    const service = createService(createUsersRepositoryMock(), createAuthRepositoryMock());

    await expect(service.verifyTwoFactor('token-invalide', '123456', {})).rejects.toMatchObject({
      code: 'AUTH_2FA_CHALLENGE_INVALID',
      httpStatus: 401,
    });
  });

  it("rejette si l'utilisateur n'a plus la 2FA activée (désactivée entre le login et le verify)", async () => {
    const usersRepository = createUsersRepositoryMock({
      findByIdWithTwoFactorSecret: vi
        .fn()
        .mockResolvedValue(createUserDoc({ twoFactorEnabled: false })),
    });
    const service = createService(usersRepository, createAuthRepositoryMock());
    const challengeToken = signTwoFactorChallengeToken('user-a', SECRET);

    await expect(service.verifyTwoFactor(challengeToken, '123456', {})).rejects.toMatchObject({
      code: 'AUTH_2FA_CHALLENGE_INVALID',
      httpStatus: 401,
    });
  });
});

describe('AuthService#enableTwoFactor', () => {
  it('génère un secret, le stocke chiffré, génère 10 codes de récupération, retourne le QR Code + les codes en clair', async () => {
    const userDoc = createUserDoc({ twoFactorEnabled: false });
    const usersRepository = createUsersRepositoryMock({
      findById: vi.fn().mockResolvedValue(userDoc),
    });
    const service = createService(usersRepository, createAuthRepositoryMock());

    const result = await service.enableTwoFactor('user-a');

    expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.secret).toBe('GENERATED-TOTP-SECRET');
    expect(result.recoveryCodes).toHaveLength(10);
    expect(usersRepository.setPendingTwoFactorSecret).toHaveBeenCalledWith(
      'user-a',
      expect.any(String),
      expect.arrayContaining([expect.any(String)]),
    );
  });

  it('rejette si la 2FA est déjà activée', async () => {
    const usersRepository = createUsersRepositoryMock({
      findById: vi.fn().mockResolvedValue(createUserDoc({ twoFactorEnabled: true })),
    });
    const service = createService(usersRepository, createAuthRepositoryMock());

    await expect(service.enableTwoFactor('user-a')).rejects.toMatchObject({
      code: 'AUTH_2FA_ALREADY_ENABLED',
      httpStatus: 409,
    });
  });
});

describe('AuthService#confirmTwoFactor', () => {
  it('active la 2FA si le code TOTP est correct, révoque toutes les sessions, notifie par email', async () => {
    verifyTotpCodeMock.mockResolvedValue(true);
    const userDoc = createTwoFactorUserDoc({ twoFactorEnabled: false });
    const usersRepository = createUsersRepositoryMock({
      findByIdWithTwoFactorSecret: vi.fn().mockResolvedValue(userDoc),
    });
    const authRepository = createAuthRepositoryMock();
    const enqueueEmailJob = vi.fn().mockResolvedValue(undefined);
    const service = createService(usersRepository, authRepository, enqueueEmailJob);

    await service.confirmTwoFactor('user-a', '123456');

    expect(usersRepository.confirmTwoFactor).toHaveBeenCalledWith('user-a');
    expect(authRepository.revokeAllUserRefreshTokens).toHaveBeenCalledWith('user-a');
    expect(enqueueEmailJob).toHaveBeenCalledOnce();
  });

  it('rejette un code TOTP incorrect sans activer la 2FA', async () => {
    verifyTotpCodeMock.mockResolvedValue(false);
    const userDoc = createTwoFactorUserDoc({ twoFactorEnabled: false });
    const usersRepository = createUsersRepositoryMock({
      findByIdWithTwoFactorSecret: vi.fn().mockResolvedValue(userDoc),
    });
    const service = createService(usersRepository, createAuthRepositoryMock());

    await expect(service.confirmTwoFactor('user-a', '000000')).rejects.toMatchObject({
      code: 'AUTH_2FA_INVALID_CODE',
      httpStatus: 401,
    });
    expect(usersRepository.confirmTwoFactor).not.toHaveBeenCalled();
  });

  it("rejette si enableTwoFactor n'a jamais été appelé (pas de secret en attente)", async () => {
    const usersRepository = createUsersRepositoryMock({
      findByIdWithTwoFactorSecret: vi
        .fn()
        .mockResolvedValue(createUserDoc({ twoFactorSecret: undefined })),
    });
    const service = createService(usersRepository, createAuthRepositoryMock());

    await expect(service.confirmTwoFactor('user-a', '123456')).rejects.toMatchObject({
      code: 'AUTH_2FA_NOT_ENABLED',
      httpStatus: 401,
    });
  });

  it('rejette si la 2FA est déjà activée (confirm rejoué)', async () => {
    const userDoc = createTwoFactorUserDoc({ twoFactorEnabled: true });
    const usersRepository = createUsersRepositoryMock({
      findByIdWithTwoFactorSecret: vi.fn().mockResolvedValue(userDoc),
    });
    const service = createService(usersRepository, createAuthRepositoryMock());

    await expect(service.confirmTwoFactor('user-a', '123456')).rejects.toMatchObject({
      code: 'AUTH_2FA_ALREADY_ENABLED',
      httpStatus: 409,
    });
  });
});

describe('AuthService#disableTwoFactor', () => {
  it('désactive la 2FA si le mot de passe et le code TOTP sont corrects, révoque les sessions, notifie par email', async () => {
    vi.mocked(argon2.verify).mockResolvedValue(true);
    verifyTotpCodeMock.mockResolvedValue(true);
    const userDoc = createTwoFactorUserDoc();
    const usersRepository = createUsersRepositoryMock({
      findByIdWithPasswordAndTwoFactorSecret: vi.fn().mockResolvedValue(userDoc),
    });
    const authRepository = createAuthRepositoryMock();
    const enqueueEmailJob = vi.fn().mockResolvedValue(undefined);
    const service = createService(usersRepository, authRepository, enqueueEmailJob);

    await service.disableTwoFactor('user-a', 'le-bon-mdp', '123456');

    expect(usersRepository.disableTwoFactor).toHaveBeenCalledWith('user-a');
    expect(authRepository.revokeAllUserRefreshTokens).toHaveBeenCalledWith('user-a');
    expect(enqueueEmailJob).toHaveBeenCalledOnce();
  });

  it('accepte un code de récupération valide à la place du code TOTP', async () => {
    vi.mocked(argon2.verify).mockResolvedValue(true);
    verifyTotpCodeMock.mockResolvedValue(false);
    const userDoc = createTwoFactorUserDoc();
    const usersRepository = createUsersRepositoryMock({
      findByIdWithPasswordAndTwoFactorSecret: vi.fn().mockResolvedValue(userDoc),
    });
    const service = createService(usersRepository, createAuthRepositoryMock());

    await expect(
      service.disableTwoFactor('user-a', 'le-bon-mdp', RECOVERY_CODE_RAW),
    ).resolves.toBeUndefined();
    expect(usersRepository.disableTwoFactor).toHaveBeenCalledWith('user-a');
  });

  it('rejette si le mot de passe est incorrect (même avec un code TOTP valide)', async () => {
    vi.mocked(argon2.verify).mockResolvedValue(false);
    verifyTotpCodeMock.mockResolvedValue(true);
    const userDoc = createTwoFactorUserDoc();
    const usersRepository = createUsersRepositoryMock({
      findByIdWithPasswordAndTwoFactorSecret: vi.fn().mockResolvedValue(userDoc),
    });
    const service = createService(usersRepository, createAuthRepositoryMock());

    await expect(service.disableTwoFactor('user-a', 'mauvais-mdp', '123456')).rejects.toMatchObject(
      { code: 'AUTH_INVALID_CREDENTIALS', httpStatus: 401 },
    );
    expect(usersRepository.disableTwoFactor).not.toHaveBeenCalled();
  });

  it('rejette si le code (TOTP et récupération) est incorrect, même avec le bon mot de passe', async () => {
    vi.mocked(argon2.verify).mockResolvedValue(true);
    verifyTotpCodeMock.mockResolvedValue(false);
    const userDoc = createTwoFactorUserDoc();
    const usersRepository = createUsersRepositoryMock({
      findByIdWithPasswordAndTwoFactorSecret: vi.fn().mockResolvedValue(userDoc),
    });
    const service = createService(usersRepository, createAuthRepositoryMock());

    await expect(service.disableTwoFactor('user-a', 'le-bon-mdp', '000000')).rejects.toMatchObject({
      code: 'AUTH_2FA_INVALID_CODE',
      httpStatus: 401,
    });
  });

  it("rejette si la 2FA n'est pas activée", async () => {
    const usersRepository = createUsersRepositoryMock({
      findByIdWithPasswordAndTwoFactorSecret: vi
        .fn()
        .mockResolvedValue(createUserDoc({ twoFactorEnabled: false })),
    });
    const service = createService(usersRepository, createAuthRepositoryMock());

    await expect(service.disableTwoFactor('user-a', 'le-bon-mdp', '123456')).rejects.toMatchObject({
      code: 'AUTH_2FA_NOT_ENABLED',
      httpStatus: 401,
    });
  });
});
