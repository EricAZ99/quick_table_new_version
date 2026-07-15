import express, { type Express } from 'express';

import { healthRouter } from './health/health.routes.js';
import { correlationIdMiddleware } from './middlewares/correlationId.middleware.js';
import { errorHandlerMiddleware } from './middlewares/error-handler.middleware.js';

/**
 * Construit l'instance Express de l'API QuickTable.
 *
 * Chaîne de middlewares introduite module par module à partir de la Feature
 * 0.3 (doc 12 §12.4 : helmet, cors, sanitize, rate-limit, correlationId,
 * auth, tenant, rbac, validate). `correlationId` doit précéder toute
 * logique métier (déjà en place) ; `errorHandler` doit être enregistré en
 * dernier, après toutes les routes (doc 12 §12.3) — les middlewares qui
 * doivent s'intercaler (helmet/cors/sanitize/rate-limit avant
 * `correlationId`, auth/tenant/rbac/validate avant les futures routes
 * métier) arrivent avec des tickets séparés ; les insérer entre ces lignes.
 *
 * `/health/*` est monté sans auth/tenant/rbac : les probes de load
 * balancer et le monitoring d'uptime (doc 25 §25.5) n'ont pas de JWT.
 */
export function createApp(): Express {
  const app = express();
  app.use(correlationIdMiddleware);

  app.use('/health', healthRouter);

  app.use(errorHandlerMiddleware);

  return app;
}
