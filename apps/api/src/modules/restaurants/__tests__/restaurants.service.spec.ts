import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('mongoose', () => ({
  default: { startSession: vi.fn() },
}));

import mongoose from 'mongoose';
import { RestaurantsService } from '../restaurants.service.js';
import type { CreateRestaurantDto } from '../restaurants.validators.js';

const VALID_CREATE_DTO: CreateRestaurantDto = {
  name: 'Chez Amara',
  country: 'BJ',
  countryDetectionMethod: 'manual',
  locale: 'fr',
  timezone: 'Africa/Porto-Novo',
  currency: 'XOF',
  ownerId: 'user-a',
};

function createFakeSession() {
  return {
    withTransaction: vi.fn((fn: () => Promise<unknown>) => fn()),
    endSession: vi.fn().mockResolvedValue(undefined),
  };
}

function setup() {
  const restaurantsRepository = {
    create: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    updateById: vi.fn(),
  };
  const usersRepository = { findById: vi.fn() };
  const membershipsRepository = { create: vi.fn() };
  const service = new RestaurantsService(
    restaurantsRepository,
    usersRepository as never,
    membershipsRepository as never,
  );
  return { service, restaurantsRepository, usersRepository, membershipsRepository };
}

describe('RestaurantsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createRestaurant', () => {
    it('rejette (RESTAURANT_OWNER_NOT_FOUND) si ownerId ne correspond à aucun utilisateur', async () => {
      const { service, usersRepository } = setup();
      usersRepository.findById.mockResolvedValue(null);

      await expect(service.createRestaurant(VALID_CREATE_DTO)).rejects.toMatchObject({
        code: 'RESTAURANT_OWNER_NOT_FOUND',
        httpStatus: 404,
      });
    });

    it('crée le restaurant et le membership owner dans une transaction, avec un slug dérivé du nom', async () => {
      const { service, restaurantsRepository, usersRepository, membershipsRepository } = setup();
      usersRepository.findById.mockResolvedValue({ _id: 'user-a' });
      restaurantsRepository.findBySlug.mockResolvedValue(null);
      restaurantsRepository.create.mockResolvedValue({ _id: 'restaurant-a' });
      const fakeSession = createFakeSession();
      vi.mocked(mongoose.startSession).mockResolvedValue(fakeSession as never);

      const result = await service.createRestaurant(VALID_CREATE_DTO);

      expect(restaurantsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'chez-amara' }),
        fakeSession,
      );
      expect(membershipsRepository.create).toHaveBeenCalledWith(
        { userId: 'user-a', role: 'restaurant_owner' },
        { tenantId: 'restaurant-a' },
        fakeSession,
      );
      expect(fakeSession.withTransaction).toHaveBeenCalledTimes(1);
      expect(fakeSession.endSession).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ _id: 'restaurant-a' });
    });

    it('ne transmet jamais ownerId au repository restaurants (jamais stocké sur le document restaurant)', async () => {
      const { service, restaurantsRepository, usersRepository } = setup();
      usersRepository.findById.mockResolvedValue({ _id: 'user-a' });
      restaurantsRepository.findBySlug.mockResolvedValue(null);
      restaurantsRepository.create.mockResolvedValue({ _id: 'restaurant-a' });
      vi.mocked(mongoose.startSession).mockResolvedValue(createFakeSession() as never);

      await service.createRestaurant(VALID_CREATE_DTO);

      const [input] = restaurantsRepository.create.mock.calls[0] as [Record<string, unknown>];
      expect(input).not.toHaveProperty('ownerId');
    });

    it('ajoute un suffixe numérique au slug en cas de collision', async () => {
      const { service, restaurantsRepository, usersRepository } = setup();
      usersRepository.findById.mockResolvedValue({ _id: 'user-a' });
      restaurantsRepository.findBySlug
        .mockResolvedValueOnce({ _id: 'existing' })
        .mockResolvedValueOnce(null);
      restaurantsRepository.create.mockResolvedValue({ _id: 'restaurant-a' });
      vi.mocked(mongoose.startSession).mockResolvedValue(createFakeSession() as never);

      await service.createRestaurant(VALID_CREATE_DTO);

      expect(restaurantsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'chez-amara-2' }),
        expect.anything(),
      );
    });

    it('endSession() est appelé même si la transaction échoue', async () => {
      const { service, usersRepository } = setup();
      usersRepository.findById.mockResolvedValue({ _id: 'user-a' });
      const fakeSession = createFakeSession();
      fakeSession.withTransaction.mockRejectedValue(new Error('transaction abort'));
      vi.mocked(mongoose.startSession).mockResolvedValue(fakeSession as never);

      await expect(service.createRestaurant(VALID_CREATE_DTO)).rejects.toThrow('transaction abort');
      expect(fakeSession.endSession).toHaveBeenCalledTimes(1);
    });
  });

  describe('getMyRestaurant', () => {
    it('délègue à restaurantsRepository.findById', async () => {
      const { service, restaurantsRepository } = setup();
      restaurantsRepository.findById.mockResolvedValue({ _id: 'restaurant-a' });

      const result = await service.getMyRestaurant('restaurant-a');

      expect(restaurantsRepository.findById).toHaveBeenCalledWith('restaurant-a');
      expect(result).toEqual({ _id: 'restaurant-a' });
    });
  });

  describe('updateMyRestaurant', () => {
    it('rejette (RESTAURANT_NOT_FOUND) si le restaurant est introuvable', async () => {
      const { service, restaurantsRepository } = setup();
      restaurantsRepository.updateById.mockResolvedValue(null);

      await expect(service.updateMyRestaurant('restaurant-a', { name: 'X' })).rejects.toMatchObject(
        {
          code: 'RESTAURANT_NOT_FOUND',
          httpStatus: 404,
        },
      );
    });

    it('retourne le restaurant mis à jour', async () => {
      const { service, restaurantsRepository } = setup();
      restaurantsRepository.updateById.mockResolvedValue({ _id: 'restaurant-a', name: 'X' });

      const result = await service.updateMyRestaurant('restaurant-a', { name: 'X' });

      expect(result).toEqual({ _id: 'restaurant-a', name: 'X' });
    });
  });

  describe('updateMyRestaurantSettings', () => {
    it('rejette (RESTAURANT_NOT_FOUND) si le restaurant est introuvable', async () => {
      const { service, restaurantsRepository } = setup();
      restaurantsRepository.updateById.mockResolvedValue(null);

      await expect(service.updateMyRestaurantSettings('restaurant-a', {})).rejects.toMatchObject({
        code: 'RESTAURANT_NOT_FOUND',
        httpStatus: 404,
      });
    });

    it('retourne le restaurant mis à jour', async () => {
      const { service, restaurantsRepository } = setup();
      restaurantsRepository.updateById.mockResolvedValue({ _id: 'restaurant-a', currency: 'EUR' });

      const result = await service.updateMyRestaurantSettings('restaurant-a', { currency: 'EUR' });

      expect(result).toEqual({ _id: 'restaurant-a', currency: 'EUR' });
    });
  });
});
