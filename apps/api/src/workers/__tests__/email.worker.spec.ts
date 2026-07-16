import { beforeEach, describe, expect, it, vi } from 'vitest';

const { WorkerMock, workerOnMock, IORedisMock, sendMock, EmailSenderServiceMock } = vi.hoisted(
  () => {
    const workerOnMock = vi.fn();
    const WorkerMock = vi.fn().mockImplementation((_name: string, processor: unknown) => ({
      on: workerOnMock,
      __processor: processor,
    }));
    const IORedisMock = vi.fn().mockImplementation(() => ({}));
    const sendMock = vi.fn().mockResolvedValue(undefined);
    const EmailSenderServiceMock = vi.fn().mockImplementation(() => ({ send: sendMock }));
    return { WorkerMock, workerOnMock, IORedisMock, sendMock, EmailSenderServiceMock };
  },
);

vi.mock('bullmq', () => ({ Worker: WorkerMock }));
vi.mock('ioredis', () => ({ Redis: IORedisMock }));
vi.mock('../../modules/notifications/email-sender.service.js', () => ({
  EmailSenderService: EmailSenderServiceMock,
}));

import { EMAIL_QUEUE_NAME } from '../../jobs/queues.js';
import { createEmailWorker } from '../email.worker.js';

const SMTP_CONFIG = { host: 'smtp-relay.brevo.com', port: 587, user: 'u', pass: 'p' };

describe('createEmailWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('construit un Worker BullMQ sur la queue "email" avec sa propre connexion ioredis', () => {
    createEmailWorker('redis://localhost:6379', SMTP_CONFIG);

    expect(IORedisMock).toHaveBeenCalledWith('redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    expect(EmailSenderServiceMock).toHaveBeenCalledWith(SMTP_CONFIG);
    const [name, processor, opts] = vi.mocked(WorkerMock).mock.calls[0] as [
      string,
      unknown,
      { connection: unknown },
    ];
    expect(name).toBe(EMAIL_QUEUE_NAME);
    expect(processor).toBeInstanceOf(Function);
    expect(opts.connection).toBeDefined();
  });

  it('le processor envoie le job via EmailSenderService#send', async () => {
    const worker = createEmailWorker('redis://localhost:6379', SMTP_CONFIG) as unknown as {
      __processor: (job: { data: unknown }) => Promise<void>;
    };

    await worker.__processor({ data: { to: 'a@b.c', subject: 's', html: '<p>h</p>', text: 't' } });

    expect(sendMock).toHaveBeenCalledWith({
      to: 'a@b.c',
      subject: 's',
      html: '<p>h</p>',
      text: 't',
    });
  });

  it('enregistre des handlers "completed" et "failed" pour la traçabilité (logger)', () => {
    createEmailWorker('redis://localhost:6379', SMTP_CONFIG);

    expect(workerOnMock).toHaveBeenCalledWith('completed', expect.any(Function));
    expect(workerOnMock).toHaveBeenCalledWith('failed', expect.any(Function));
  });
});
