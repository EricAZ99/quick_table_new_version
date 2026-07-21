import { afterEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/plugins/i18n.plugin';

import { apiRequest, ApiError } from '../apiClient';

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renvoie data quand success:true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ success: true, data: { foo: 'bar' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const data = await apiRequest<{ foo: string }>('/api/v1/whatever');

    expect(data).toEqual({ foo: 'bar' });
  });

  it('envoie Accept-Language avec la locale i18n courante', async () => {
    i18n.global.locale.value = 'it';
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ success: true, data: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/api/v1/whatever');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/whatever',
      expect.objectContaining({ headers: expect.objectContaining({ 'Accept-Language': 'it' }) }),
    );
    i18n.global.locale.value = 'fr';
  });

  it('lève ApiError quand success:false, avec code et message du serveur', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 401,
        json: () =>
          Promise.resolve({
            success: false,
            error: {
              code: 'AUTH_INVALID_CREDENTIALS',
              message: 'Email ou mot de passe incorrect.',
              details: [],
            },
          }),
      }),
    );

    await expect(apiRequest('/api/v1/auth/login')).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Email ou mot de passe incorrect.',
    });
    await expect(apiRequest('/api/v1/auth/login')).rejects.toBeInstanceOf(ApiError);
  });

  it('renvoie undefined sans parser de JSON sur un 204 No Content', async () => {
    const jsonSpy = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 204, json: jsonSpy }));

    const data = await apiRequest('/api/v1/auth/logout', { method: 'POST' });

    expect(data).toBeUndefined();
    expect(jsonSpy).not.toHaveBeenCalled();
  });
});
