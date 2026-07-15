import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../database/models/membership.model.js', () => ({
  MembershipModel: { create: vi.fn(), find: vi.fn() },
}));

import { MembershipModel } from '../../../database/models/membership.model.js';
import { MembershipsRepository } from '../memberships.repository.js';

describe('MembershipsRepository', () => {
  it("create() injecte tenantId depuis le contexte, jamais depuis l'appelant", async () => {
    const repository = new MembershipsRepository();

    await repository.create({ userId: 'user-a', role: 'waiter' }, { tenantId: 'tenant-a' });

    expect(MembershipModel.create).toHaveBeenCalledWith({
      userId: 'user-a',
      role: 'waiter',
      tenantId: 'tenant-a',
    });
  });

  it('hérite de BaseRepository : find() fusionne tenantId dans le filtre (doc 06 §6.4)', () => {
    const repository = new MembershipsRepository();

    repository.find({ role: 'manager' }, { tenantId: 'tenant-a' });

    expect(MembershipModel.find).toHaveBeenCalledWith({ role: 'manager', tenantId: 'tenant-a' });
  });
});
