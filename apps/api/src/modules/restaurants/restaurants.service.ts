import mongoose from 'mongoose';

import type { RestaurantDocument } from '../../database/models/restaurant.model.js';
import { NotFoundError } from '../../shared/errors/index.js';
import type { MembershipsRepository } from '../employees/memberships.repository.js';
import type { UsersRepository } from '../users/index.js';
import type { RestaurantsRepository } from './restaurants.repository.js';
import type {
  CreateRestaurantDto,
  UpdateRestaurantDto,
  UpdateRestaurantSettingsDto,
} from './restaurants.validators.js';

// Plage Unicode des signes diacritiques combinants (U+0300-U+036F), retirés
// après normalize('NFD') pour produire un slug ASCII.
const COMBINING_DIACRITICS_PATTERN = /[̀-ͯ]/g;

function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_PATTERN, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'restaurant';
}

/**
 * Provisioning **réduit** de doc 06 §6.7 (décision validée avec toi) :
 * `restaurants` + premier `membership` `restaurant_owner`, dans une vraie
 * transaction MongoDB multi-documents (pour ne jamais laisser un tenant
 * "à moitié créé" si l'une des deux écritures échoue) — mais **sans**
 * l'étape `subscriptions` (Feature 9.1, pas commencée) ni les données de
 * référence (salle par défaut, catégories, Feature 2.3/3.2, pas
 * commencées). `ownerId` référence un utilisateur déjà existant : aucune
 * création de compte inline ici (pas d'endpoint public d'inscription
 * self-service dans la surface d'API doc 09 à ce jour).
 */
export class RestaurantsService {
  constructor(
    private readonly restaurantsRepository: RestaurantsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly membershipsRepository: MembershipsRepository,
  ) {}

  async createRestaurant(dto: CreateRestaurantDto): Promise<RestaurantDocument> {
    const owner = await this.usersRepository.findById(dto.ownerId);
    if (!owner) {
      throw new NotFoundError(
        'RESTAURANT_OWNER_NOT_FOUND',
        "L'utilisateur propriétaire est introuvable.",
      );
    }

    const { ownerId, ...restaurantInput } = dto;
    const slug = await this.generateUniqueSlug(dto.name);

    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const restaurant = await this.restaurantsRepository.create(
          { ...restaurantInput, slug },
          session,
        );
        await this.membershipsRepository.create(
          { userId: ownerId, role: 'restaurant_owner' },
          { tenantId: restaurant._id.toString() },
          session,
        );
        return restaurant;
      });
    } finally {
      await session.endSession();
    }
  }

  getMyRestaurant(tenantId: string) {
    return this.restaurantsRepository.findById(tenantId);
  }

  async updateMyRestaurant(tenantId: string, dto: UpdateRestaurantDto) {
    const restaurant = await this.restaurantsRepository.updateById(tenantId, dto);
    if (!restaurant) {
      throw new NotFoundError('RESTAURANT_NOT_FOUND', 'Restaurant introuvable.');
    }
    return restaurant;
  }

  async updateMyRestaurantSettings(tenantId: string, dto: UpdateRestaurantSettingsDto) {
    const restaurant = await this.restaurantsRepository.updateById(tenantId, dto);
    if (!restaurant) {
      throw new NotFoundError('RESTAURANT_NOT_FOUND', 'Restaurant introuvable.');
    }
    return restaurant;
  }

  /** Suffixe numérique incrémental en cas de collision (doc 05 : slug unique). */
  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    let candidate = base;
    let suffix = 1;
    // Boucle séquentielle intentionnelle : collisions attendues rares, bornée par le nombre de doublons réels.
    while (await this.restaurantsRepository.findBySlug(candidate)) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }
}
