import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock partiel : `restaurants.service.ts` importe aussi `CountryDefaultModel`
// (`database/models/countryDefault.model.ts`), qui appelle `new Schema(...)`
// à l'import — un mock complet de `mongoose` casserait ce module. Seul
// `startSession` (méthode statique du default export) est remplacé.
vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongoose')>();
  return { ...actual, default: { ...actual.default, startSession: vi.fn() } };
});

import mongoose from 'mongoose';
import { RestaurantsService } from '../restaurants.service.js';
import type { CreateRestaurantDto } from '../restaurants.validators.js';

vi.mock('../../../database/models/countryDefault.model.js', () => ({
  CountryDefaultModel: { findOne: vi.fn() },
}));
import { CountryDefaultModel } from '../../../database/models/countryDefault.model.js';

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

  describe('dérivation locale/timezone/currency (doc 09 §9.3, doc 35 §35.3)', () => {
    it("dérive les 3 champs depuis countryDefaults quand aucun n'est fourni", async () => {
      const { service, restaurantsRepository, usersRepository } = setup();
      usersRepository.findById.mockResolvedValue({ _id: 'user-a' });
      restaurantsRepository.findBySlug.mockResolvedValue(null);
      restaurantsRepository.create.mockResolvedValue({ _id: 'restaurant-a' });
      vi.mocked(mongoose.startSession).mockResolvedValue(createFakeSession() as never);
      vi.mocked(CountryDefaultModel.findOne).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          countryCode: 'BJ',
          defaultLocale: 'fr',
          timezoneDefault: 'Africa/Porto-Novo',
          currency: 'XOF',
        }),
      } as never);
      const dtoWithoutDerived: Partial<CreateRestaurantDto> = { ...VALID_CREATE_DTO };
      delete dtoWithoutDerived.locale;
      delete dtoWithoutDerived.timezone;
      delete dtoWithoutDerived.currency;

      await service.createRestaurant(dtoWithoutDerived as CreateRestaurantDto);

      expect(CountryDefaultModel.findOne).toHaveBeenCalledWith({ countryCode: 'BJ' });
      expect(restaurantsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          locale: 'fr',
          timezone: 'Africa/Porto-Novo',
          currency: 'XOF',
        }),
        expect.anything(),
      );
    });

    it('une valeur explicite prime toujours sur countryDefaults (surcharge partielle)', async () => {
      const { service, restaurantsRepository, usersRepository } = setup();
      usersRepository.findById.mockResolvedValue({ _id: 'user-a' });
      restaurantsRepository.findBySlug.mockResolvedValue(null);
      restaurantsRepository.create.mockResolvedValue({ _id: 'restaurant-a' });
      vi.mocked(mongoose.startSession).mockResolvedValue(createFakeSession() as never);
      vi.mocked(CountryDefaultModel.findOne).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          countryCode: 'BJ',
          defaultLocale: 'fr',
          timezoneDefault: 'Africa/Porto-Novo',
          currency: 'XOF',
        }),
      } as never);
      const dtoWithCurrencyOverride: Partial<CreateRestaurantDto> = { ...VALID_CREATE_DTO };
      delete dtoWithCurrencyOverride.timezone;
      delete dtoWithCurrencyOverride.currency;

      await service.createRestaurant({
        ...(dtoWithCurrencyOverride as CreateRestaurantDto),
        currency: 'EUR',
      });

      expect(restaurantsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ locale: 'fr', timezone: 'Africa/Porto-Novo', currency: 'EUR' }),
        expect.anything(),
      );
    });

    it('ne consulte jamais countryDefaults si les 3 champs sont déjà fournis', async () => {
      const { service, restaurantsRepository, usersRepository } = setup();
      usersRepository.findById.mockResolvedValue({ _id: 'user-a' });
      restaurantsRepository.findBySlug.mockResolvedValue(null);
      restaurantsRepository.create.mockResolvedValue({ _id: 'restaurant-a' });
      vi.mocked(mongoose.startSession).mockResolvedValue(createFakeSession() as never);

      await service.createRestaurant(VALID_CREATE_DTO);

      expect(CountryDefaultModel.findOne).not.toHaveBeenCalled();
    });

    it("rejette (422 RESTAURANT_COUNTRY_DEFAULTS_MISSING) si countryDefaults n'a rien pour ce pays et qu'un champ manque", async () => {
      const { service, usersRepository } = setup();
      usersRepository.findById.mockResolvedValue({ _id: 'user-a' });
      vi.mocked(CountryDefaultModel.findOne).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      } as never);
      const dtoWithoutLocale: Partial<CreateRestaurantDto> = { ...VALID_CREATE_DTO };
      delete dtoWithoutLocale.locale;

      await expect(
        service.createRestaurant(dtoWithoutLocale as CreateRestaurantDto),
      ).rejects.toMatchObject({
        code: 'RESTAURANT_COUNTRY_DEFAULTS_MISSING',
        httpStatus: 422,
      });
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
