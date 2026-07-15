import { describe, expect, it, vi } from 'vitest';

vi.mock('../../models/countryDefault.model.js', () => ({
  CountryDefaultModel: { updateOne: vi.fn() },
}));

import { CountryDefaultModel } from '../../models/countryDefault.model.js';
import { COUNTRY_DEFAULTS_SEED_DATA, seedCountryDefaults } from '../countryDefaults.seed.js';

describe('COUNTRY_DEFAULTS_SEED_DATA', () => {
  it('couvre a minima Bénin, France, Italie, Espagne, USA (doc 34 Feature 0.4)', () => {
    const countryCodes = COUNTRY_DEFAULTS_SEED_DATA.map((entry) => entry.countryCode).sort();
    expect(countryCodes).toEqual(['BJ', 'ES', 'FR', 'IT', 'US']);
  });

  it('reflète la table de dérivation devise/langue du doc 35 §35.3', () => {
    expect(COUNTRY_DEFAULTS_SEED_DATA).toContainEqual({
      countryCode: 'BJ',
      currency: 'XOF',
      defaultLocale: 'fr',
      timezoneDefault: 'Africa/Porto-Novo',
    });
    expect(COUNTRY_DEFAULTS_SEED_DATA).toContainEqual({
      countryCode: 'US',
      currency: 'USD',
      defaultLocale: 'en',
      timezoneDefault: 'America/New_York',
    });
  });
});

describe('seedCountryDefaults', () => {
  it('upsert chaque entrée par countryCode (idempotent, rejouable sans duplication)', async () => {
    await seedCountryDefaults();

    expect(CountryDefaultModel.updateOne).toHaveBeenCalledTimes(COUNTRY_DEFAULTS_SEED_DATA.length);
    for (const entry of COUNTRY_DEFAULTS_SEED_DATA) {
      expect(CountryDefaultModel.updateOne).toHaveBeenCalledWith(
        { countryCode: entry.countryCode },
        { $set: entry },
        { upsert: true },
      );
    }
  });
});
