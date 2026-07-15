import type { NextFunction, Request, Response } from 'express';

import { translateErrorMessage } from '../locales/index.js';
import { AppError } from '../shared/errors/index.js';
import { DEFAULT_LOCALE } from '../middlewares/i18n.middleware.js';

interface ErrorResponseBody {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
}

/**
 * Dernier middleware de la chaîne (doc 12 §12.3/§12.4) — seul endroit qui
 * traduit une erreur en réponse HTTP JSON standard (doc 09 §9.1). Toute
 * erreur, typée ou non, est journalisée en `error` avec la stacktrace
 * complète côté serveur (`req.log`, déjà lié au `correlationId` de la
 * requête) ; seul un message sanitisé part au client — jamais de détail
 * technique pour une erreur non typée.
 *
 * L'alerting Sentry pour les erreurs non typées (doc 12 §12.3, doc 25
 * §25.1bis) arrivera avec l'intégration du SDK, pas encore installée.
 */
export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  // `_next` : signature à 4 paramètres requise par Express pour reconnaître
  // un error handler (`_` évite les erreurs "paramètre inutilisé" d'ESLint
  // et de TypeScript `noUnusedParameters`).
  _next: NextFunction,
): void {
  req.log.error({ err }, 'Erreur lors du traitement de la requête');

  // `req.locale` peut être absent si l'erreur survient avant
  // `i18nMiddleware` dans la chaîne (ex. `express.json()` sur un payload
  // malformé) — repli explicite sur la locale par défaut.
  const locale = req.locale ?? DEFAULT_LOCALE;

  if (err instanceof AppError) {
    const body: ErrorResponseBody = {
      success: false,
      error: {
        code: err.code,
        message: translateErrorMessage(err.code, locale, err.message),
        details: err.details,
      },
    };
    res.status(err.httpStatus).json(body);
    return;
  }

  const body: ErrorResponseBody = {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: translateErrorMessage(
        'INTERNAL_SERVER_ERROR',
        locale,
        'Une erreur inattendue est survenue.',
      ),
      details: [],
    },
  };
  res.status(500).json(body);
}
