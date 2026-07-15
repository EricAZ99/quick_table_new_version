import express, { type Express } from 'express';

import { correlationIdMiddleware } from './middlewares/correlationId.middleware.js';
import { errorHandlerMiddleware } from './middlewares/error-handler.middleware.js';

/**
 * Construit l'instance Express de l'API QuickTable.
 *
 * Chaîne de middlewares introduite module par module à partir de la Feature
 * 0.3 (doc 12 §12.4 : helmet, cors, sanitize, rate-limit, correlationId,
 * auth, tenant, rbac, validate). `correlationId` doit précéder toute
 * logique métier (déjà en place) ; `errorHandler` doit être enregistré en
 * dernier, après toutes les routes (doc 12 §12.3) — les routes et les
 * middlewares qui doivent s'intercaler (helmet/cors/sanitize/rate-limit
 * avant `correlationId`, auth/tenant/rbac/validate après) arrivent avec des
 * tickets séparés ; les insérer entre ces deux lignes.
 */
export function createApp(): Express {
  const app = express();
  app.use(correlationIdMiddleware);

  app.use(errorHandlerMiddleware);

  return app;
}
