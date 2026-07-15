import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Enveloppe un handler async pour Express 4 (doc 12 §12.2/§12.3).
 *
 * Express 4 ne rattrape pas un rejet de promesse dans un handler de route
 * — sans ce wrapper, une erreur inattendue dans un `async (req, res) => {}`
 * devient un rejet non géré silencieux au lieu de passer par
 * `error-handler.middleware.ts`. Pattern à utiliser pour toute action de
 * controller (doc 12 §12.2) — trouvé en écrivant `/health/ready`, appliqué
 * ici comme utilitaire partagé plutôt que répété à chaque module.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
