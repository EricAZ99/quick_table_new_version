import type { Request, Response } from 'express';

import { NotFoundError, ValidationError } from '../../shared/errors/index.js';
import { normalizeClientIp } from '../../shared/utils/normalizeClientIp.js';
import { requireTenantContext } from '../../shared/utils/requireTenantContext.js';
import { detectLocationFromIp } from './geolocation.service.js';
import type { RestaurantsService } from './restaurants.service.js';
import {
  createRestaurantSchema,
  updateRestaurantSchema,
  updateRestaurantSettingsSchema,
} from './restaurants.validators.js';

/** Controller (doc 12 §12.2) : HTTP <-> DTO, un seul service appelé, réponse standard (doc 09 §9.1). */
export class RestaurantsController {
  constructor(private readonly service: RestaurantsService) {}

  /** Public, non authentifié (doc 09 §9.4) — appelé depuis l'écran d'inscription avant qu'un tenant/JWT n'existe. */
  detectLocation = async (req: Request, res: Response): Promise<void> => {
    const clientIp = normalizeClientIp(req.ip);
    const location = clientIp
      ? await detectLocationFromIp(clientIp)
      : { country: null, city: null };

    res.status(200).json({ success: true, data: location });
  };

  /** `POST /platform/restaurants` (doc 09 §9.3, `platform:manage_restaurants`) — provisioning réduit, voir `restaurants.service.ts`. */
  create = async (req: Request, res: Response): Promise<void> => {
    const parsed = createRestaurantSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        'RESTAURANT_INVALID_PAYLOAD',
        'Payload invalide.',
        parsed.error.issues,
      );
    }

    const restaurant = await this.service.createRestaurant(parsed.data);
    res.status(201).json({ success: true, data: restaurant });
  };

  /** `GET /restaurants/me` (doc 09 §9.4, `restaurants:read`). */
  getMe = async (req: Request, res: Response): Promise<void> => {
    const tenantId = requireTenantContext(req);
    const restaurant = await this.service.getMyRestaurant(tenantId);
    if (!restaurant) {
      throw new NotFoundError('RESTAURANT_NOT_FOUND', 'Restaurant introuvable.');
    }
    res.status(200).json({ success: true, data: restaurant });
  };

  /** `PATCH /restaurants/me` (doc 09 §9.4, `restaurants:update`) — nom, horaires, logo, coordonnées. */
  updateMe = async (req: Request, res: Response): Promise<void> => {
    const tenantId = requireTenantContext(req);
    const parsed = updateRestaurantSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        'RESTAURANT_INVALID_PAYLOAD',
        'Payload invalide.',
        parsed.error.issues,
      );
    }

    const restaurant = await this.service.updateMyRestaurant(tenantId, parsed.data);
    res.status(200).json({ success: true, data: restaurant });
  };

  /** `PATCH /restaurants/me/settings` (doc 09 §9.4, `restaurants:manage_settings`) — paramètres avancés. */
  updateMeSettings = async (req: Request, res: Response): Promise<void> => {
    const tenantId = requireTenantContext(req);
    const parsed = updateRestaurantSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        'RESTAURANT_INVALID_PAYLOAD',
        'Payload invalide.',
        parsed.error.issues,
      );
    }

    const restaurant = await this.service.updateMyRestaurantSettings(tenantId, parsed.data);
    res.status(200).json({ success: true, data: restaurant });
  };
}
