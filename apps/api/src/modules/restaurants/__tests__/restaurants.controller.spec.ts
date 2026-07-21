import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../geolocation.service.js', () => ({
  detectLocationFromIp: vi.fn(),
}));
vi.mock('../../../shared/utils/normalizeClientIp.js', () => ({
  normalizeClientIp: vi.fn((ip: string | undefined) => ip),
}));

import { normalizeClientIp } from '../../../shared/utils/normalizeClientIp.js';
import { detectLocationFromIp } from '../geolocation.service.js';
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
    const controller = new RestaurantsController({} as never);

    await controller.detectLocation(req, res);

    expect(normalizeClientIp).toHaveBeenCalledWith('::ffff:203.0.113.42');
    expect(detectLocationFromIp).toHaveBeenCalledWith('203.0.113.42');
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ success: true, data: { country: 'FR', city: 'Paris' } });
  });

  it("ne tente pas d'appeler le service GeoIP si req.ip est absent (jamais d'exception)", async () => {
    vi.mocked(normalizeClientIp).mockReturnValue(undefined);
    const { req, res, json } = createMockReqRes(undefined);
    const controller = new RestaurantsController({} as never);

    await controller.detectLocation(req, res);

    expect(detectLocationFromIp).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith({ success: true, data: { country: null, city: null } });
  });
});

function createMockRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { status, json } as unknown as Response & { status: typeof status; json: typeof json };
}

function createMockService() {
  return {
    createRestaurant: vi.fn(),
    getMyRestaurant: vi.fn(),
    updateMyRestaurant: vi.fn(),
    updateMyRestaurantSettings: vi.fn(),
  };
}

const VALID_CREATE_BODY = {
  name: 'Chez Amara',
  country: 'BJ',
  countryDetectionMethod: 'manual',
  locale: 'fr',
  timezone: 'Africa/Porto-Novo',
  currency: 'XOF',
  ownerId: '65f000000000000000000001',
};

describe('RestaurantsController#create', () => {
  it('valide le payload, appelle le service, répond 201', async () => {
    const service = createMockService();
    service.createRestaurant.mockResolvedValue({ _id: 'restaurant-a' });
    const controller = new RestaurantsController(service as never);
    const req = { body: VALID_CREATE_BODY } as unknown as Request;
    const res = createMockRes();

    await controller.create(req, res);

    expect(service.createRestaurant).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Chez Amara', country: 'BJ' }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { _id: 'restaurant-a' } });
  });

  it('rejette (RESTAURANT_INVALID_PAYLOAD) un payload invalide, jamais un 500', async () => {
    const service = createMockService();
    const controller = new RestaurantsController(service as never);
    const req = { body: {} } as unknown as Request;
    const res = createMockRes();

    await expect(controller.create(req, res)).rejects.toMatchObject({
      code: 'RESTAURANT_INVALID_PAYLOAD',
      httpStatus: 400,
    });
    expect(service.createRestaurant).not.toHaveBeenCalled();
  });
});

describe('RestaurantsController#getMe', () => {
  it('répond 200 avec le restaurant du tenant courant', async () => {
    const service = createMockService();
    service.getMyRestaurant.mockResolvedValue({ _id: 'restaurant-a' });
    const controller = new RestaurantsController(service as never);
    const req = { context: { tenantId: 'restaurant-a' } } as unknown as Request;
    const res = createMockRes();

    await controller.getMe(req, res);

    expect(service.getMyRestaurant).toHaveBeenCalledWith('restaurant-a');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { _id: 'restaurant-a' } });
  });

  it('rejette (400 TENANT_CONTEXT_REQUIRED) si req.context.tenantId est null', async () => {
    const service = createMockService();
    const controller = new RestaurantsController(service as never);
    const req = { context: { tenantId: null } } as unknown as Request;
    const res = createMockRes();

    await expect(controller.getMe(req, res)).rejects.toMatchObject({
      code: 'TENANT_CONTEXT_REQUIRED',
      httpStatus: 400,
    });
  });

  it('rejette (404 RESTAURANT_NOT_FOUND) si le service ne trouve rien', async () => {
    const service = createMockService();
    service.getMyRestaurant.mockResolvedValue(null);
    const controller = new RestaurantsController(service as never);
    const req = { context: { tenantId: 'restaurant-a' } } as unknown as Request;
    const res = createMockRes();

    await expect(controller.getMe(req, res)).rejects.toMatchObject({
      code: 'RESTAURANT_NOT_FOUND',
      httpStatus: 404,
    });
  });
});

describe('RestaurantsController#updateMe', () => {
  it('valide le payload, appelle le service avec le tenantId du contexte, répond 200', async () => {
    const service = createMockService();
    service.updateMyRestaurant.mockResolvedValue({ _id: 'restaurant-a', name: 'Nouveau nom' });
    const controller = new RestaurantsController(service as never);
    const req = {
      context: { tenantId: 'restaurant-a' },
      body: { name: 'Nouveau nom' },
    } as unknown as Request;
    const res = createMockRes();

    await controller.updateMe(req, res);

    expect(service.updateMyRestaurant).toHaveBeenCalledWith('restaurant-a', {
      name: 'Nouveau nom',
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejette (RESTAURANT_INVALID_PAYLOAD) un openingHours mal formé', async () => {
    const service = createMockService();
    const controller = new RestaurantsController(service as never);
    const req = {
      context: { tenantId: 'restaurant-a' },
      body: { openingHours: [{ day: 'monday', open: '9h', close: '18:00' }] },
    } as unknown as Request;
    const res = createMockRes();

    await expect(controller.updateMe(req, res)).rejects.toMatchObject({
      code: 'RESTAURANT_INVALID_PAYLOAD',
      httpStatus: 400,
    });
    expect(service.updateMyRestaurant).not.toHaveBeenCalled();
  });
});

describe('RestaurantsController#updateMeSettings', () => {
  it('valide le payload, appelle le service, répond 200', async () => {
    const service = createMockService();
    service.updateMyRestaurantSettings.mockResolvedValue({ _id: 'restaurant-a', currency: 'EUR' });
    const controller = new RestaurantsController(service as never);
    const req = {
      context: { tenantId: 'restaurant-a' },
      body: { currency: 'eur' },
    } as unknown as Request;
    const res = createMockRes();

    await controller.updateMeSettings(req, res);

    expect(service.updateMyRestaurantSettings).toHaveBeenCalledWith('restaurant-a', {
      currency: 'EUR',
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
