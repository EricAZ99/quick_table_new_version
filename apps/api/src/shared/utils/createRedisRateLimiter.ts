import rateLimit, { type Logger } from 'express-rate-limit';
import type { Request, RequestHandler, Response } from 'express';
import { RedisStore } from 'rate-limit-redis';

import { getRedisClient } from '../../config/redis.js';
import { logger } from '../../logger/logger.js';
import { translateErrorMessage } from '../../locales/index.js';
import { DEFAULT_LOCALE } from '../../middlewares/i18n.middleware.js';

/**
 * Adapte notre logger Pino à l'interface `Logger` attendue par
 * `express-rate-limit` (`(error, message?) => void`, même ordre d'arguments
 * que `logger.warn(err, message)` — compatible tel quel).
 */
const rateLimiterLogger: Logger = {
  warn: (error, message) => logger.warn({ err: error }, message ?? 'express-rate-limit warning'),
  error: (error, message) => logger.warn({ err: error }, message ?? 'express-rate-limit error'),
};

export interface RedisRateLimiterOptions {
  windowMs: number;
  limit: number;
  /** Préfixe des clés Redis (`rate-limit-redis`) — un par limiteur, jamais partagé. */
  prefix: string;
  keyGenerator: (req: Request) => string;
  /** Code d'erreur i18n (doc 09 §9.1) renvoyé en 429 quand la limite est atteinte. */
  errorCode: string;
  defaultMessage: string;
}

/**
 * Factory partagée (doc 13 §13.2 : plusieurs limiteurs Redis distincts —
 * `/auth/login`, `/auth/forgot-password`, ...) — extraite après un premier
 * doublon quasi identique (`login-rate-limit.ts`), pour ne pas répliquer
 * une seconde fois une logique déjà subtile :
 *
 * - Construction **paresseuse et mémoïsée** (store + middleware) :
 *   `RedisStore` appelle `sendCommand` dès sa construction (chargement des
 *   scripts Lua), donc `rateLimit({...})` ne doit s'exécuter qu'à la
 *   première requête réelle, jamais à l'import du module — sinon importer
 *   `app.ts` échouerait (Redis pas encore connecté) pour tout test qui ne
 *   vise même pas cette route (doc 14 §14.6).
 * - `validate: { creationStack: false }` : la validation native de la
 *   librairie suppose `rateLimit()` toujours appelé de façon eager au
 *   démarrage — ici la construction paresseuse est mémoïsée (une seule
 *   fois), pas le bug qu'elle détecte (recréer l'instance à chaque
 *   requête, ce qui repartirait de zéro et annulerait le verrouillage).
 * - `passOnStoreError: true` : une panne/latence Redis transitoire ne doit
 *   jamais faire échouer la route qu'elle protège (`/auth/login`,
 *   `/auth/forgot-password`, ...) — même philosophie best-effort que
 *   `rbacPermissionsCache.ts` (doc 26 §26.6, "Redis n'est jamais une
 *   source de vérité"), pas suivie ici avant ce correctif : une erreur du
 *   store Redis (ex. latence/coupure Upstash) remontait auparavant en 500
 *   sur la route protégée au lieu de simplement laisser passer la requête
 *   sans limitation pour ce coup-ci. `resetKey` (appelé après un login
 *   réussi) suit la même logique — jamais bloquant.
 */
export function createRedisRateLimiter(options: RedisRateLimiterOptions): {
  middleware: RequestHandler;
  resetKey: (req: Request) => Promise<void>;
} {
  let cachedStore: RedisStore | undefined;
  let cachedLimiter: RequestHandler | undefined;

  function getStore(): RedisStore {
    cachedStore ??= new RedisStore({
      sendCommand: (...args: string[]) => getRedisClient().sendCommand(args),
      prefix: options.prefix,
    });
    return cachedStore;
  }

  function getLimiter(): RequestHandler {
    if (!cachedLimiter) {
      cachedLimiter = rateLimit({
        windowMs: options.windowMs,
        limit: options.limit,
        standardHeaders: true,
        legacyHeaders: false,
        store: getStore(),
        keyGenerator: options.keyGenerator,
        validate: { creationStack: false },
        passOnStoreError: true,
        logger: rateLimiterLogger,
        handler: (req: Request, res: Response) => {
          const locale = req.locale ?? DEFAULT_LOCALE;
          const message = translateErrorMessage(options.errorCode, locale, options.defaultMessage);
          res.status(429).json({
            success: false,
            error: { code: options.errorCode, message, details: [] },
          });
        },
      });
    }
    return cachedLimiter;
  }

  return {
    middleware: (req, res, next) => {
      getLimiter()(req, res, next);
    },
    resetKey: async (req: Request) => {
      try {
        await getStore().resetKey(options.keyGenerator(req));
      } catch (error) {
        logger.warn(
          { err: error, prefix: options.prefix },
          'réinitialisation du rate limiter Redis échouée, ignorée (best-effort)',
        );
      }
    },
  };
}
