import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../models/roleDefinition.model.js', () => ({
  RoleDefinitionModel: { findOne: vi.fn(), updateOne: vi.fn(), create: vi.fn() },
}));

import { RoleDefinitionModel } from '../../models/roleDefinition.model.js';
import { ROLE_DEFINITIONS_SEED_DATA, seedRoleDefinitions } from '../roleDefinitions.seed.js';

describe('ROLE_DEFINITIONS_SEED_DATA', () => {
  it('couvre les 5 rôles tenant (doc 08 §8.2), jamais super_admin/customer', () => {
    const roleCodes = ROLE_DEFINITIONS_SEED_DATA.map((entry) => entry.roleCode).sort();
    expect(roleCodes).toEqual(['cashier', 'kitchen', 'manager', 'restaurant_owner', 'waiter']);
  });

  it("n'inclut jamais une permission 🔒 (accordée uniquement via permissionsOverrides)", () => {
    const cashier = ROLE_DEFINITIONS_SEED_DATA.find((entry) => entry.roleCode === 'cashier');
    const waiter = ROLE_DEFINITIONS_SEED_DATA.find((entry) => entry.roleCode === 'waiter');
    expect(cashier?.permissions).not.toContain('orders:create');
    expect(cashier?.permissions).not.toContain('payments:refund');
    expect(waiter?.permissions).not.toContain('orders:cancel');
  });

  it('reflète la matrice doc 08 §8.4 pour restaurant_owner (accès complet à son tenant)', () => {
    const owner = ROLE_DEFINITIONS_SEED_DATA.find((entry) => entry.roleCode === 'restaurant_owner');
    expect(owner?.permissions).toContain('billing:manage_payment_method');
    expect(owner?.permissions).toContain('audit-logs:read');
  });

  it("n'inclut aucune permission absente de la matrice pour tous les rôles (gap signalé, non corrigé)", () => {
    const allPermissions = ROLE_DEFINITIONS_SEED_DATA.flatMap((entry) => entry.permissions);
    for (const missing of [
      'employees:read',
      'tables:read',
      'menus:read',
      'payments:read',
      'subscriptions:read',
      'notifications:read',
      'notifications:manage_preferences',
      'qrcode:regenerate',
    ]) {
      expect(allPermissions).not.toContain(missing);
    }
  });
});

describe('seedRoleDefinitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('insère la version 1 pour chaque rôle si aucune version courante n’existe', async () => {
    vi.mocked(RoleDefinitionModel.findOne).mockResolvedValue(null);

    await seedRoleDefinitions();

    expect(RoleDefinitionModel.updateOne).not.toHaveBeenCalled();
    expect(RoleDefinitionModel.create).toHaveBeenCalledTimes(ROLE_DEFINITIONS_SEED_DATA.length);
    expect(RoleDefinitionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ roleCode: 'restaurant_owner', version: 1, isCurrent: true }),
    );
  });

  it('ne crée aucune nouvelle version si les permissions courantes sont déjà identiques (idempotent, ordre indifférent)', async () => {
    vi.mocked(RoleDefinitionModel.findOne).mockImplementation(((filter: { roleCode: string }) => {
      const { roleCode } = filter;
      const entry = ROLE_DEFINITIONS_SEED_DATA.find((e) => e.roleCode === roleCode);
      return Promise.resolve({
        _id: `id-${roleCode}`,
        roleCode,
        version: 1,
        permissions: [...(entry?.permissions ?? [])].reverse(),
      });
    }) as typeof RoleDefinitionModel.findOne);

    await seedRoleDefinitions();

    expect(RoleDefinitionModel.updateOne).not.toHaveBeenCalled();
    expect(RoleDefinitionModel.create).not.toHaveBeenCalled();
  });

  it('insère une nouvelle version et désactive isCurrent sur l’ancienne si les permissions ont changé', async () => {
    vi.mocked(RoleDefinitionModel.findOne).mockImplementation(((filter: { roleCode: string }) => {
      const { roleCode } = filter;
      if (roleCode === 'waiter') {
        return Promise.resolve({
          _id: 'old-waiter-id',
          roleCode: 'waiter',
          version: 3,
          permissions: ['orders:read'],
        });
      }
      const entry = ROLE_DEFINITIONS_SEED_DATA.find((e) => e.roleCode === roleCode);
      return Promise.resolve({
        _id: `id-${roleCode}`,
        roleCode,
        version: 1,
        permissions: entry?.permissions ?? [],
      });
    }) as typeof RoleDefinitionModel.findOne);

    await seedRoleDefinitions();

    expect(RoleDefinitionModel.updateOne).toHaveBeenCalledTimes(1);
    expect(RoleDefinitionModel.updateOne).toHaveBeenCalledWith(
      { _id: 'old-waiter-id' },
      { $set: { isCurrent: false } },
    );
    expect(RoleDefinitionModel.create).toHaveBeenCalledTimes(1);
    expect(RoleDefinitionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ roleCode: 'waiter', version: 4, isCurrent: true }),
    );
  });
});
