import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

const SECRET = 's'.repeat(32);

vi.mock('../../config/env.js', () => ({
  getEnv: () => ({ JWT_SECRET: SECRET }),
}));

import { requireAuth } from '../auth.middleware.js';

function createRequest(authorization?: string): Request {
  return { headers: { authorization } } as unknown as Request;
}

describe('requireAuth', () => {
  it('rejette une requête sans en-tête Authorization', () => {
    const next = vi.fn() as unknown as NextFunction;

    requireAuth(createRequest(undefined), {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AUTH_TOKEN_MISSING', httpStatus: 401 }),
    );
  });

  it('rejette un en-tête Authorization qui ne commence pas par "Bearer "', () => {
    const next = vi.fn() as unknown as NextFunction;

    requireAuth(createRequest('Basic dXNlcjpwYXNz'), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_TOKEN_MISSING' }));
  });

  it('rejette un token invalide (mauvaise signature)', () => {
    const next = vi.fn() as unknown as NextFunction;
    const forged = jwt.sign({ sub: 'user-a' }, 'un-autre-secret-de-32-caracteres', {
      expiresIn: '15m',
    });

    requireAuth(createRequest(`Bearer ${forged}`), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_TOKEN_INVALID' }));
  });

  it('rejette un token expiré', () => {
    const next = vi.fn() as unknown as NextFunction;
    const expired = jwt.sign({ sub: 'user-a' }, SECRET, { expiresIn: -10 });

    requireAuth(createRequest(`Bearer ${expired}`), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_TOKEN_INVALID' }));
  });

  it('attache les claims décodés à req.auth et appelle next() sans erreur pour un token valide', () => {
    const next = vi.fn() as unknown as NextFunction;
    const payload = {
      sub: 'user-a',
      membershipId: null,
      tenantId: null,
      role: null,
      isSuperAdmin: false,
      permissionsVersion: 0,
    };
    const token = jwt.sign(payload, SECRET, { expiresIn: '15m' });
    const req = createRequest(`Bearer ${token}`);

    requireAuth(req, {} as Response, next);

    expect(req.auth).toMatchObject(payload);
    expect(next).toHaveBeenCalledWith();
  });
});
