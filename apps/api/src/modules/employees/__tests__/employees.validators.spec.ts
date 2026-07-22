import { describe, expect, it } from 'vitest';

import {
  inviteEmployeeSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
} from '../employees.validators.js';

const VALID_INVITE = {
  email: 'nouveau@lejardindawa.bj',
  fullName: 'Nouvel Employé',
  role: 'waiter',
};

describe('inviteEmployeeSchema', () => {
  it('accepte un payload minimal valide', () => {
    const result = inviteEmployeeSchema.safeParse(VALID_INVITE);
    expect(result.success).toBe(true);
  });

  it('normalise email en lowercase', () => {
    const result = inviteEmployeeSchema.safeParse({
      ...VALID_INVITE,
      email: 'NOUVEAU@LeJardinDAwa.BJ',
    });
    expect(result.success && result.data.email).toBe('nouveau@lejardindawa.bj');
  });

  it('accepte jobTitle/salary/hiredAt optionnels', () => {
    const result = inviteEmployeeSchema.safeParse({
      ...VALID_INVITE,
      jobTitle: 'Serveur',
      salary: 150000,
      hiredAt: '2026-02-01',
    });
    expect(result.success).toBe(true);
  });

  it.each(['email', 'fullName', 'role'])('rejette un payload sans %s', (field) => {
    const payload: Record<string, unknown> = { ...VALID_INVITE };
    delete payload[field];
    const result = inviteEmployeeSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('rejette un email invalide', () => {
    const result = inviteEmployeeSchema.safeParse({ ...VALID_INVITE, email: 'pas-un-email' });
    expect(result.success).toBe(false);
  });

  it('rejette un rôle inconnu', () => {
    const result = inviteEmployeeSchema.safeParse({ ...VALID_INVITE, role: 'super_admin' });
    expect(result.success).toBe(false);
  });

  it('rejette un salary négatif', () => {
    const result = inviteEmployeeSchema.safeParse({ ...VALID_INVITE, salary: -1 });
    expect(result.success).toBe(false);
  });
});

describe('updateEmployeeSchema', () => {
  it('accepte un payload vide (tous les champs optionnels)', () => {
    expect(updateEmployeeSchema.safeParse({}).success).toBe(true);
  });

  it('accepte jobTitle/salary/employmentStatus', () => {
    const result = updateEmployeeSchema.safeParse({
      jobTitle: 'Manager adjoint',
      salary: 200000,
      employmentStatus: 'inactive',
    });
    expect(result.success).toBe(true);
  });

  it('rejette un employmentStatus inconnu', () => {
    const result = updateEmployeeSchema.safeParse({ employmentStatus: 'pending' });
    expect(result.success).toBe(false);
  });

  it('ignore silencieusement un champ non documenté (role, email)', () => {
    const result = updateEmployeeSchema.safeParse({ role: 'manager' });
    expect(result.success).toBe(true);
    expect(result.success && 'role' in result.data).toBe(false);
  });
});

describe('listEmployeesQuerySchema', () => {
  it('applique les défauts page=1/limit=20 sur une query vide', () => {
    const result = listEmployeesQuerySchema.safeParse({});
    expect(result.success && result.data).toEqual({ page: 1, limit: 20 });
  });

  it('coerce page/limit depuis des chaînes (req.query)', () => {
    const result = listEmployeesQuerySchema.safeParse({ page: '2', limit: '50' });
    expect(result.success && result.data.page).toBe(2);
    expect(result.success && result.data.limit).toBe(50);
  });

  it('rejette un limit au-delà de 100 (doc 09 §9.2)', () => {
    const result = listEmployeesQuerySchema.safeParse({ limit: '101' });
    expect(result.success).toBe(false);
  });

  it('accepte les filtres role/status', () => {
    const result = listEmployeesQuerySchema.safeParse({ role: 'manager', status: 'active' });
    expect(result.success).toBe(true);
  });

  it('rejette un status inconnu', () => {
    const result = listEmployeesQuerySchema.safeParse({ status: 'pending' });
    expect(result.success).toBe(false);
  });
});
