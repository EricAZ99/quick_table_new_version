import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, NotFoundError } from '../../../shared/errors/index.js';
import { EmployeesService } from '../employees.service.js';

/** Mongoose `Query` factice : chainable (`.populate()/.sort()/.skip()/.limit()`) et `await`-able (thenable). */
function createQueryMock<T>(result: T) {
  const query = {
    populate: vi.fn(() => query),
    sort: vi.fn(() => query),
    skip: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: (resolve: (value: T) => void) => resolve(result),
  };
  return query;
}

function createMembership(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'membership-a',
    role: 'waiter',
    jobTitle: 'Serveur',
    salary: 120000,
    employmentStatus: 'active',
    hiredAt: new Date('2026-01-01'),
    userId: {
      _id: 'user-a',
      email: 'a@b.com',
      fullName: 'Awa Kouassi',
      phone: null,
      avatarUrl: null,
    },
    toObject() {
      return { ...this };
    },
    ...overrides,
  };
}

describe('EmployeesService', () => {
  let membershipsRepository: {
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
  };
  let usersRepository: { findByEmail: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  let service: EmployeesService;

  beforeEach(() => {
    membershipsRepository = {
      find: vi.fn(),
      findOne: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      updateOne: vi.fn(),
    };
    usersRepository = { findByEmail: vi.fn(), create: vi.fn() };
    service = new EmployeesService(membershipsRepository as never, usersRepository as never);
  });

  describe('listEmployees', () => {
    it('applique les filtres role/status et la pagination (skip calculé depuis page/limit)', async () => {
      membershipsRepository.find.mockReturnValue(createQueryMock([createMembership()]));
      membershipsRepository.count.mockResolvedValue(1);

      const result = await service.listEmployees(
        'tenant-a',
        { page: 2, limit: 10, role: 'waiter', status: 'active' },
        true,
      );

      expect(membershipsRepository.find).toHaveBeenCalledWith(
        { role: 'waiter', employmentStatus: 'active' },
        { tenantId: 'tenant-a' },
      );
      expect(result.meta).toEqual({ page: 2, limit: 10, total: 1 });
      expect(result.employees).toHaveLength(1);
    });

    it('masque salary quand canViewSalary est faux', async () => {
      membershipsRepository.find.mockReturnValue(createQueryMock([createMembership()]));
      membershipsRepository.count.mockResolvedValue(1);

      const result = await service.listEmployees('tenant-a', { page: 1, limit: 20 }, false);

      expect(result.employees[0]?.salary).toBeUndefined();
    });

    it('expose salary quand canViewSalary est vrai', async () => {
      membershipsRepository.find.mockReturnValue(createQueryMock([createMembership()]));
      membershipsRepository.count.mockResolvedValue(1);

      const result = await service.listEmployees('tenant-a', { page: 1, limit: 20 }, true);

      expect(result.employees[0]?.salary).toBe(120000);
    });
  });

  describe('getEmployee', () => {
    it('lève NotFoundError si le membership est introuvable (tenant courant)', async () => {
      membershipsRepository.findOne.mockReturnValue(createQueryMock(null));

      await expect(service.getEmployee('tenant-a', 'missing-id', true)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('retourne le DTO enrichi de l’identité users (populate)', async () => {
      membershipsRepository.findOne.mockReturnValue(createQueryMock(createMembership()));

      const employee = await service.getEmployee('tenant-a', 'membership-a', true);

      expect(employee.user).toEqual({
        id: 'user-a',
        email: 'a@b.com',
        fullName: 'Awa Kouassi',
        phone: null,
        avatarUrl: null,
      });
    });
  });

  describe('inviteEmployee', () => {
    it('réutilise un utilisateur existant plutôt que d’en créer un nouveau', async () => {
      usersRepository.findByEmail.mockResolvedValue({ _id: 'user-existing', email: 'a@b.com' });
      membershipsRepository.create.mockResolvedValue(
        createMembership({ userId: { _id: 'user-existing' } }),
      );

      await service.inviteEmployee('tenant-a', {
        email: 'a@b.com',
        fullName: 'Awa',
        role: 'waiter',
      });

      expect(usersRepository.create).not.toHaveBeenCalled();
      expect(membershipsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-existing', role: 'waiter' }),
        { tenantId: 'tenant-a' },
      );
    });

    it("crée un compte avec un mot de passe aléatoire quand l'email est inconnu (pas d'email envoyé, ticket suivant)", async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      usersRepository.create.mockResolvedValue({ _id: 'user-new', email: 'new@b.com' });
      membershipsRepository.create.mockResolvedValue(
        createMembership({ userId: { _id: 'user-new' } }),
      );

      await service.inviteEmployee('tenant-a', {
        email: 'new@b.com',
        fullName: 'Nouvel Employé',
        role: 'cashier',
      });

      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@b.com', fullName: 'Nouvel Employé' }),
      );
      const createCall = usersRepository.create.mock.calls[0]?.[0] as { passwordHash: string };
      expect(createCall.passwordHash).toEqual(expect.any(String));
      expect(createCall.passwordHash.length).toBeGreaterThan(0);
    });

    it('convertit une collision d’index unique (tenantId, userId) en ConflictError EMPLOYEE_ALREADY_MEMBER', async () => {
      usersRepository.findByEmail.mockResolvedValue({ _id: 'user-existing', email: 'a@b.com' });
      const duplicateKeyError = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      membershipsRepository.create.mockRejectedValue(duplicateKeyError);

      await expect(
        service.inviteEmployee('tenant-a', { email: 'a@b.com', fullName: 'Awa', role: 'waiter' }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('propage une erreur non liée à un doublon telle quelle', async () => {
      usersRepository.findByEmail.mockResolvedValue({ _id: 'user-existing', email: 'a@b.com' });
      membershipsRepository.create.mockRejectedValue(new Error('panne réseau'));

      await expect(
        service.inviteEmployee('tenant-a', { email: 'a@b.com', fullName: 'Awa', role: 'waiter' }),
      ).rejects.toThrow('panne réseau');
    });
  });

  describe('updateEmployee', () => {
    it('lève NotFoundError si aucun document ne correspond (matchedCount:0)', async () => {
      membershipsRepository.updateOne.mockResolvedValue({ matchedCount: 0 });

      await expect(
        service.updateEmployee('tenant-a', 'missing-id', { jobTitle: 'Nouveau poste' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('met à jour puis renvoie le DTO à jour (re-fetch)', async () => {
      membershipsRepository.updateOne.mockResolvedValue({ matchedCount: 1 });
      membershipsRepository.findOne.mockReturnValue(
        createQueryMock(createMembership({ jobTitle: 'Nouveau poste' })),
      );

      const employee = await service.updateEmployee('tenant-a', 'membership-a', {
        jobTitle: 'Nouveau poste',
      });

      expect(membershipsRepository.updateOne).toHaveBeenCalledWith(
        { _id: 'membership-a' },
        { jobTitle: 'Nouveau poste' },
        { tenantId: 'tenant-a' },
      );
      expect(employee.jobTitle).toBe('Nouveau poste');
    });
  });

  describe('deactivateEmployee', () => {
    it('lève NotFoundError si aucun document ne correspond', async () => {
      membershipsRepository.updateOne.mockResolvedValue({ matchedCount: 0 });

      await expect(service.deactivateEmployee('tenant-a', 'missing-id')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('positionne employmentStatus:inactive (soft delete, jamais une suppression réelle)', async () => {
      membershipsRepository.updateOne.mockResolvedValue({ matchedCount: 1 });

      await service.deactivateEmployee('tenant-a', 'membership-a');

      expect(membershipsRepository.updateOne).toHaveBeenCalledWith(
        { _id: 'membership-a' },
        { employmentStatus: 'inactive' },
        { tenantId: 'tenant-a' },
      );
    });
  });
});
