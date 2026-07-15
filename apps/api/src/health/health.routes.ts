import { Router } from 'express';
import mongoose from 'mongoose';

import { getRedisClient } from '../config/redis.js';

/**
 * Health checks (doc 25 §25.5). Répondent en < 50ms sans dépendance lourde
 * (pas de requête d'agrégation) — `pingMongo`/`pingRedis` font un simple
 * ping, pas une requête métier.
 *
 * `/health/ready` ne vérifie que MongoDB et Redis pour l'instant : "les
 * migrations à jour" (doc 25 §25.5) n'est pas vérifiable, aucun système de
 * migrations n'existe encore (doc 12 §12.7 — arrivera avec le premier
 * schéma versionné, hors périmètre de ce ticket). `/health/deep` (doc 25
 * §25.5) n'est pas non plus dans ce ticket — pas listé dans
 * CHECKLIST-DEVELOPPEMENT.md, réservé au monitoring interne plus tard.
 */

export interface ReadinessChecks {
  mongodb: boolean;
  redis: boolean;
}

export async function pingMongo(): Promise<boolean> {
  try {
    const db = mongoose.connection.db;
    if (!db) return false;
    await db.admin().ping();
    return true;
  } catch {
    return false;
  }
}

export async function pingRedis(): Promise<boolean> {
  try {
    await getRedisClient().ping();
    return true;
  } catch {
    return false;
  }
}

export async function checkReadiness(): Promise<ReadinessChecks> {
  const [mongodb, redis] = await Promise.all([pingMongo(), pingRedis()]);
  return { mongodb, redis };
}

export const healthRouter = Router();

healthRouter.get('/live', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

healthRouter.get('/ready', (_req, res, next) => {
  // Express 4 ne rattrape pas les rejets d'un handler async (doc 12 §12.3) :
  // `.catch(next)` explicite plutôt qu'un `async (req, res) => {...}`, pour
  // qu'une erreur inattendue passe par error-handler.middleware.ts au lieu
  // de devenir un rejet non géré silencieux.
  checkReadiness()
    .then((checks) => {
      const isReady = Object.values(checks).every(Boolean);
      res.status(isReady ? 200 : 503).json({ status: isReady ? 'ok' : 'unavailable', checks });
    })
    .catch(next);
});
