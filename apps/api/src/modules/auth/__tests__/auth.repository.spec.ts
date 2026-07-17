import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../database/models/membership.model.js', () => ({
  MembershipModel: { find: vi.fn() },
}));
vi.mock('../../../database/models/refreshToken.model.js', () => ({
  RefreshTokenModel: {
    create: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    find: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
  },
}));
vi.mock('../../../database/models/passwordResetToken.model.js', () => ({
  PasswordResetTokenModel: { create: vi.fn(), findOne: vi.fn(), updateOne: vi.fn() },
}));

import { MembershipModel } from '../../../database/models/membership.model.js';
import { PasswordResetTokenModel } from '../../../database/models/passwordResetToken.model.js';
import { ALLOW_CROSS_TENANT_OPTION } from '../../../database/models/plugins/tenantScope.js';
import { RefreshTokenModel } from '../../../database/models/refreshToken.model.js';
import { AuthRepository } from '../auth.repository.js';

describe('AuthRepository', () => {
  it('createRefreshToken() délègue directement à RefreshTokenModel.create', async () => {
    const repository = new AuthRepository();
    const input = {
      userId: 'user-a',
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date('2026-08-01'),
    };

    await repository.createRefreshToken(input);

    expect(RefreshTokenModel.create).toHaveBeenCalledWith(input);
  });

  it(`findMembershipsByUserId() interroge par userId avec l'échappatoire ${ALLOW_CROSS_TENANT_OPTION} (résolution cross-tenant au login, doc 07 §7.3)`, () => {
    const setOptions = vi.fn();
    vi.mocked(MembershipModel.find).mockReturnValue({ setOptions } as never);
    const repository = new AuthRepository();

    repository.findMembershipsByUserId('user-a');

    expect(MembershipModel.find).toHaveBeenCalledWith({ userId: 'user-a' });
    expect(setOptions).toHaveBeenCalledWith({ [ALLOW_CROSS_TENANT_OPTION]: true });
  });

  it('findRefreshTokenByHash() délègue directement à RefreshTokenModel.findOne', async () => {
    const repository = new AuthRepository();

    await repository.findRefreshTokenByHash('a'.repeat(64));

    expect(RefreshTokenModel.findOne).toHaveBeenCalledWith({ tokenHash: 'a'.repeat(64) });
  });

  it('revokeRefreshToken() marque revokedAt sur le token ciblé par id', async () => {
    const repository = new AuthRepository();

    await repository.revokeRefreshToken('token-id-a');

    const [filter, update] = vi.mocked(RefreshTokenModel.updateOne).mock.calls[0] ?? [];
    expect(filter).toEqual({ _id: 'token-id-a' });
    expect((update as { revokedAt: Date }).revokedAt).toBeInstanceOf(Date);
  });

  it("revokeAllUserRefreshTokens() marque revokedAt sur tous les tokens actifs de l'utilisateur (doc 07 §7.1 : révocation de toute la famille)", async () => {
    const repository = new AuthRepository();

    await repository.revokeAllUserRefreshTokens('user-a');

    const [filter, update] = vi.mocked(RefreshTokenModel.updateMany).mock.calls[0] ?? [];
    expect(filter).toEqual({ userId: 'user-a', revokedAt: null });
    expect((update as { revokedAt: Date }).revokedAt).toBeInstanceOf(Date);
  });

  it('findActiveRefreshTokensByUserId() interroge les sessions non révoquées et non expirées, triées récent en premier', () => {
    const sort = vi.fn();
    vi.mocked(RefreshTokenModel.find).mockReturnValue({ sort } as never);
    const repository = new AuthRepository();

    repository.findActiveRefreshTokensByUserId('user-a');

    const [filter] = vi.mocked(RefreshTokenModel.find).mock.calls[0] as unknown as [
      { userId: string; revokedAt: null; expiresAt: { $gt: Date } },
    ];
    expect(filter.userId).toBe('user-a');
    expect(filter.revokedAt).toBeNull();
    expect(filter.expiresAt.$gt).toBeInstanceOf(Date);
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it('findRefreshTokenById() délègue directement à RefreshTokenModel.findById', async () => {
    const repository = new AuthRepository();

    await repository.findRefreshTokenById('token-id-a');

    expect(RefreshTokenModel.findById).toHaveBeenCalledWith('token-id-a');
  });

  it("revokeAllUserRefreshTokensExcept() exclut l'id fourni du filtre de révocation", async () => {
    const repository = new AuthRepository();

    await repository.revokeAllUserRefreshTokensExcept('user-a', 'current-session-id');

    const [filter, update] = vi
      .mocked(RefreshTokenModel.updateMany)
      .mock.calls.at(-1) as unknown as [Record<string, unknown>, { revokedAt: Date }];
    expect(filter).toEqual({
      userId: 'user-a',
      revokedAt: null,
      _id: { $ne: 'current-session-id' },
    });
    expect(update.revokedAt).toBeInstanceOf(Date);
  });

  it("revokeAllUserRefreshTokensExcept() n'exclut rien si exceptId est undefined (aucune session courante connue)", async () => {
    const repository = new AuthRepository();

    await repository.revokeAllUserRefreshTokensExcept('user-a', undefined);

    const [filter] = vi.mocked(RefreshTokenModel.updateMany).mock.calls.at(-1) as unknown as [
      Record<string, unknown>,
    ];
    expect(filter).toEqual({ userId: 'user-a', revokedAt: null });
  });

  it('createPasswordResetToken() délègue directement à PasswordResetTokenModel.create', async () => {
    const repository = new AuthRepository();
    const input = {
      userId: 'user-a',
      tokenHash: 'b'.repeat(64),
      expiresAt: new Date('2026-08-01'),
    };

    await repository.createPasswordResetToken(input);

    expect(PasswordResetTokenModel.create).toHaveBeenCalledWith(input);
  });

  it('findPasswordResetTokenByHash() délègue directement à PasswordResetTokenModel.findOne', async () => {
    const repository = new AuthRepository();

    await repository.findPasswordResetTokenByHash('b'.repeat(64));

    expect(PasswordResetTokenModel.findOne).toHaveBeenCalledWith({ tokenHash: 'b'.repeat(64) });
  });

  it('markPasswordResetTokenUsed() marque usedAt sur le token ciblé par id', async () => {
    const repository = new AuthRepository();

    await repository.markPasswordResetTokenUsed('reset-token-id-a');

    const [filter, update] = vi.mocked(PasswordResetTokenModel.updateOne).mock.calls[0] ?? [];
    expect(filter).toEqual({ _id: 'reset-token-id-a' });
    expect((update as { usedAt: Date }).usedAt).toBeInstanceOf(Date);
  });
});
