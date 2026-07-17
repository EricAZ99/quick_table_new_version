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
  const send = vi.fn();
  const cookie = vi.fn();
  const clearCookie = vi.fn();
  const status = vi.fn().mockReturnValue({ json, send });
  return { status, json, send, cookie, clearCookie } as unknown as Response & {
    status: typeof status;
    json: typeof json;
    send: typeof send;
    cookie: typeof cookie;
    clearCookie: typeof clearCookie;
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

  it('répond 200 { requires2FA: true } sans poser de cookie quand la 2FA est activée (doc 07 §7.3)', async () => {
    const service = {
      login: vi.fn().mockResolvedValue({ requires2FA: true, challengeToken: 'challenge-token' }),
    } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = { body: { email: 'chef@quicktable.io', password: 'x' }, headers: {} } as Request;
    const res = createMockRes();

    await controller.login(req, res);

    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { requires2FA: true, challengeToken: 'challenge-token' },
    });
  });
});

describe('AuthController#verifyTwoFactor', () => {
  it('pose le cookie refreshToken et renvoie la session quand challengeToken/code sont valides', async () => {
    const service = {
      verifyTwoFactor: vi.fn().mockResolvedValue(LOGIN_RESULT),
    } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = {
      body: { challengeToken: 'challenge-token', code: '123456' },
      headers: {},
    } as Request;
    const res = createMockRes();

    await controller.verifyTwoFactor(req, res);

    expect(service.verifyTwoFactor).toHaveBeenCalledWith('challenge-token', '123456', {
      ip: undefined,
      userAgent: undefined,
    });
    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'raw-refresh-token',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { accessToken: 'access-token', user: LOGIN_RESULT.user, tenants: LOGIN_RESULT.tenants },
    });
  });

  it('lève une ValidationError si challengeToken ou code manque', async () => {
    const service = { verifyTwoFactor: vi.fn() } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = { body: { code: '123456' }, headers: {} } as Request;
    const res = createMockRes();

    await expect(controller.verifyTwoFactor(req, res)).rejects.toBeInstanceOf(ValidationError);
    expect(service.verifyTwoFactor).not.toHaveBeenCalled();
  });
});

describe('AuthController#enableTwoFactor', () => {
  it("appelle le service avec l'userId de req.auth, renvoie le QR Code et les codes de récupération", async () => {
    const service = {
      enableTwoFactor: vi.fn().mockResolvedValue({
        qrCodeDataUrl: 'data:image/png;base64,xxx',
        secret: 'JBSWY3DPEHPK3PXP',
        recoveryCodes: ['AB12-CD34-EF56'],
      }),
    } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = { auth: { sub: 'user-a' } } as unknown as Request;
    const res = createMockRes();

    await controller.enableTwoFactor(req, res);

    expect(service.enableTwoFactor).toHaveBeenCalledWith('user-a');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        qrCodeDataUrl: 'data:image/png;base64,xxx',
        secret: 'JBSWY3DPEHPK3PXP',
        recoveryCodes: ['AB12-CD34-EF56'],
      },
    });
  });

  it('rejette avec AUTH_TOKEN_MISSING si req.auth est absent (bug de câblage de route)', async () => {
    const service = { enableTwoFactor: vi.fn() } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = {} as Request;
    const res = createMockRes();

    await expect(controller.enableTwoFactor(req, res)).rejects.toMatchObject({
      code: 'AUTH_TOKEN_MISSING',
    });
    expect(service.enableTwoFactor).not.toHaveBeenCalled();
  });
});

