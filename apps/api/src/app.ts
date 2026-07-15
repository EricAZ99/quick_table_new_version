import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';

import { healthRouter } from './health/health.routes.js';
import { authRouter } from './modules/auth/index.js';
import { helloWorldRouter } from './modules/hello-world/index.js';
import { restaurantsRouter } from './modules/restaurants/index.js';
import { correlationIdMiddleware } from './middlewares/correlationId.middleware.js';
import { errorHandlerMiddleware } from './middlewares/error-handler.middleware.js';
import { i18nMiddleware } from './middlewares/i18n.middleware.js';

/**
 * Construit l'instance Express de l'API QuickTable.
 *
 * Chaîne de middlewares introduite module par module à partir de la Feature
 * 0.3 (doc 12 §12.4 : helmet, cors, sanitize, rate-limit, correlationId,
 * auth, tenant, rbac, validate). `express.json()` arrive avec ce ticket
 * (module de référence, premier POST de l'API) — respecte sa place
 * documentée avant `correlationId` ; `helmet`/`cors`/`sanitize`/`rate-limit`
 * (qui précèdent aussi `express.json()`) et `auth`/`tenant`/`rbac`/`validate`
 * (qui suivent) arrivent avec des tickets séparés. `errorHandler` doit
 * rester enregistré en dernier, après toutes les routes (doc 12 §12.3).
 *
 * `i18nMiddleware` (doc 35 §35.4) n'a pas de position documentée dans la
 * chaîne doc 12 §12.4 (antérieure au périmètre i18n) — placé juste après
 * `correlationId` et avant les routes : `errorHandlerMiddleware` et tout
 * futur handler ont ainsi `req.locale` disponible dès le premier
 * middleware métier. Choix explicite à valider si la chaîne documentée
 * est mise à jour.
 *
 * `/health/*` est monté sans auth/tenant/rbac : les probes de load
 * balancer et le monitoring d'uptime (doc 25 §25.5) n'ont pas de JWT.
 * `/api/v1/hello-world` est le module de référence (doc 15 §Phase 0) — un
 * tenant de démonstration fixé côté serveur en tient lieu tant que
 * `tenant.middleware.ts` n'existe pas (Epic 1), voir
 * `hello-world.controller.ts`.
 *
 * `trust proxy` activé : en production (Railway, derrière un reverse
 * proxy), `req.ip` renverrait sinon l'IP interne du proxy plutôt que celle
 * du client — première route à en dépendre réellement,
 * `GET /api/v1/restaurants/detect-location` (doc 09 §9.4, doc 35 §35.2),
 * explicitement **Public** (pas d'Auth/Tenant/RBAC, doc 09 §9.1).
 *
 * `cookieParser()` : lit le cookie `refreshToken` httpOnly posé par
 * `POST /auth/login` (doc 07 §7.1), nécessaire pour `POST /auth/refresh`
 * (doc 07 §7.4) qui le lit via `req.cookies`.
 */
export function createApp(): Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());
  app.use(correlationIdMiddleware);
  app.use(i18nMiddleware);

  app.use('/health', healthRouter);
  app.use('/api/v1/hello-world', helloWorldRouter);
  app.use('/api/v1/restaurants', restaurantsRouter);
  app.use('/api/v1/auth', authRouter);

  app.use(errorHandlerMiddleware);

  return app;
}
