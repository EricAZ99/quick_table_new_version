import { describe, expect, it } from 'vitest';

import { RestaurantModel } from '../restaurant.model.js';

describe('RestaurantModel — validation de schéma (doc 05 §"restaurants")', () => {
  function build(overrides: Partial<Record<string, unknown>> = {}) {
    return new RestaurantModel({
      name: 'Chez Amara',
      slug: 'chez-amara',
      country: 'BJ',
      countryDetectionMethod: 'manual',
      locale: 'fr',
      timezone: 'Africa/Porto-Novo',
      currency: 'XOF',
      ...overrides,
    });
  }

  it('valide un document conforme', async () => {
    await expect(build().validate()).resolves.toBeUndefined();
  });

  it.each(['name', 'slug', 'country', 'countryDetectionMethod', 'locale', 'timezone', 'currency'])(
    "rejette un document sans '%s' (requis)",
    async (field) => {
      const error = await build({ [field]: undefined })
        .validate()
        .catch((err: unknown) => err);
      expect((error as { errors: Record<string, unknown> }).errors[field]).toBeDefined();
    },
  );

  it('rejette un slug qui ne matche pas ^[a-z0-9-]+$', async () => {
    const error = await build({ slug: 'Chez Amara!' })
      .validate()
      .catch((err: unknown) => err);
    expect((error as { errors: Record<string, unknown> }).errors.slug).toBeDefined();
  });

  it('rejette un country qui ne fait pas 2 lettres', async () => {
    const error = await build({ country: 'BEN' })
      .validate()
      .catch((err: unknown) => err);
    expect((error as { errors: Record<string, unknown> }).errors.country).toBeDefined();
  });

  it('met country et currency en majuscules', () => {
    const doc = build({ country: 'bj', currency: 'xof' });
    expect(doc.country).toBe('BJ');
    expect(doc.currency).toBe('XOF');
  });

  it('rejette une currency qui ne fait pas 3 lettres', async () => {
    const error = await build({ currency: 'XO' })
      .validate()
      .catch((err: unknown) => err);
    expect((error as { errors: Record<string, unknown> }).errors.currency).toBeDefined();
  });

  it('rejette une locale hors de fr/en/it/es', async () => {
    const error = await build({ locale: 'de' })
      .validate()
      .catch((err: unknown) => err);
    expect((error as { errors: Record<string, unknown> }).errors.locale).toBeDefined();
  });

  it('rejette un countryDetectionMethod hors manual/geoip', async () => {
    const error = await build({ countryDetectionMethod: 'auto' })
      .validate()
      .catch((err: unknown) => err);
    expect(
      (error as { errors: Record<string, unknown> }).errors.countryDetectionMethod,
    ).toBeDefined();
  });

  it('défaut status à trial', () => {
    const doc = build();
    expect(doc.status).toBe('trial');
  });

  it('défaut clusterId à null, taxSettings/openingHours à [], settings à {}, deletedAt à null', () => {
    const doc = build();
    expect(doc.clusterId).toBeNull();
    expect(doc.taxSettings).toEqual([]);
    expect(doc.openingHours).toEqual([]);
    expect(doc.settings).toEqual({});
    expect(doc.deletedAt).toBeNull();
  });

  it('rejette un openingHours avec un horaire hors du format HH:mm', async () => {
    const error = await build({
      openingHours: [{ day: 'monday', open: '9h00', close: '18:00' }],
    })
      .validate()
      .catch((err: unknown) => err);
    expect(
      (error as { errors: Record<string, unknown> }).errors['openingHours.0.open'],
    ).toBeDefined();
  });

  it('accepte un openingHours conforme', async () => {
    await expect(
      build({
        openingHours: [{ day: 'monday', open: '09:00', close: '18:00' }],
      }).validate(),
    ).resolves.toBeUndefined();
  });
});
