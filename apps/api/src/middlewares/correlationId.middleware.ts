import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { logger } from '../logger/logger.js';

export const CORRELATION_ID_HEADER = 'X-Correlation-Id';

/**
 * Premier middleware de la chaîne transverse (doc 12 §12.4) : génère un
 * identifiant de corrélation par requête, le propage dans la réponse
 * (`X-Correlation-Id`, doc 12 §12.8 — permet au support client de relier un
 * ticket utilisateur à une trace serveur précise), et attache un logger
 * enfant (`req.log`) déjà lié à cet identifiant pour le reste de la chaîne.
 *
 * Volontairement seul dans `app.ts` pour ce ticket : helmet/cors/sanitize/
 * rate-limit (qui précèdent correlationId dans l'ordre documenté) et
 * auth/tenant/rbac/validate (qui le suivent) arrivent avec des tickets
 * séparés de la Feature 0.3/Epic 1 — pas encore de logique à orchestrer.
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = randomUUID();

  req.correlationId = correlationId;
  req.log = logger.child({ correlationId });
  res.setHeader(CORRELATION_ID_HEADER, correlationId);

  next();
}
