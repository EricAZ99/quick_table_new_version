import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCountryDetection } from '../useCountryDetection';

describe('useCountryDetection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('appelle GET /api/v1/restaurants/detect-location et expose le résultat', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { country: 'FR', city: 'Paris' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { detected, hasError, isLoading, detect } = useCountryDetection();

    const promise = detect();
    expect(isLoading.value).toBe(true);
    await promise;

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/restaurants/detect-location');
    expect(isLoading.value).toBe(false);
    expect(hasError.value).toBe(false);
    expect(detected.value).toEqual({ country: 'FR', city: 'Paris' });
  });

  it("n'est jamais une erreur quand la géolocalisation échoue côté backend (200, country:null — doc 35 §35.2)", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { country: null, city: null } }),
      }),
    );
    const { detected, hasError, detect } = useCountryDetection();

    await detect();

    expect(hasError.value).toBe(false);
    expect(detected.value).toEqual({ country: null, city: null });
  });

  it('signale une erreur si la réponse HTTP est en échec (backend injoignable)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const { detected, hasError, isLoading, detect } = useCountryDetection();

    await detect();

    expect(hasError.value).toBe(true);
    expect(isLoading.value).toBe(false);
    expect(detected.value).toBeNull();
  });

  it('signale une erreur si fetch lève (réseau coupé), jamais une exception non gérée', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const { hasError, isLoading, detect } = useCountryDetection();

    await expect(detect()).resolves.toBeUndefined();
    expect(hasError.value).toBe(true);
    expect(isLoading.value).toBe(false);
  });
});
