import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createRedisRateLimiter } from '../createRedisRateLimiter.js';

const { sendCommandMock, getRedisClientMock } = vi.hoisted(() => ({
  sendCommandMock: vi.fn(),
  getRedisClientMock: vi.fn(),
}));

vi.mock('../../../config/redis.js', () => ({
  getRedisClient: getRedisClientMock,
}));

vi.mock('../../../logger/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

/**
 * Couvre le correctif "best-effort" (doc 26 §26.6) : avant, une erreur
 * transitoire du store Redis (`sendCommand` qui rejette) remontait en 500
 * sur la route protégée — jamais couvert par un test dédié jusqu'ici
 * (seule la voie heureuse était exercée, indirectement, par
 * `auth.integration.spec.ts` contre un vrai Redis). Ne re-teste pas le
 * comportement normal d'incrémentation/429 (déjà couvert par ces tests
 * d'intégration réels) — se concentre sur ce qui a changé : la voie
 * d'échec Redis.
 */
describe('createRedisRateLimiter — best-effort sur panne Redis', () => {
  function buildApp(limiter: ReturnType<typeof createRedisRateLimiter>) {
    const app = express();
    app.use(limiter.middleware);
    app.get('/test', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    return app;
  }

  it('laisse passer la requête (jamais de 500) quand le store Redis échoue à l’incrémentation', async () => {
    sendCommandMock.mockRejectedValue(new Error('ECONNRESET'));
    getRedisClientMock.mockReturnValue({ sendCommand: sendCommandMock });
    const limiter = createRedisRateLimiter({
      windowMs: 1000,
      limit: 5,
      prefix: 'test:passonerror:',
      keyGenerator: () => 'fixed-key',
      errorCode: 'TEST_RATE_LIMITED',
      defaultMessage: 'Trop de tentatives.',
    });

    const response = await request(buildApp(limiter)).get('/test');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('resetKey ne lève jamais, même si le store Redis échoue', async () => {
    sendCommandMock.mockRejectedValue(new Error('ECONNRESET'));
    getRedisClientMock.mockReturnValue({ sendCommand: sendCommandMock });
    const limiter = createRedisRateLimiter({
      windowMs: 1000,
      limit: 5,
      prefix: 'test:resetkey:',
      keyGenerator: () => 'fixed-key',
      errorCode: 'TEST_RATE_LIMITED',
      defaultMessage: 'Trop de tentatives.',
    });

    await expect(
      limiter.resetKey({ ip: '127.0.0.1' } as Parameters<typeof limiter.resetKey>[0]),
    ).resolves.toBeUndefined();
  });
});
