import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, RequestHandler, Response } from 'express';
import { RedisStore } from 'rate-limit-redis';

import { getRedisClient } from '../../config/redis.js';
import { translateErrorMessage } from '../../locales/index.js';
import { DEFAULT_LOCALE } from '../../middlewares/i18n.middleware.js';
import { normalizeClientIp } from '../../shared/utils/normalizeClientIp.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/**
 * Clé partagée entre le limiteur et `resetLoginRateLimit` (appelé après un
 * login réussi, doc 07 §7.3 : "incrémente compteur tentative échouée = 0
 * (reset)") — doit rester strictement identique des deux côtés.
 * `ipKeyGenerator` (fourni par `express-rate-limit`) normalise l'IPv6 par
 * sous-réseau plutôt que par adresse individuelle : sans ça, un utilisateur
 * IPv6 pourrait contourner le verrouillage en changeant d'adresse au sein
 * de son propre sous-réseau (avertissement natif de la librairie).
 */
function loginRateLimitKey(req: Request): string {
  const body = req.body as { email?: unknown } | undefined;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : 'unknown';
  const ip = normalizeClientIp(req.ip) ?? 'unknown';
  return `${email}:${ipKeyGenerator(ip)}`;
}

/**
 * Construction paresseuse et mémoïsée (store + middleware) : `RedisStore`
 * appelle `sendCommand` dès sa construction (chargement des scripts Lua),
 * donc `rateLimit({...})` ne doit s'exécuter qu'à la première requête
 * réelle vers `/auth/login`, jamais à l'import de ce module — sinon
 * importer `app.ts` échouerait (Redis pas encore connecté) pour tout test
 * qui ne vise même pas cette route (doc 14 §14.6, même principe que
 * `getController()` dans `auth.routes.ts`).
 */
let cachedStore: RedisStore | undefined;
let cachedLimiter: RequestHandler | undefined;

function getStore(): RedisStore {
  cachedStore ??= new RedisStore({
    sendCommand: (...args: string[]) => getRedisClient().sendCommand(args),
    prefix: 'auth:login-rl:',
  });
  return cachedStore;
}

function getLimiter(): RequestHandler {
  if (!cachedLimiter) {
    cachedLimiter = rateLimit({
      windowMs: WINDOW_MS,
      limit: MAX_ATTEMPTS,
      standardHeaders: true,
      legacyHeaders: false,
      store: getStore(),
      keyGenerator: loginRateLimitKey,
      // La validation `creationStack` de la librairie suppose que
      // `rateLimit()` est toujours appelé de façon eager au démarrage —
      // ici la construction est volontairement paresseuse et mémoïsée
      // (une seule fois, à la première requête réelle), donc pas le bug
      // qu'elle détecte (recréer l'instance à chaque requête, ce qui
      // repartirait de zéro et annulerait le verrouillage).
      validate: { creationStack: false },
      handler: (req: Request, res: Response) => {
        const locale = req.locale ?? DEFAULT_LOCALE;
        const message = translateErrorMessage(
          'AUTH_LOGIN_RATE_LIMITED',
          locale,
          'Trop de tentatives de connexion, réessayez plus tard.',
        );
        res
          .status(429)
          .json({
            success: false,
            error: { code: 'AUTH_LOGIN_RATE_LIMITED', message, details: [] },
          });
      },
    });
  }
  return cachedLimiter;
}

/** Verrouillage progressif par `(email, IP)` (doc 07 §7.8, doc 13 §13.2). */
export const loginRateLimiter: RequestHandler = (req, res, next) => {
  getLimiter()(req, res, next);
};

/** Appelé par le controller après un login réussi (doc 07 §7.3). */
export async function resetLoginRateLimit(req: Request): Promise<void> {
  await getStore().resetKey(loginRateLimitKey(req));
}
