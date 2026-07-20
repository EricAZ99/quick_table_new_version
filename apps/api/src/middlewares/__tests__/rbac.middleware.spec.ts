import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../database/models/roleDefinition.model.js', () => ({
  RoleDefinitionModel: { findOne: vi.fn() },
}));
vi.mock('../rbacPermissionsCache.js', () => ({
  getCachedPermissions: vi.fn(),
  setCachedPermissions: vi.fn(),
}));

import { RoleDefinitionModel } from '../../database/models/roleDefinition.model.js';
import { getCachedPermissions, setCachedPermissions } from '../rbacPermissionsCache.js';
import { requirePermission, requirePermissionAsync } from '../rbac.middleware.js';

function createRequest(context?: Record<string, unknown>): Request {
  return {
    context: context && { membershipId: 'membership-a', permissionsOverrides: [], ...context },
  } as unknown as Request;
}

function mockLean(result: unknown) {
  return { lean: vi.fn().mockResolvedValue(result) };
}

describe('requirePermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Cache miss par défaut — chaque test simulant un hit le surcharge explicitement.
    vi.mocked(getCachedPermissions).mockResolvedValue(null);
  });

  it('rejette (401 AUTH_TOKEN_MISSING) si req.context est absent — bug de câblage, resolveTenant doit toujours précéder', async () => {
    const next = vi.fn() as unknown as NextFunction;

    await requirePermissionAsync('orders:read', createRequest(undefined), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_TOKEN_MISSING' }));
  });

  it('laisse passer un super_admin sur une permission platform:* sans lire roleDefinitions ni le cache', async () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = createRequest({ role: null, isSuperAdmin: true });

    await requirePermissionAsync('platform:manage_restaurants', req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(RoleDefinitionModel.findOne).not.toHaveBeenCalled();
    expect(getCachedPermissions).not.toHaveBeenCalled();
  });

  it('rejette (403 RBAC_PERMISSION_DENIED) un super_admin sur une permission tenant (pas de bypass hors platform:*)', async () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = createRequest({ role: null, isSuperAdmin: true });

    await requirePermissionAsync('orders:cancel', req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RBAC_PERMISSION_DENIED', httpStatus: 403 }),
    );
    expect(RoleDefinitionModel.findOne).not.toHaveBeenCalled();
  });

  it('rejette (403 RBAC_PERMISSION_DENIED) un utilisateur sans role (role: null, pas super_admin)', async () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = createRequest({ role: null, isSuperAdmin: false });

    await requirePermissionAsync('orders:read', req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RBAC_PERMISSION_DENIED', httpStatus: 403 }),
    );
    expect(RoleDefinitionModel.findOne).not.toHaveBeenCalled();
    expect(getCachedPermissions).not.toHaveBeenCalled();
  });

  it('rejette (403 RBAC_PERMISSION_DENIED) si membershipId est absent du contexte (rien à mettre en cache)', async () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = createRequest({ role: 'waiter', isSuperAdmin: false, membershipId: null });

    await requirePermissionAsync('orders:read', req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RBAC_PERMISSION_DENIED', httpStatus: 403 }),
    );
    expect(getCachedPermissions).not.toHaveBeenCalled();
  });

  it('laisse passer (cache miss) si la permission est présente dans le roleDefinitions courant du rôle, et met le résultat en cache', async () => {
    vi.mocked(RoleDefinitionModel.findOne).mockReturnValue(
      mockLean({ roleCode: 'waiter', permissions: ['orders:read', 'orders:create'] }) as never,
    );
    const next = vi.fn() as unknown as NextFunction;
    const req = createRequest({ role: 'waiter', isSuperAdmin: false });

    await requirePermissionAsync('orders:read', req, {} as Response, next);

    expect(RoleDefinitionModel.findOne).toHaveBeenCalledWith({
      roleCode: 'waiter',
      isCurrent: true,
    });
    expect(setCachedPermissions).toHaveBeenCalledWith('membership-a', [
      'orders:read',
      'orders:create',
    ]);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejette (403 RBAC_PERMISSION_DENIED) si la permission est absente du roleDefinitions du rôle', async () => {
    vi.mocked(RoleDefinitionModel.findOne).mockReturnValue(
      mockLean({ roleCode: 'waiter', permissions: ['orders:read'] }) as never,
    );
    const next = vi.fn() as unknown as NextFunction;
    const req = createRequest({ role: 'waiter', isSuperAdmin: false });

    await requirePermissionAsync('billing:read', req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RBAC_PERMISSION_DENIED', httpStatus: 403 }),
    );
  });

  it("rejette (403 RBAC_PERMISSION_DENIED) si aucun roleDefinitions courant n'existe pour ce rôle (données manquantes, jamais un 500)", async () => {
    vi.mocked(RoleDefinitionModel.findOne).mockReturnValue(mockLean(null) as never);
    const next = vi.fn() as unknown as NextFunction;
    const req = createRequest({ role: 'waiter', isSuperAdmin: false });

    await requirePermissionAsync('orders:read', req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RBAC_PERMISSION_DENIED', httpStatus: 403 }),
    );
  });

  it('fusionne roleDefinitions et permissionsOverrides (doc 08 §8.1, ex. payments:refund pour un cashier)', async () => {
    vi.mocked(RoleDefinitionModel.findOne).mockReturnValue(
      mockLean({ roleCode: 'cashier', permissions: ['orders:read'] }) as never,
    );
    const next = vi.fn() as unknown as NextFunction;
    const req = createRequest({
      role: 'cashier',
      isSuperAdmin: false,
      permissionsOverrides: ['payments:refund'],
    });

    await requirePermissionAsync('payments:refund', req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(setCachedPermissions).toHaveBeenCalledWith('membership-a', [
      'orders:read',
      'payments:refund',
    ]);
  });

  it("rejette (403 RBAC_PERMISSION_DENIED) si ni le rôle ni permissionsOverrides n'accordent la permission", async () => {
    vi.mocked(RoleDefinitionModel.findOne).mockReturnValue(
      mockLean({ roleCode: 'cashier', permissions: ['orders:read'] }) as never,
    );
    const next = vi.fn() as unknown as NextFunction;
    const req = createRequest({
      role: 'cashier',
      isSuperAdmin: false,
      permissionsOverrides: ['payments:refund'],
    });

    await requirePermissionAsync('billing:read', req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RBAC_PERMISSION_DENIED', httpStatus: 403 }),
    );
  });

  it('laisse passer (cache hit) sans jamais lire roleDefinitions ni réécrire le cache', async () => {
    vi.mocked(getCachedPermissions).mockResolvedValue(['orders:read', 'payments:refund']);
    const next = vi.fn() as unknown as NextFunction;
    const req = createRequest({ role: 'cashier', isSuperAdmin: false });

    await requirePermissionAsync('payments:refund', req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(RoleDefinitionModel.findOne).not.toHaveBeenCalled();
    expect(setCachedPermissions).not.toHaveBeenCalled();
  });

  it('rejette (403 RBAC_PERMISSION_DENIED) une permission absente du cache (cache hit, mais refusé)', async () => {
    vi.mocked(getCachedPermissions).mockResolvedValue(['orders:read']);
    const next = vi.fn() as unknown as NextFunction;
    const req = createRequest({ role: 'cashier', isSuperAdmin: false });

    await requirePermissionAsync('billing:read', req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RBAC_PERMISSION_DENIED', httpStatus: 403 }),
    );
    expect(RoleDefinitionModel.findOne).not.toHaveBeenCalled();
  });

  it('transmet à next() toute erreur inattendue de la requête MongoDB — via le wrapper requirePermission', async () => {
    const dbError = new Error('connexion Mongo perdue');
    vi.mocked(RoleDefinitionModel.findOne).mockImplementation(() => {
      throw dbError;
    });
    const next = vi.fn() as unknown as NextFunction;
    const req = createRequest({ role: 'waiter', isSuperAdmin: false });

    requirePermission('orders:read')(req, {} as Response, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(next).toHaveBeenCalledWith(dbError);
  });
});
