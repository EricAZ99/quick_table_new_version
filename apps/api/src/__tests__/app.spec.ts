import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { CORRELATION_ID_HEADER } from '../middlewares/correlationId.middleware.js';

describe('createApp — bootstrap', () => {
  it('construit une instance Express valide', () => {
    const app = createApp();

    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
    expect(typeof app.use).toBe('function');
  });

  it('retourne une nouvelle instance à chaque appel (pas de singleton implicite)', () => {
    const first = createApp();
    const second = createApp();

    expect(first).not.toBe(second);
  });
});

describe('createApp — middlewares transverses', () => {
  it('répond avec un header X-Correlation-Id sur toute requête (doc 12 §12.8)', async () => {
    const app = createApp();

    const response = await request(app).get('/');

    expect(response.status).toBe(404); // aucune route métier déclarée (Feature 0.3+, hors /health)
    expect(response.headers[CORRELATION_ID_HEADER.toLowerCase()]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('génère un correlationId différent par requête', async () => {
    const app = createApp();

    const first = await request(app).get('/');
    const second = await request(app).get('/');

    expect(first.headers[CORRELATION_ID_HEADER.toLowerCase()]).not.toBe(
      second.headers[CORRELATION_ID_HEADER.toLowerCase()],
    );
  });
});

describe('createApp — /health (doc 25 §25.5)', () => {
  it('GET /health/live répond toujours 200, sans dépendance', async () => {
    const response = await request(createApp()).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it("GET /health/ready répond 503 quand Mongo/Redis ne sont pas connectés (cas de ce test, aucun connectDatabase/connectRedis n'a tourné)", async () => {
    const response = await request(createApp()).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'unavailable',
      checks: { mongodb: false, redis: false },
    });
  });
});
