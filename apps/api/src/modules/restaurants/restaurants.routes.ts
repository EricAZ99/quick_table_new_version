import { Router } from 'express';

import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { RestaurantsController } from './restaurants.controller.js';

const controller = new RestaurantsController();

export const restaurantsRouter = Router();

// Public, non authentifié (doc 09 §9.4) — appelé depuis l'écran d'inscription
// avant qu'un tenant/JWT n'existe. Rate limiting transverse (doc 12 §12.4)
// pas encore implémenté (ticket séparé, voir app.ts) : à appliquer ici en
// priorité dès qu'il existe, cet endpoint public tiers-dépendant y étant
// particulièrement exposé.
restaurantsRouter.get('/detect-location', asyncHandler(controller.detectLocation));