describe('AuthController#confirmTwoFactor', () => {
  it('appelle le service avec userId/code, répond 200 data:null', async () => {
    const service = {
      confirmTwoFactor: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = { auth: { sub: 'user-a' }, body: { code: '123456' } } as unknown as Request;
    const res = createMockRes();

    await controller.confirmTwoFactor(req, res);

    expect(service.confirmTwoFactor).toHaveBeenCalledWith('user-a', '123456');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: null });
  });

  it('lève une ValidationError si code manque', async () => {
    const service = { confirmTwoFactor: vi.fn() } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = { auth: { sub: 'user-a' }, body: {} } as unknown as Request;
    const res = createMockRes();

    await expect(controller.confirmTwoFactor(req, res)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('AuthController#disableTwoFactor', () => {
  it('appelle le service avec userId/password/code, répond 200 data:null', async () => {
    const service = {
      disableTwoFactor: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = {
      auth: { sub: 'user-a' },
      body: { password: 'le-bon-mdp', code: '123456' },
    } as unknown as Request;
    const res = createMockRes();

    await controller.disableTwoFactor(req, res);

    expect(service.disableTwoFactor).toHaveBeenCalledWith('user-a', 'le-bon-mdp', '123456');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: null });
  });

  it('lève une ValidationError si password ou code manque', async () => {
    const service = { disableTwoFactor: vi.fn() } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = { auth: { sub: 'user-a' }, body: { password: 'x' } } as unknown as Request;
    const res = createMockRes();

    await expect(controller.disableTwoFactor(req, res)).rejects.toBeInstanceOf(ValidationError);
  });
});

const REFRESH_RESULT = {
  accessToken: 'new-access-token',
  refreshToken: 'new-raw-refresh-token',
  refreshTokenExpiresAt: new Date('2026-08-15'),
};

describe('AuthController#refresh', () => {
  it("lit le cookie refreshToken et l'Access Token expiré (Authorization: Bearer), pose le nouveau cookie, renvoie uniquement accessToken", async () => {
    const service = {
      refresh: vi.fn().mockResolvedValue(REFRESH_RESULT),
    } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = {
      cookies: { refreshToken: 'old-raw-refresh-token' },
      headers: { authorization: 'Bearer old-expired-access-token', 'user-agent': 'test-agent' },
      ip: '203.0.113.42',
    } as unknown as Request;
    const res = createMockRes();

    await controller.refresh(req, res);

    expect(service.refresh).toHaveBeenCalledWith(
      'old-raw-refresh-token',
      'old-expired-access-token',
      { ip: '203.0.113.42', userAgent: 'test-agent' },
    );
    expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'new-raw-refresh-token', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      expires: REFRESH_RESULT.refreshTokenExpiresAt,
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { accessToken: 'new-access-token' },
    });
    expect(JSON.stringify(vi.mocked(res.json).mock.calls[0])).not.toContain(
      'new-raw-refresh-token',
    );
  });

  it("passe undefined au service si le cookie refreshToken est absent (pas d'exception au niveau controller)", async () => {
    const service = {
      refresh: vi.fn().mockResolvedValue(REFRESH_RESULT),
    } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = { cookies: {}, headers: {} } as unknown as Request;
    const res = createMockRes();

    await controller.refresh(req, res);

    expect(service.refresh).toHaveBeenCalledWith(undefined, undefined, {
      ip: undefined,
      userAgent: undefined,
    });
  });

  it("ignore un header Authorization qui n'est pas au format Bearer", async () => {
    const service = {
      refresh: vi.fn().mockResolvedValue(REFRESH_RESULT),
    } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = {
      cookies: { refreshToken: 'raw-token' },
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    } as unknown as Request;
    const res = createMockRes();

    await controller.refresh(req, res);

    expect(service.refresh).toHaveBeenCalledWith('raw-token', undefined, expect.any(Object));
  });
});

describe('AuthController#logout', () => {
  it('révoque la session, efface le cookie refreshToken, répond 204 sans corps', async () => {
    const service = { logout: vi.fn().mockResolvedValue(undefined) } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = { cookies: { refreshToken: 'raw-refresh-token' } } as unknown as Request;
    const res = createMockRes();

    await controller.logout(req, res);

    expect(service.logout).toHaveBeenCalledWith('raw-refresh-token');
    expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', { path: '/' });
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalledWith();
  });

  it("fonctionne sans cookie (logout idempotent, pas d'exception)", async () => {
    const service = { logout: vi.fn().mockResolvedValue(undefined) } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = { cookies: {} } as unknown as Request;
    const res = createMockRes();

    await controller.logout(req, res);

    expect(service.logout).toHaveBeenCalledWith(undefined);
    expect(res.status).toHaveBeenCalledWith(204);
  });
});

describe('AuthController#listSessions', () => {
  it("appelle le service avec l'userId (req.auth) et le cookie refreshToken courant, renvoie la liste", async () => {
    const sessions = [
      {
        id: 'session-a',
        deviceInfo: { userAgent: 'test-agent' },
        createdAt: new Date('2026-07-01'),
        expiresAt: new Date('2026-08-01'),
        isCurrent: true,
      },
    ];
    const service = { listSessions: vi.fn().mockResolvedValue(sessions) } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = {
      auth: { sub: 'user-a' },
      cookies: { refreshToken: 'raw-refresh-token' },
    } as unknown as Request;
    const res = createMockRes();

    await controller.listSessions(req, res);

    expect(service.listSessions).toHaveBeenCalledWith('user-a', 'raw-refresh-token');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { sessions } });
  });

  it('rejette avec AUTH_TOKEN_MISSING si req.auth est absent', async () => {
    const service = { listSessions: vi.fn() } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = { cookies: {} } as unknown as Request;
    const res = createMockRes();

    await expect(controller.listSessions(req, res)).rejects.toMatchObject({
      code: 'AUTH_TOKEN_MISSING',
    });
    expect(service.listSessions).not.toHaveBeenCalled();
  });
});

