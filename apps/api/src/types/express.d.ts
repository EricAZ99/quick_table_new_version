import type { Logger } from 'pino';

// Types globaux backend (doc 03 §3.3) : augmentation d'Express.Request.
declare global {
  namespace Express {
    interface Request {
      /** Généré par `correlationId.middleware.ts`, propagé en `X-Correlation-Id` (doc 12 §12.8). */
      correlationId: string;
      /** Logger enfant lié à `correlationId` — tout log de la requête devrait passer par `req.log`. */
      log: Logger;
    }
  }
}

export {};
