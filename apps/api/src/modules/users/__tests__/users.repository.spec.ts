import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../database/models/user.model.js', () => ({
  UserModel: { create: vi.fn(), findOne: vi.fn(), findById: vi.fn() },
}));

import { UserModel } from '../../../database/models/user.model.js';
import { UsersRepository } from '../users.repository.js';

describe('UsersRepository', () => {
  it('create() délègue directement à UserModel.create', async () => {
    const repository = new UsersRepository();
    const input = { email: 'chef@quicktable.io', passwordHash: 'hash', fullName: 'Chef' };

    await repository.create(input);

    expect(UserModel.create).toHaveBeenCalledWith(input);
  });

  it('findByEmail() normalise en lowercase (doc 05 : email unique, normalisé lowercase)', async () => {
    const repository = new UsersRepository();

    await repository.findByEmail('CHEF@QuickTable.io');

    expect(UserModel.findOne).toHaveBeenCalledWith({ email: 'chef@quicktable.io' });
  });

  it('findById() délègue directement à UserModel.findById', async () => {
    const repository = new UsersRepository();

    await repository.findById('507f1f77bcf86cd799439011');

    expect(UserModel.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
  });
});
