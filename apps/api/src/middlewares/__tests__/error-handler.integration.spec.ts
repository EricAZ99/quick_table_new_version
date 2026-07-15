import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { NotFoundError } from '../../shared/errors/index.js';
import { CORRELATION_ID_HEADER, correlationIdMiddleware } from '../correlationId.middleware.js';
import { errorHandlerMiddleware } from '../error-handler.middleware.js';

/**
 * `createApp()` (app.ts) n'expose encore aucune route (Feature 0.3+) : pas
 * de moyen d'y déclencher une vraie erreur pour ce test. On assemble donc
 * ici un mini-serveur Express avec les deux middlewares réels
 * (correlationId, error-handler) et une route qui lance volontairement,
 * pour vérifier leur intégration en conditions réelles (doc 12 §12.3/§12.4),
 * pas seulement des req/res mockées.
 */
function createTestApp() {
  const app = express();
  app.use(correlationIdMiddleware);

  app.get('/boom-typed', () => {
    throw new NotFoundError('MENU_ITEM_NOT_FOUND', 'Article introuvable.');
  });
  app.get('/boom-untyped', () => {
    throw new Error('bug inattendu, jamais destiné au client');
  });

  app.use(errorHandlerMiddleware);
  return app;
}

describe('error-handler.middleware — intégration Express réelle', () => {
  it('renvoie 404 + enveloppe standard pour une erreur typée, avec X-Correlation-Id', async () => {
    const response = await request(createTestApp()).get('/boom-typed');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'MENU_ITEM_NOT_FOUND', message: 'Article introuvable.', details: [] },
    });
    expect(response.headers[CORRELATION_ID_HEADER.toLowerCase()]).toBeDefined();
  });

  it('renvoie 500 générique pour une erreur non typée, sans fuite de détail', async () => {
    const response = await request(createTestApp()).get('/boom-untyped');
    const body = response.body as { error: { code: string } };

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('bug inattendu');
  });
});
