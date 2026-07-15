import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../geolocation.service.js', () => ({
  detectLocationFromIp: vi.fn(),
  normalizeClientIp: vi.fn((ip: string | undefined) => ip),
}));

import { detectLocationFromIp, normalizeClientIp } from '../geolocation.service.js';
import { RestaurantsController } from '../restaurants.controller.js';

function createMockReqRes(ip: string | undefined) {
  const req = { ip } as unknown as Request;
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status } as unknown as Response;

  return { req, res, status, json };
}

describe('RestaurantsController#detectLocation', () => {
  // Les mocks du module sont partagés entre les `it()` de ce fichier
  // (vi.mock hissé, un seul `vi.fn()` par export) : sans ce nettoyage,
  // l'historique d'appels d'un test précédent fausse les assertions
  // `toHaveBeenCalled()` du test suivant.
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("appelle detectLocationFromIp avec l'IP normalisée et renvoie l'enveloppe standard", async () => {
    vi.mocked(normalizeClientIp).mockReturnValue('203.0.113.42');
    vi.mocked(detectLocationFromIp).mockResolvedValue({ country: 'FR', city: 'Paris' });
    const { req, res, status, json } = createMockReqRes('::ffff:203.0.113.42');
    const controller = new RestaurantsController();

    await controller.detectLocation(req, res);

    expect(normalizeClientIp).toHaveBeenCalledWith('::ffff:203.0.113.42');
    expect(detectLocationFromIp).toHaveBeenCalledWith('203.0.113.42');
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ success: true, data: { country: 'FR', city: 'Paris' } });
  });

  it("ne tente pas d'appeler le service GeoIP si req.ip est absent (jamais d'exception)", async () => {
    vi.mocked(normalizeClientIp).mockReturnValue(undefined);
    const { req, res, json } = createMockReqRes(undefined);
    const controller = new RestaurantsController();

    await controller.detectLocation(req, res);

    expect(detectLocationFromIp).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith({ success: true, data: { country: null, city: null } });
  });
});
