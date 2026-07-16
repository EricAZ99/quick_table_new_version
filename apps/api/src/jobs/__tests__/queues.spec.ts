import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { queueAddMock, queueCloseMock, QueueMock, redisQuitMock, IORedisMock } = vi.hoisted(() => {
  const queueAddMock = vi.fn().mockResolvedValue(undefined);
  const queueCloseMock = vi.fn().mockResolvedValue(undefined);
  const QueueMock = vi.fn().mockImplementation(() => ({
    add: queueAddMock,
    close: queueCloseMock,
  }));
  const redisQuitMock = vi.fn().mockResolvedValue(undefined);
  const IORedisMock = vi.fn().mockImplementation(() => ({ quit: redisQuitMock }));
  return { queueAddMock, queueCloseMock, QueueMock, redisQuitMock, IORedisMock };
});

vi.mock('bullmq', () => ({ Queue: QueueMock }));
vi.mock('ioredis', () => ({ Redis: IORedisMock }));

import {
  connectEmailQueue,
  disconnectEmailQueue,
  enqueueEmailJob,
  EMAIL_QUEUE_NAME,
  getEmailQueue,
} from '../queues.js';

describe('jobs/queues (email)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await disconnectEmailQueue();
  });

  it("échoue explicitement si la queue n'a pas encore été connectée", () => {
    expect(() => getEmailQueue()).toThrow(/non initialisée/);
  });

  it('connectEmailQueue construit une Queue BullMQ nommée "email" sur une connexion ioredis dédiée', () => {
    connectEmailQueue('redis://localhost:6379');

    expect(IORedisMock).toHaveBeenCalledWith('redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    const [name, opts] = vi.mocked(QueueMock).mock.calls[0] as [string, { connection: unknown }];
    expect(name).toBe(EMAIL_QUEUE_NAME);
    expect(opts.connection).toBeDefined();
    expect(getEmailQueue()).toBeDefined();
  });

  it('enqueueEmailJob enfile un job "send-email" avec 5 tentatives et un backoff exponentiel', async () => {
    connectEmailQueue('redis://localhost:6379');

    await enqueueEmailJob({
      to: 'chef@quicktable.io',
      subject: 'Sujet',
      html: '<p>x</p>',
      text: 'x',
    });

    expect(queueAddMock).toHaveBeenCalledWith(
      'send-email',
      { to: 'chef@quicktable.io', subject: 'Sujet', html: '<p>x</p>', text: 'x' },
      { attempts: 5, backoff: { type: 'exponential', delay: 5000 } },
    );
  });

  it('disconnectEmailQueue ferme la queue et la connexion, puis getEmailQueue échoue à nouveau', async () => {
    connectEmailQueue('redis://localhost:6379');

    await disconnectEmailQueue();

    expect(queueCloseMock).toHaveBeenCalledOnce();
    expect(redisQuitMock).toHaveBeenCalledOnce();
    expect(() => getEmailQueue()).toThrow(/non initialisée/);
  });
});
