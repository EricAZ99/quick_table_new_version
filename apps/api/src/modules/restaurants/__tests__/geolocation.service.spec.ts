import { afterEach, describe, expect, it, vi } from 'vitest';

import { detectLocationFromIp } from '../geolocation.service.js';

describe('detectLocationFromIp', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retourne country/city pour une réponse ip-api.com réussie', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success', countryCode: 'FR', city: 'Paris' }),
      }),
    );

    const result = await detectLocationFromIp('203.0.113.42');

    expect(result).toEqual({ country: 'FR', city: 'Paris' });
  });

  it("retourne {country:null, city:null} si ip-api.com renvoie status:'fail' (ex. IP privée)", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'fail', message: 'private range' }),
      }),
    );

    const result = await detectLocationFromIp('127.0.0.1');

    expect(result).toEqual({ country: null, city: null });
  });

  it('retourne {country:null, city:null} sur une réponse HTTP non-ok (jamais une exception)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const result = await detectLocationFromIp('203.0.113.42');

    expect(result).toEqual({ country: null, city: null });
  });

  it('retourne {country:null, city:null} sur une erreur réseau/timeout (jamais une exception)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));

    const result = await detectLocationFromIp('203.0.113.42');

    expect(result).toEqual({ country: null, city: null });
  });
});
