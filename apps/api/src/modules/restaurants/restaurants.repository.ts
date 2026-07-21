import type { ClientSession } from 'mongoose';

import { RestaurantModel } from '../../database/models/restaurant.model.js';
import type { SupportedLocale } from '../../middlewares/i18n.middleware.js';
import type {
  CreateRestaurantDto,
  UpdateRestaurantDto,
  UpdateRestaurantSettingsDto,
} from './restaurants.validators.js';

/**
 * `locale`/`timezone`/`currency` sont optionnels sur `CreateRestaurantDto`
 * (doc 09 §9.3, dérivation automatique depuis `countryDefaults`) mais
 * redeviennent obligatoires ici : par construction, `RestaurantsService`
 * a déjà résolu les trois avant d'appeler `create` (explicites ou
 * dérivés) — le schéma Mongoose (`restaurant.model.ts`) les exige.
 */
export type CreateRestaurantInput = Omit<
  CreateRestaurantDto,
  'ownerId' | 'locale' | 'timezone' | 'currency'
> & {
  slug: string;
  locale: SupportedLocale;
  timezone: string;
  currency: string;
};

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