describe('AuthController#revokeSession', () => {
  it("appelle le service avec l'userId et l'id du paramètre de route, répond 204", async () => {
    const service = {
      revokeSession: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = { auth: { sub: 'user-a' }, params: { id: 'session-a' } } as unknown as Request;
    const res = createMockRes();

    await controller.revokeSession(req, res);

    expect(service.revokeSession).toHaveBeenCalledWith('user-a', 'session-a');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalledWith();
  });
});

describe('AuthController#revokeOtherSessions', () => {
  it("appelle le service avec l'userId et le cookie refreshToken courant, répond 204", async () => {
    const service = {
      revokeOtherSessions: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = {
      auth: { sub: 'user-a' },
      cookies: { refreshToken: 'raw-refresh-token' },
    } as unknown as Request;
    const res = createMockRes();

    await controller.revokeOtherSessions(req, res);

    expect(service.revokeOtherSessions).toHaveBeenCalledWith('user-a', 'raw-refresh-token');
    expect(res.status).toHaveBeenCalledWith(204);
  });
});

describe('AuthController#forgotPassword', () => {
  it('répond 200 avec data:null même quand le service ne fait rien (anti-énumération, doc 07 §7.5)', async () => {
    const service = {
      forgotPassword: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = { body: { email: 'chef@quicktable.io' } } as Request;
    const res = createMockRes();

    await controller.forgotPassword(req, res);

    expect(service.forgotPassword).toHaveBeenCalledWith({ email: 'chef@quicktable.io' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: null });
  });

  it('lève une ValidationError sur un email invalide, jamais un 500', async () => {
    const service = { forgotPassword: vi.fn() } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = { body: { email: 'pas-un-email' } } as Request;
    const res = createMockRes();

    await expect(controller.forgotPassword(req, res)).rejects.toBeInstanceOf(ValidationError);
    expect(service.forgotPassword).not.toHaveBeenCalled();
  });
});

describe('AuthController#resetPassword', () => {
  it('appelle le service avec token/newPassword, répond 200 avec data:null', async () => {
    const service = {
      resetPassword: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = {
      body: { token: 'un-token', newPassword: 'un-nouveau-mdp-solide' },
    } as Request;
    const res = createMockRes();

    await controller.resetPassword(req, res);

    expect(service.resetPassword).toHaveBeenCalledWith('un-token', 'un-nouveau-mdp-solide');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: null });
  });

  it('lève une ValidationError sur un newPassword trop court, jamais un 500', async () => {
    const service = { resetPassword: vi.fn() } as unknown as AuthService;
    const controller = new AuthController(service, true);
    const req = { body: { token: 'un-token', newPassword: 'court' } } as Request;
    const res = createMockRes();

    await expect(controller.resetPassword(req, res)).rejects.toBeInstanceOf(ValidationError);
    expect(service.resetPassword).not.toHaveBeenCalled();
  });
});
