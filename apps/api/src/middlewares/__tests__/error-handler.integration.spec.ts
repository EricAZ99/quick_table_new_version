import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { ValidationError, NotFoundError } from '../../shared/errors/index.js';
import { CORRELATION_ID_HEADER, correlationIdMiddleware } from '../correlationId.middleware.js';
import { errorHandlerMiddleware } from '../error-handler.middleware.js';
import { i18nMiddleware } from '../i18n.middleware.js';

/**
 * `createApp()` (app.ts) n'expose encore aucune route (Feature 0.3+) : pas
 * de moyen d'y déclencher une vraie erreur pour ce test. On assemble donc
 * ici un mini-serveur Express avec les middlewares réels (correlationId,
 * i18n, error-handler) et une route qui lance volontairement, pour
 * vérifier leur intégration en conditions réelles (doc 12 §12.3/§12.4),
 * pas seulement des req/res mockées.
 */
function createTestApp() {
  const app = express();
  app.use(correlationIdMiddleware);
  app.use(i18nMiddleware);

  app.get('/boom-typed', () => {
    throw new NotFoundError('MENU_ITEM_NOT_FOUND', 'Article introuvable.');
  });
  app.get('/boom-untyped', () => {
    throw new Error('bug inattendu, jamais destiné au client');
  });
  app.get('/boom-catalogue', () => {
    throw new ValidationError('HELLO_WORLD_INVALID_PAYLOAD', 'fallback jamais utilisé');
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

  it("traduit le message d'erreur selon Accept-Language de bout en bout (doc 35 §35.4)", async () => {
    const responseFr = await request(createTestApp())
      .get('/boom-catalogue')
      .set('Accept-Language', 'fr-FR,fr;q=0.9');
    const responseIt = await request(createTestApp())
      .get('/boom-catalogue')
      .set('Accept-Language', 'it');
    const responseSansHeader = await request(createTestApp()).get('/boom-catalogue');

    expect(responseFr.body).toEqual({
      success: false,
      error: { code: 'HELLO_WORLD_INVALID_PAYLOAD', message: 'Payload invalide.', details: [] },
    });
    expect(responseIt.body).toEqual({
      success: false,
      error: { code: 'HELLO_WORLD_INVALID_PAYLOAD', message: 'Payload non valido.', details: [] },
    });
    // Pas de header Accept-Language -> locale par défaut 'en' (doc 35 §35.4)
    expect(responseSansHeader.body).toEqual({
      success: false,
      error: { code: 'HELLO_WORLD_INVALID_PAYLOAD', message: 'Invalid payload.', details: [] },
    });
  });
});
