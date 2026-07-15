import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../database/models/membership.model.js', () => ({
  MembershipModel: { find: vi.fn() },
}));
vi.mock('../../../database/models/refreshToken.model.js', () => ({
  RefreshTokenModel: { create: vi.fn() },
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
});
