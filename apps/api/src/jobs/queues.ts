import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export const EMAIL_QUEUE_NAME = 'email';

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Queues BullMQ nommées par domaine (`email`, `statistics`, `stock-alerts`,
 * `receipts` — doc 12 §12.5), pas une queue générique : permet des
 * politiques de retry différenciées par domaine. Seule `email` existe pour
 * l'instant.
 *
 * BullMQ exige `ioredis` (`maxRetriesPerRequest: null`, requis par ses
 * commandes bloquantes) — distinct du client `redis` déjà utilisé ailleurs
 * pour le rate limiting/cache (doc 13 §13.2), deux librairies clientes qui
 * coexistent volontairement, chacune pour son usage.
 *
 * Même convention que `config/database.ts`/`config/redis.ts` : connexion
 * établie une fois via `connectEmailQueue()` au démarrage du process
 * (API **et** worker en enfilent/consomment tous les deux), `getEmailQueue()`
 * échoue explicitement si appelée avant.
 */
let connection: Redis | undefined;
let emailQueue: Queue<EmailJobData> | undefined;

export function connectEmailQueue(redisUrl: string): Queue<EmailJobData> {
  connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, { connection });
  return emailQueue;
}

export function getEmailQueue(): Queue<EmailJobData> {
  if (!emailQueue) {
    throw new Error(
      'Queue email non initialisée — connectEmailQueue() doit être appelé au démarrage.',
    );
  }
  return emailQueue;
}

export async function disconnectEmailQueue(): Promise<void> {
  await emailQueue?.close();
  await connection?.quit();
  emailQueue = undefined;
  connection = undefined;
}

/**
 * 5 retries à backoff exponentiel (doc 12 §12.5 : "l'envoi d'email tolère
 * 5 retries espacés") — ne martèle pas Brevo en cas de panne transitoire.
 */
export async function enqueueEmailJob(data: EmailJobData): Promise<void> {
  await getEmailQueue().add('send-email', data, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
  });
}
