import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../middlewares/rbac.middleware.js', () => ({
  resolvePermissions: vi.fn(),
}));

import { resolvePermissions } from '../../../middlewares/rbac.middleware.js';
import { EmployeesController } from '../employees.controller.js';

function createMockReqRes(
  context: Record<string, unknown> | undefined,
  overrides: Partial<Request> = {},
) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const send = vi.fn();
  const res = { status } as unknown as Response;
  const req = { context, params: {}, query: {}, body: {}, ...overrides } as unknown as Request;
  status.mockReturnValue({ json, send });

  return { req, res, status, json, send };
}

const TENANT_CONTEXT = {
  tenantId: 'tenant-a',
  role: 'manager',
  membershipId: 'membership-caller',
  permissionsOverrides: [],
  isSuperAdmin: false,
};

describe('EmployeesController', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('rejette un payload de query invalide (400 EMPLOYEE_INVALID_PAYLOAD)', async () => {
      const service = { listEmployees: vi.fn() };
      const controller = new EmployeesController(service as never);
      const { req, res } = createMockReqRes(TENANT_CONTEXT, { query: { limit: '999' } });

      await expect(controller.list(req, res)).rejects.toMatchObject({
        code: 'EMPLOYEE_INVALID_PAYLOAD',
      });
      expect(service.listEmployees).not.toHaveBeenCalled();
    });

    it('résout canViewSalary via resolvePermissions puis renvoie liste + meta', async () => {
      vi.mocked(resolvePermissions).mockResolvedValue(['employees:view_salary']);
      const service = {
        listEmployees: vi
          .fn()
          .mockResolvedValue({ employees: [{ id: 'm1' }], meta: { page: 1, limit: 20, total: 1 } }),
      };
      const controller = new EmployeesController(service as never);
      const { req, res, status, json } = createMockReqRes(TENANT_CONTEXT, { query: {} });

      await controller.list(req, res);

      expect(resolvePermissions).toHaveBeenCalledWith('manager', 'membership-caller', []);
      expect(service.listEmployees).toHaveBeenCalledWith('tenant-a', { page: 1, limit: 20 }, true);
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({
        success: true,
        data: [{ id: 'm1' }],
        meta: { page: 1, limit: 20, total: 1 },
      });
    });

    it("canViewSalary est faux sans membership (pas de rôle résolu) — jamais d'appel resolvePermissions", async () => {
      const service = {
        listEmployees: vi
          .fn()
          .mockResolvedValue({ employees: [], meta: { page: 1, limit: 20, total: 0 } }),
      };
      const controller = new EmployeesController(service as never);
      const { req, res } = createMockReqRes(
        { ...TENANT_CONTEXT, role: null, membershipId: null },
        { query: {} },
      );

      await controller.list(req, res);

      expect(resolvePermissions).not.toHaveBeenCalled();
      expect(service.listEmployees).toHaveBeenCalledWith('tenant-a', { page: 1, limit: 20 }, false);
    });
  });

  describe('getOne', () => {
    it('résout canViewSalary puis renvoie le détail (200)', async () => {
      vi.mocked(resolvePermissions).mockResolvedValue([]);
      const service = { getEmployee: vi.fn().mockResolvedValue({ id: 'm1' }) };
      const controller = new EmployeesController(service as never);
      const { req, res, status, json } = createMockReqRes(TENANT_CONTEXT, { params: { id: 'm1' } });

      await controller.getOne(req, res);

      expect(service.getEmployee).toHaveBeenCalledWith('tenant-a', 'm1', false);
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ success: true, data: { id: 'm1' } });
    });
  });

  describe('create', () => {
    it('rejette un payload invalide (400 EMPLOYEE_INVALID_PAYLOAD)', async () => {
      const service = { inviteEmployee: vi.fn() };
      const controller = new EmployeesController(service as never);
      const { req, res } = createMockReqRes(TENANT_CONTEXT, { body: { email: 'pas-un-email' } });

      await expect(controller.create(req, res)).rejects.toMatchObject({
        code: 'EMPLOYEE_INVALID_PAYLOAD',
      });
      expect(service.inviteEmployee).not.toHaveBeenCalled();
    });

    it('crée et renvoie 201 avec le DTO', async () => {
      const service = { inviteEmployee: vi.fn().mockResolvedValue({ id: 'm2' }) };
      const controller = new EmployeesController(service as never);
      const { req, res, status, json } = createMockReqRes(TENANT_CONTEXT, {
        body: { email: 'new@b.com', fullName: 'Nouvel Employé', role: 'waiter' },
      });

      await controller.create(req, res);

      expect(service.inviteEmployee).toHaveBeenCalledWith(
        'tenant-a',
        expect.objectContaining({ email: 'new@b.com', role: 'waiter' }),
      );
      expect(status).toHaveBeenCalledWith(201);
      expect(json).toHaveBeenCalledWith({ success: true, data: { id: 'm2' } });
    });
  });

  describe('update', () => {
    it('rejette un payload invalide (400 EMPLOYEE_INVALID_PAYLOAD)', async () => {
      const service = { updateEmployee: vi.fn() };
      const controller = new EmployeesController(service as never);
      const { req, res } = createMockReqRes(TENANT_CONTEXT, {
        params: { id: 'm1' },
        body: { employmentStatus: 'pending' },
      });

      await expect(controller.update(req, res)).rejects.toMatchObject({
        code: 'EMPLOYEE_INVALID_PAYLOAD',
      });
    });

    it('met à jour et renvoie 200', async () => {
      const service = { updateEmployee: vi.fn().mockResolvedValue({ id: 'm1', jobTitle: 'Chef' }) };
      const controller = new EmployeesController(service as never);
      const { req, res, status, json } = createMockReqRes(TENANT_CONTEXT, {
        params: { id: 'm1' },
        body: { jobTitle: 'Chef' },
      });

      await controller.update(req, res);

      expect(service.updateEmployee).toHaveBeenCalledWith('tenant-a', 'm1', { jobTitle: 'Chef' });
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ success: true, data: { id: 'm1', jobTitle: 'Chef' } });
    });
  });

  describe('remove', () => {
    it('désactive puis renvoie 204 sans corps', async () => {
      const service = { deactivateEmployee: vi.fn().mockResolvedValue(undefined) };
      const controller = new EmployeesController(service as never);
      const { req, res, status, send } = createMockReqRes(TENANT_CONTEXT, { params: { id: 'm1' } });

      await controller.remove(req, res);

      expect(service.deactivateEmployee).toHaveBeenCalledWith('tenant-a', 'm1');
      expect(status).toHaveBeenCalledWith(204);
      expect(send).toHaveBeenCalledWith();
    });
  });
});
