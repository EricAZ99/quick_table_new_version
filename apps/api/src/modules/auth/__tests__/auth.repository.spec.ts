import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../database/models/membership.model.js', () => ({
  MembershipModel: { find: vi.fn() },
}));
vi.mock('../../../database/models/refreshToken.model.js', () => ({
  RefreshTokenModel: { create: vi.fn(), findOne: vi.fn(), updateOne: vi.fn(), updateMany: vi.fn() },
}));

import { MembershipModel } from '../../../database/models/membership.model.js';
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
});
