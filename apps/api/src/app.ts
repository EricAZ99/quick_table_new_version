import express, { type Express } from 'express';

import { correlationIdMiddleware } from './middlewares/correlationId.middleware.js';

/**
 * Construit l'instance Express de l'API QuickTable.
 *
 * Chaîne de middlewares introduite module par module à partir de la Feature
 * 0.3 (doc 12 §12.4 : helmet, cors, sanitize, rate-limit, correlationId,
 * auth, tenant, rbac, validate). `correlationId` est le seul en place pour
 * l'instant — les middlewares qui doivent le précéder (helmet/cors/sanitize/
 * rate-limit) et ceux qui le suivent (auth/tenant/rbac/validate) arrivent
 * avec des tickets séparés ; les insérer respectivement avant/après cette
 * ligne pour respecter l'ordre documenté.
 */
export function createApp(): Express {
  const app = express();
  app.use(correlationIdMiddleware);
  return app;
}
