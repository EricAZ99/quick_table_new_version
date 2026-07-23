import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/apiClient';

import { useAuthStore } from '../auth.store';

function jsonResponse(status: number, body: unknown) {
  return { status, json: () => Promise.resolve(body) };
}

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('login sans 2FA authentifie immédiatement', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          success: true,
          data: { accessToken: 'at-1', user: { email: 'a@b.com' }, tenants: [] },
        }),
      ),
    );
    const store = useAuthStore();

    const result = await store.login('a@b.com', 'password123');

    expect(result).toEqual({ requires2FA: false });
    expect(store.isAuthenticated).toBe(true);
    expect(store.accessToken).toBe('at-1');
  });

  it('login avec 2FA active laisse la session non ouverte, en attente du code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          success: true,
          data: { requires2FA: true, challengeToken: 'chal-1' },
        }),
      ),
    );
    const store = useAuthStore();

    const result = await store.login('a@b.com', 'password123');

    expect(result).toEqual({ requires2FA: true });
    expect(store.isAuthenticated).toBe(false);
  });

  it('verifyTwoFactor complète la session après un login 2FA', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: { requires2FA: true, challengeToken: 'chal-1' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: { accessToken: 'at-2', user: { email: 'a@b.com' }, tenants: [] },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const store = useAuthStore();
    await store.login('a@b.com', 'password123');

    await store.verifyTwoFactor('123456');

    expect(store.isAuthenticated).toBe(true);
    expect(store.accessToken).toBe('at-2');
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/v1/auth/2fa/verify',
      expect.objectContaining({
        body: JSON.stringify({ challengeToken: 'chal-1', code: '123456' }),
      }),
    );
  });

  it('verifyTwoFactor sans challenge en attente lève une ApiError, sans appel réseau', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const store = useAuthStore();

    await expect(store.verifyTwoFactor('123456')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logout purge la session même si le rappel réseau échoue', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: { accessToken: 'at-1', user: {}, tenants: [] },
        }),
      ),
    );
    const store = useAuthStore();
    await store.login('a@b.com', 'password123');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await store.logout();

    expect(store.isAuthenticated).toBe(false);
    expect(store.accessToken).toBeNull();
  });

  it('restoreSession restaure un accessToken depuis le cookie refreshToken (succès)', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { success: true, data: { accessToken: 'at-restored' } }),
        ),
    );
    const store = useAuthStore();

    const restored = await store.restoreSession();

    expect(restored).toBe(true);
    expect(store.accessToken).toBe('at-restored');
  });

  it('restoreSession échoue proprement sans cookie valide (pas de session à restaurer)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          success: false,
          error: { code: 'AUTH_REFRESH_TOKEN_INVALID', message: 'Session invalide.', details: [] },
        }),
      ),
    );
    const store = useAuthStore();

    const restored = await store.restoreSession();

    expect(restored).toBe(false);
    expect(store.isAuthenticated).toBe(false);
  });

  it('authorizedFetch attache le Bearer token courant', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: { accessToken: 'at-1', user: {}, tenants: [] } }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);
    const store = useAuthStore();
    await store.login('a@b.com', 'password123');

    await store.authorizedFetch('/api/v1/restaurants/me');

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/v1/restaurants/me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer at-1' }),
      }),
    );
  });

  it('authorizedFetch rafraîchit une fois puis rejoue la requête sur AUTH_TOKEN_INVALID', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: { accessToken: 'at-old', user: {}, tenants: [] },
        }),
      )
      // Premier appel /restaurants/me : token expiré.
      .mockResolvedValueOnce(
        jsonResponse(401, {
          success: false,
          error: {
            code: 'AUTH_TOKEN_INVALID',
            message: 'Session invalide ou expirée.',
            details: [],
          },
        }),
      )
      // Rafraîchissement silencieux.
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { accessToken: 'at-new' } }))
      // Second essai, avec le nouveau token.
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { name: 'Le Jardin' } }));
    vi.stubGlobal('fetch', fetchMock);
    const store = useAuthStore();
    await store.login('a@b.com', 'password123');

    const result = await store.authorizedFetch<{ name: string }>('/api/v1/restaurants/me');

    expect(result).toEqual({ name: 'Le Jardin' });
    expect(store.accessToken).toBe('at-new');
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/v1/restaurants/me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer at-new' }),
      }),
    );
  });

  it('authorizedFetch propage l’erreur si le rafraîchissement échoue aussi', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: { accessToken: 'at-old', user: {}, tenants: [] },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, {
          success: false,
          error: {
            code: 'AUTH_TOKEN_INVALID',
            message: 'Session invalide ou expirée.',
            details: [],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, {
          success: false,
          error: { code: 'AUTH_REFRESH_TOKEN_INVALID', message: 'Session invalide.', details: [] },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const store = useAuthStore();
    await store.login('a@b.com', 'password123');

    await expect(store.authorizedFetch('/api/v1/restaurants/me')).rejects.toMatchObject({
      code: 'AUTH_TOKEN_INVALID',
    });
    expect(store.isAuthenticated).toBe(false);
  });

  /** Fabrique un JWT syntaxiquement valide (header.payload.signature) — signature bidon, jamais vérifiée côté client. */
  function fakeAccessToken(payload: Record<string, unknown>): string {
    const base64url = (value: string) =>
      btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${base64url('{}')}.${base64url(JSON.stringify(payload))}.sig`;
  }

  describe('role', () => {
    it('décode le claim role du payload JWT courant', () => {
      const store = useAuthStore();
      store.accessToken = fakeAccessToken({ sub: 'user-1', role: 'manager' });

      expect(store.role).toBe('manager');
    });

    it('vaut null tant qu’aucun accessToken n’est posé', () => {
      const store = useAuthStore();

      expect(store.role).toBeNull();
    });

    it('vaut null pour un token malformé, sans lever d’erreur', () => {
      const store = useAuthStore();
      store.accessToken = 'not-a-jwt';

      expect(store.role).toBeNull();
    });
  });

  describe('authorizedFetchWithMeta', () => {
    it('attache le Bearer token et renvoie data + meta séparément', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(200, {
            success: true,
            data: { accessToken: 'at-1', user: {}, tenants: [] },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse(200, {
            success: true,
            data: [{ id: 'e-1' }],
            meta: { page: 1, limit: 20, total: 1 },
          }),
        );
      vi.stubGlobal('fetch', fetchMock);
      const store = useAuthStore();
      await store.login('a@b.com', 'password123');

      const result = await store.authorizedFetchWithMeta('/api/v1/employees?page=1&limit=20');

      expect(result).toEqual({ data: [{ id: 'e-1' }], meta: { page: 1, limit: 20, total: 1 } });
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/v1/employees?page=1&limit=20',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer at-1' }),
        }),
      );
    });
  });
});
