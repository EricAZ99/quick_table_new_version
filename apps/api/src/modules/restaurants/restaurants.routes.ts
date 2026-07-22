import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import { resolveTenant } from '../../middlewares/tenant.middleware.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { MembershipsRepository } from '../employees/index.js';
import { UsersRepository } from '../users/index.js';
import { RestaurantsController } from './restaurants.controller.js';
import { RestaurantsRepository } from './restaurants.repository.js';
import { RestaurantsService } from './restaurants.service.js';

const service = new RestaurantsService(
  new RestaurantsRepository(),
  new UsersRepository(),
  new MembershipsRepository(),
);
const controller = new RestaurantsController(service);

export const restaurantsRouter = Router();

// Public, non authentifié (doc 09 §9.4) — appelé depuis l'écran d'inscription
// avant qu'un tenant/JWT n'existe. Rate limiting transverse (doc 12 §12.4)
// pas encore implémenté (ticket séparé, voir app.ts) : à appliquer ici en
// priorité dès qu'il existe, cet endpoint public tiers-dépendant y étant
// particulièrement exposé.
restaurantsRouter.get('/detect-location', asyncHandler(controller.detectLocation));

restaurantsRouter.get(
  '/me',
  requireAuth,
  resolveTenant,
  requirePermission('restaurants:read'),
  asyncHandler(controller.getMe),
);

restaurantsRouter.patch(
  '/me',
  requireAuth,
  resolveTenant,
  requirePermission('restaurants:update'),
  asyncHandler(controller.updateMe),
);

restaurantsRouter.patch(
  '/me/settings',
  requireAuth,
  resolveTenant,
  requirePermission('restaurants:manage_settings'),
  asyncHandler(controller.updateMeSettings),
);

/**
 * Routes plateforme (doc 09 §9.3, `platform:manage_restaurants`) — router
 * séparé, monté sur un préfixe d'URL distinct (`/api/v1/platform/restaurants`,
 * voir `app.ts`), jamais mélangé avec les routes tenant `/restaurants/*`
 * ci-dessus, pour que la frontière super_admin/tenant reste visible dans
 * la structure des routes elle-même, pas seulement dans les permissions.
 */
export const platformRestaurantsRouter = Router();

platformRestaurantsRouter.post(
  '/',
  requireAuth,
  resolveTenant,
  requirePermission('platform:manage_restaurants'),
  asyncHandler(controller.create),
);
