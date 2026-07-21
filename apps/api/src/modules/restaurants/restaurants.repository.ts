import type { ClientSession } from 'mongoose';

import { RestaurantModel } from '../../database/models/restaurant.model.js';
import type {
  CreateRestaurantDto,
  UpdateRestaurantDto,
  UpdateRestaurantSettingsDto,
} from './restaurants.validators.js';

export type CreateRestaurantInput = Omit<CreateRestaurantDto, 'ownerId'> & { slug: string };

/**
 * `restaurants` n'a pas de `tenantId` (il **est** le tenant, `_id` sert de
 * `tenantId` partout ailleurs, doc 06 §6.2) — ce repository n'étend donc
 * pas `BaseRepository` (doc 06 §6.4), même raisonnement que
 * `UsersRepository`. `findById`/`updateById` filtrent `deletedAt: null` :
 * un tenant soft-supprimé (doc 06 §6.7, purge différée) ne doit plus être
 * lisible/modifiable via `/restaurants/me`.
 */
export class RestaurantsRepository {
  async create(input: CreateRestaurantInput, session?: ClientSession) {
    // Forme tableau requise pour que `{session}` soit interprété comme des
    // options par Mongoose (pas un second document) — garantit un tableau
    // à exactement un élément en retour, `noUncheckedIndexedAccess`
    // signale néanmoins `doc: T | undefined` sans l'assertion.
    const [doc] = await RestaurantModel.create([input], { session });
    return doc as NonNullable<typeof doc>;
  }

  findById(id: string) {
    return RestaurantModel.findOne({ _id: id, deletedAt: null });
  }

  findBySlug(slug: string) {
    return RestaurantModel.findOne({ slug });
  }

  updateById(id: string, update: UpdateRestaurantDto | UpdateRestaurantSettingsDto) {
    return RestaurantModel.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { $set: update },
      { returnDocument: 'after' },
    );
  }
}
