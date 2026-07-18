import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../database/models/membership.model.js', () => ({
  MembershipModel: { findOne: vi.fn() },
}));

import { MembershipModel } from '../../database/models/membership.model.js';
import { resolveTenant, resolveTenantAsync } from '../tenant.middleware.js';

function createRequest(auth?: Record<string, unknown>): Request {
  return { auth } as unknown as Request;
}

describe('resolveTenant', () => {
  it('rejette (AUTH_TOKEN_MISSING) si req.auth est absent — bug de câblage, requireAuth doit toujours précéder', async () => {
    const next = vi.fn() as unknown as NextFunction;

    await resolveTenantAsync(createRequest(undefined), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_TOKEN_MISSING' }));
  });

  it('laisse passer un super_admin sans tenantId avec context.tenantId=null (doc 06 §6.3 : routes platform-admin)', async () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = createRequest({
      sub: 'user-a',
      tenantId: null,
      membershipId: null,
      role: null,
      isSuperAdmin: true,
    });

    await resolveTenantAsync(req, {} as Response, next);

    expect(req.context).toEqual({
      tenantId: null,
      userId: 'user-a',
      membershipId: null,
      role: null,
      isSuperAdmin: true,
    });
    expect(next).toHaveBeenCalledWith();
    expect(MembershipModel.findOne).not.toHaveBeenCalled();
  });

  it('rejette (400 TENANT_CONTEXT_REQUIRED) un utilisateur non super_admin sans tenantId (multi-membership sans select-tenant)', async () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = createRequest({
      sub: 'user-a',
      tenantId: null,
      membershipId: null,
      role: null,
      isSuperAdmin: false,
    });

    await resolveTenantAsync(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TENANT_CONTEXT_REQUIRED', httpStatus: 400 }),
    );
  });

  it('résout le contexte tenant et appelle next() quand le membership est actif', async () => {
    vi.mocked(MembershipModel.findOne).mockResolvedValue({
      employmentStatus: 'active',
    } as never);
    const next = vi.fn() as unknown as NextFunction;
    const req = createRequest({
      sub: 'user-a',
      tenantId: 'tenant-a',
      membershipId: 'membership-a',
      role: 'waiter',
      isSuperAdmin: false,
    });

    await resolveTenantAsync(req, {} as Response, next);

    expect(MembershipModel.findOne).toHaveBeenCalledWith({
      _id: 'membership-a',
      tenantId: 'tenant-a',
      userId: 'user-a',
    });
    expect(req.context).toEqual({
      tenantId: 'tenant-a',
      userId: 'user-a',
      membershipId: 'membership-a',
      role: 'waiter',
      isSuperAdmin: false,
    });
    expect(next).toHaveBeenCalledWith();
  });

  it("rejette (403 TENANT_MEMBERSHIP_INACTIVE) si le membership n'existe plus", async () => {
    vi.mocked(MembershipModel.findOne).mockResolvedValue(null);
    const next = vi.fn() as unknown as NextFunction;
    const req = createRequest({
      sub: 'user-a',
      tenantId: 'tenant-a',
      membershipId: 'membership-a',
      role: 'waiter',
      isSuperAdmin: false,
    });

    await resolveTenantAsync(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TENANT_MEMBERSHIP_INACTIVE', httpStatus: 403 }),
    );
  });

  it('rejette (403 TENANT_MEMBERSHIP_INACTIVE) si le membership existe mais employmentStatus=inactive', async () => {
    vi.mocked(MembershipModel.findOne).mockResolvedValue({
      employmentStatus: 'inactive',
    } as never);
    const next = vi.fn() as unknown as NextFunction;
    const req = createRequest({
      sub: 'user-a',
      tenantId: 'tenant-a',
      membershipId: 'membership-a',
      role: 'waiter',
      isSuperAdmin: false,
    });

    await resolveTenantAsync(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TENANT_MEMBERSHIP_INACTIVE', httpStatus: 403 }),
    );
  });

  it('transmet à next() toute erreur inattendue de la requête MongoDB (pas de crash non géré) — via le wrapper resolveTenant', async () => {
    const dbError = new Error('connexion Mongo perdue');
    vi.mocked(MembershipModel.findOne).mockRejectedValue(dbError);
    const next = vi.fn() as unknown as NextFunction;
    const req = createRequest({
      sub: 'user-a',
      tenantId: 'tenant-a',
      membershipId: 'membership-a',
      role: 'waiter',
      isSuperAdmin: false,
    });

    // `resolveTenant` (contrairement à `resolveTenantAsync`) ne rejette
    // jamais sa promesse — elle est interceptée en interne et transformée
    // en `next(error)`, d'où le petit délai pour laisser cette chaîne se
    // résoudre avant d'observer l'appel à `next`.
    resolveTenant(req, {} as Response, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(next).toHaveBeenCalledWith(dbError);
  });
});
