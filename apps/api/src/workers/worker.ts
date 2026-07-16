import { getEnv } from '../config/env.js';
import { logger } from '../logger/logger.js';
import { createEmailWorker } from './email.worker.js';

/**
 * Point d'entrée du process worker (doc 03 §3.3, doc 12 §12.5) — service
 * Railway distinct de `@quicktable/api`, ne partage que MongoDB/Redis,
 * jamais la boucle d'événements HTTP de l'API.
 *
 * Seule la queue `email` existe à ce stade (`statistics`/`stock-alerts`/
 * `receipts` viendront avec leurs tickets respectifs) — ce point d'entrée
 * grossira au fil de leur ajout, pas anticipé ici (doc 14 §14.5 KISS).
 * Aucune connexion MongoDB : le job `email` transporte un contenu déjà
 * résolu (`to`/`subject`/`html`/`text`), ce worker n'a besoin d'aucun accès
 * base de données pour le traiter.
 */
const env = getEnv();

createEmailWorker(env.REDIS_URL, {
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  user: env.SMTP_USER,
  pass: env.SMTP_PASS,
  from: env.SMTP_FROM,
});

logger.info('quicktable-worker démarré');
