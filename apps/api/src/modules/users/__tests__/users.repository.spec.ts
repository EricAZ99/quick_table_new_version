import { describe, expect, it, vi } from 'vitest';

const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }));

vi.mock('../../../database/models/user.model.js', () => ({
  UserModel: {
    create: vi.fn(),
    findOne: vi.fn().mockReturnValue({ select: selectMock }),
    findById: vi.fn().mockReturnValue({ select: selectMock }),
    updateOne: vi.fn(),
  },
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

  it("findByEmailWithPasswordHash() normalise en lowercase et force l'inclusion de passwordHash (select:false par défaut)", () => {
    const repository = new UsersRepository();

    repository.findByEmailWithPasswordHash('CHEF@QuickTable.io');

    expect(UserModel.findOne).toHaveBeenCalledWith({ email: 'chef@quicktable.io' });
    expect(selectMock).toHaveBeenCalledWith('+passwordHash');
  });

  it('findById() délègue directement à UserModel.findById', async () => {
    const repository = new UsersRepository();

    await repository.findById('507f1f77bcf86cd799439011');

    expect(UserModel.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
  });

  it('updatePasswordHash() met à jour passwordHash pour le userId ciblé (doc 07 §7.5)', async () => {
    const repository = new UsersRepository();

    await repository.updatePasswordHash('507f1f77bcf86cd799439011', 'nouveau-hash');

    expect(UserModel.updateOne).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011' },
      { passwordHash: 'nouveau-hash' },
    );
  });

  it('findByIdWithTwoFactorSecret() force la sélection du secret et des codes de récupération (select:false par défaut)', () => {
    const repository = new UsersRepository();

    repository.findByIdWithTwoFactorSecret('user-a');

    expect(UserModel.findById).toHaveBeenCalledWith('user-a');
    expect(selectMock).toHaveBeenCalledWith('+twoFactorSecret +twoFactorRecoveryCodes');
  });

  it('findByIdWithPasswordAndTwoFactorSecret() force la sélection de passwordHash + secret + codes (doc 07 §7.6, disable exige le mot de passe)', () => {
    const repository = new UsersRepository();

    repository.findByIdWithPasswordAndTwoFactorSecret('user-a');

    expect(UserModel.findById).toHaveBeenCalledWith('user-a');
    expect(selectMock).toHaveBeenCalledWith(
      '+passwordHash +twoFactorSecret +twoFactorRecoveryCodes',
    );
  });

  it('setPendingTwoFactorSecret() stocke le secret chiffré et les codes hashés (usedAt:null), sans activer la 2FA', async () => {
    const repository = new UsersRepository();

    await repository.setPendingTwoFactorSecret('user-a', 'secret-chiffre', ['hash1', 'hash2']);

    expect(UserModel.updateOne).toHaveBeenCalledWith(
      { _id: 'user-a' },
      {
        twoFactorSecret: 'secret-chiffre',
        twoFactorRecoveryCodes: [
          { codeHash: 'hash1', usedAt: null },
          { codeHash: 'hash2', usedAt: null },
        ],
      },
    );
  });

  it('confirmTwoFactor() active twoFactorEnabled pour le userId ciblé', async () => {
    const repository = new UsersRepository();

    await repository.confirmTwoFactor('user-a');

    expect(UserModel.updateOne).toHaveBeenCalledWith({ _id: 'user-a' }, { twoFactorEnabled: true });
  });

  it('disableTwoFactor() désactive la 2FA et efface secret + codes de récupération', async () => {
    const repository = new UsersRepository();

    await repository.disableTwoFactor('user-a');

    expect(UserModel.updateOne).toHaveBeenCalledWith(
      { _id: 'user-a' },
      {
        twoFactorEnabled: false,
        $unset: { twoFactorSecret: '' },
        twoFactorRecoveryCodes: [],
      },
    );
  });

  it('markRecoveryCodeUsed() marque le code correspondant comme utilisé via le positional operator', async () => {
    const repository = new UsersRepository();

    await repository.markRecoveryCodeUsed('user-a', 'code-hash');

    const [filter, update] = vi.mocked(UserModel.updateOne).mock.calls.at(-1) as unknown as [
      Record<string, unknown>,
      { $set: Record<string, unknown> },
    ];
    expect(filter).toEqual({ _id: 'user-a', 'twoFactorRecoveryCodes.codeHash': 'code-hash' });
    expect(update.$set['twoFactorRecoveryCodes.$.usedAt']).toBeInstanceOf(Date);
  });
});
