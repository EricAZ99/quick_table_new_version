import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../login-rate-limit.js', () => ({
  resetLoginRateLimit: vi.fn().mockResolvedValue(undefined),
}));

import { ValidationError } from '../../../shared/errors/index.js';
import { AuthController } from '../auth.controller.js';
import type { AuthService } from '../auth.service.js';
import { resetLoginRateLimit } from '../login-rate-limit.js';

function createMockRes() {
  const json = vi.fn();
  const cookie = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { status, json, cookie } as unknown as Response & {
    status: typeof status;
    json: typeof json;
    cookie: typeof cookie;
  };
}

const LOGIN_RESULT = {
  accessToken: 'access-token',
  refreshToken: 'raw-refresh-token',
  refreshTokenExpiresAt: new Date('2026-08-15'),
  user: { email: 'chef@quicktable.io' },
  tenants: [{ tenantId: 'tenant-a', role: 'waiter', membershipId: 'membership-a' }],
};

describe('AuthController#login', () => {
  it('connecte avec succès : pose le cookie refreshToken httpOnly et renvoie accessToken/user/tenants (jamais le refreshToken en clair dans le body)', async () => {
    const service = { login: vi.fn().mockResolvedValue(LOGIN_RESULT) } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = {
      body: { email: 'chef@quicktable.io', password: 'x' },
      ip: '203.0.113.42',
      headers: { 'user-agent': 'test-agent' },
    } as unknown as Request;
    const res = createMockRes();

    await controller.login(req, res);

    expect(service.login).toHaveBeenCalledWith(
      { email: 'chef@quicktable.io', password: 'x' },
      { ip: '203.0.113.42', userAgent: 'test-agent' },
    );
    expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'raw-refresh-token', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      expires: LOGIN_RESULT.refreshTokenExpiresAt,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        accessToken: 'access-token',
        user: LOGIN_RESULT.user,
        tenants: LOGIN_RESULT.tenants,
      },
    });
    expect(JSON.stringify(vi.mocked(res.json).mock.calls[0])).not.toContain('raw-refresh-token');
    expect(resetLoginRateLimit).toHaveBeenCalledWith(req);
  });

  it('pose secure:false quand secureCookies=false (dev local HTTP, doc 07 §7.1)', async () => {
    const service = { login: vi.fn().mockResolvedValue(LOGIN_RESULT) } as unknown as AuthService;
    const controller = new AuthController(service, false);
    const req = { body: { email: 'chef@quicktable.io', password: 'x' }, headers: {} } as Request;
    const res = createMockRes();

    await controller.login(req, res);

    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'raw-refresh-token',
      expect.objectContaining({ secure: false }),
    );
  });

  it('lève une ValidationError sur un payload invalide, jamais un 500 (le service n’est pas appelé)', async () => {
    const service = { login: vi.fn() } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = { body: { email: 'pas-un-email' }, headers: {} } as Request;
    const res = createMockRes();

    await expect(controller.login(req, res)).rejects.toBeInstanceOf(ValidationError);
    expect(service.login).not.toHaveBeenCalled();
  });
});
