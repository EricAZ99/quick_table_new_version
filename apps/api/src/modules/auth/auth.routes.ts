import { Router, type Request, type Response } from 'express';

import { getEnv } from '../../config/env.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { UsersRepository } from '../users/index.js';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { loginRateLimiter } from './login-rate-limit.js';

/**
 * Construction paresseuse, mémoïsée : `getEnv()` (fail-fast sur `.env`
 * réel) ne doit s'exécuter qu'à la première requête réelle vers
 * `/auth/login`, jamais à l'import de ce module — sinon importer `app.ts`
 * casserait tous les tests qui construisent `createApp()` sans viser cette
 * route (doc 14 §14.6, même principe que `hello-world.integration.spec.ts`).
 */
let cachedController: AuthController | undefined;
function getController(): AuthController {
  if (!cachedController) {
    const env = getEnv();
    const service = new AuthService(new UsersRepository(), new AuthRepository(), env.JWT_SECRET);
    cachedController = new AuthController(service, env.NODE_ENV === 'production');
  }
  return cachedController;
}

export const authRouter = Router();

authRouter.post(
  '/login',
  loginRateLimiter,
  asyncHandler((req: Request, res: Response) => getController().login(req, res)),
);

// Pas de rate limiting dédié ici (doc 13 §13.2 n'en documente que pour
// /auth/login et /auth/forgot-password) : le refresh token lui-même est
// haute entropie et à usage unique (rotation), la surface de brute force
// est différente d'un mot de passe.
authRouter.post(
  '/refresh',
  asyncHandler((req: Request, res: Response) => getController().refresh(req, res)),
);
