import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../database/models/restaurant.model.js', () => ({
  RestaurantModel: { create: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}));

import { RestaurantModel } from '../../../database/models/restaurant.model.js';
import { RestaurantsRepository } from '../restaurants.repository.js';

describe('RestaurantsRepository', () => {
  it('create() insère en forme tableau (pour que session soit interprété comme des options) et retourne le document créé', async () => {
    vi.mocked(RestaurantModel.create).mockResolvedValue([{ _id: 'restaurant-a' }] as never);
    const repository = new RestaurantsRepository();

    const doc = await repository.create({
      name: 'Chez Amara',
      slug: 'chez-amara',
      country: 'BJ',
      countryDetectionMethod: 'manual',
      locale: 'fr',
      timezone: 'Africa/Porto-Novo',
      currency: 'XOF',
    });

    expect(RestaurantModel.create).toHaveBeenCalledWith(
      [expect.objectContaining({ slug: 'chez-amara' })],
      { session: undefined },
    );
    expect(doc).toEqual({ _id: 'restaurant-a' });
  });

  it('findById() filtre deletedAt: null (un tenant soft-supprimé ne doit plus être lisible)', () => {
    const repository = new RestaurantsRepository();

    repository.findById('restaurant-a');

    expect(RestaurantModel.findOne).toHaveBeenCalledWith({ _id: 'restaurant-a', deletedAt: null });
  });

  it('findBySlug() cherche par slug exact', () => {
    const repository = new RestaurantsRepository();

    repository.findBySlug('chez-amara');

    expect(RestaurantModel.findOne).toHaveBeenCalledWith({ slug: 'chez-amara' });
  });

  it("updateById() filtre deletedAt: null et retourne le document mis à jour ($set, returnDocument:'after')", () => {
    const repository = new RestaurantsRepository();

    repository.updateById('restaurant-a', { name: 'Nouveau nom' });

    expect(RestaurantModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'restaurant-a', deletedAt: null },
      { $set: { name: 'Nouveau nom' } },
      { returnDocument: 'after' },
    );
  });
});
