import { Worker } from 'bullmq';
import { Redis } from 'ioredis';

import { EMAIL_QUEUE_NAME, type EmailJobData } from '../jobs/queues.js';
import { logger } from '../logger/logger.js';
import {
  EmailSenderService,
  type SmtpConfig,
} from '../modules/notifications/email-sender.service.js';

/**
 * Handler BullMQ pour la queue `email` (doc 12 §12.5). Connexion `ioredis`
 * dédiée au worker (distincte de celle du process API côté enfilage,
 * `jobs/queues.ts`) — un worker BullMQ a son propre cycle de vie de
 * connexion, pas partagé avec un producteur.
 */
export function createEmailWorker(redisUrl: string, smtpConfig: SmtpConfig): Worker<EmailJobData> {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const emailSender = new EmailSenderService(smtpConfig);

  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    async (job) => {
      await emailSender.send(job.data);
    },
    { connection },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, to: job.data.to }, 'Email envoyé avec succès');
  });

  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, to: job?.data.to, attemptsMade: job?.attemptsMade, err: error },
      "Échec de l'envoi d'un email",
    );
  });

  return worker;
}
