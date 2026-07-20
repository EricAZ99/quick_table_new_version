import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../database/models/roleDefinition.model.js', () => ({
  RoleDefinitionModel: { findOne: vi.fn() },
}));

import { RoleDefinitionModel } from '../../database/models/roleDefinition.model.js';
import { requirePermission, requirePermissionAsync } from '../rbac.middleware.js';

function createRequest(context?: Record<string, unknown>): Request {
  return { context } as unknown as Request;
}

function mockLean(result: unknown) {
  return { lean: vi.fn().mockResolvedValue(result) };
}

describe('requirePermission', () => {
  it('rejette (401 AUTH_TOKEN_MISSING) si req.context est absent — bug de câblage, resolveTenant doit toujours précéder', async () => {
    const next = vi.fn() as unknown as NextFunction;

    await requirePermissionAsync('orders:read', createRequest(undefined), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_TOKEN_MISSING' }));
  });

  it('laisse passer un super_admin sur une permission platform:* sans lire roleDefinitions', async () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = createRequest({ role: null, isSuperAdmin: true });

    await requirePermissionAsync('platform:manage_restaurants', req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(RoleDefinitionModel.findOne).not.toHaveBeenCalled();
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
  });

  it('laisse passer si la permission est présente dans le roleDefinitions courant du rôle', async () => {
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
