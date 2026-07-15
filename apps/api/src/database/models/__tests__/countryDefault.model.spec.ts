import { describe, expect, it } from 'vitest';

import { CountryDefaultModel } from '../countryDefault.model.js';

describe('CountryDefaultModel — validation de schéma (doc 05 §"countryDefaults")', () => {
  function build(overrides: Partial<Record<string, unknown>> = {}) {
    return new CountryDefaultModel({
      countryCode: 'FR',
      currency: 'EUR',
      defaultLocale: 'fr',
      timezoneDefault: 'Europe/Paris',
      ...overrides,
    });
  }

  it('valide un document conforme', async () => {
    await expect(build().validate()).resolves.toBeUndefined();
  });

  it.each(['countryCode', 'currency', 'defaultLocale', 'timezoneDefault'])(
    "rejette un document sans '%s' (requis)",
    async (field) => {
      const error = await build({ [field]: undefined })
        .validate()
        .catch((err: unknown) => err);
      expect((error as { errors: Record<string, unknown> }).errors[field]).toBeDefined();
    },
  );

  it('rejette un countryCode qui ne fait pas 2 lettres (ISO 3166-1 alpha-2)', async () => {
    const error = await build({ countryCode: 'FRA' })
      .validate()
      .catch((err: unknown) => err);
    expect((error as { errors: Record<string, unknown> }).errors.countryCode).toBeDefined();
  });

  it('rejette une currency qui ne fait pas 3 lettres (ISO 4217)', async () => {
    const error = await build({ currency: 'EU' })
      .validate()
      .catch((err: unknown) => err);
    expect((error as { errors: Record<string, unknown> }).errors.currency).toBeDefined();
  });

  it('rejette une defaultLocale hors de fr/en/it/es', async () => {
    const error = await build({ defaultLocale: 'de' })
      .validate()
      .catch((err: unknown) => err);
    expect((error as { errors: Record<string, unknown> }).errors.defaultLocale).toBeDefined();
  });

  it('met countryCode et currency en majuscules', () => {
    const doc = build({ countryCode: 'fr', currency: 'eur' });
    expect(doc.countryCode).toBe('FR');
    expect(doc.currency).toBe('EUR');
  });
});
