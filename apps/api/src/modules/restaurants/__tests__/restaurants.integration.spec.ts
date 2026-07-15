import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../../app.js';

interface SuccessBody {
  success: true;
  data: { country: string | null; city: string | null };
}

/**
 * Intégration Express réelle (pas de mock du service GeoIP) : la requête
 * supertest provient de loopback (127.0.0.1), une IP privée pour laquelle
 * ip-api.com renvoie `status:"fail"` — ce test prouve donc surtout le
 * comportement "jamais bloquant" en environnement de test/local (doc 35
 * §35.2), pas la résolution réussie d'une IP publique (couverte par la
 * vérification manuelle en conditions réelles de ce ticket, hors suite
 * automatisée — un vrai appel réseau à chaque run de CI serait flaky).
 */
describe('GET /api/v1/restaurants/detect-location — intégration Express réelle', () => {
  it('répond 200 avec une enveloppe standard, jamais une erreur, pour une IP de test locale', async () => {
    const response = await request(createApp()).get('/api/v1/restaurants/detect-location');
    const body = response.body as SuccessBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('country');
    expect(body.data).toHaveProperty('city');
  }, 10000);

  it('est accessible sans authentification (endpoint Public, doc 09 §9.1)', async () => {
    const response = await request(createApp()).get('/api/v1/restaurants/detect-location');

    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  }, 10000);
});
