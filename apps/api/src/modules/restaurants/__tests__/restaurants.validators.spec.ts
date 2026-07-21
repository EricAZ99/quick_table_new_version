import { describe, expect, it } from 'vitest';

import {
  createRestaurantSchema,
  updateRestaurantSchema,
  updateRestaurantSettingsSchema,
} from '../restaurants.validators.js';

const VALID_CREATE = {
  name: 'Chez Amara',
  country: 'bj',
  countryDetectionMethod: 'manual',
  locale: 'fr',
  timezone: 'Africa/Porto-Novo',
  currency: 'xof',
  ownerId: '65f000000000000000000001',
};

describe('createRestaurantSchema', () => {
  it('valide un payload conforme et met country/currency en majuscules', () => {
    const result = createRestaurantSchema.safeParse(VALID_CREATE);
    expect(result.success).toBe(true);
    expect(result.success && result.data.country).toBe('BJ');
    expect(result.success && result.data.currency).toBe('XOF');
  });

  it.each(['name', 'country', 'countryDetectionMethod', 'ownerId'])(
    "rejette un payload sans '%s'",
    (field) => {
      const payload: Record<string, unknown> = { ...VALID_CREATE };
      delete payload[field];
      const result = createRestaurantSchema.safeParse(payload);
      expect(result.success).toBe(false);
    },
  );

  it.each(['locale', 'timezone', 'currency'])(
    "accepte un payload sans '%s' (doc 09 §9.3 : dérivé depuis countryDefaults, résolu dans restaurants.service.ts, pas ici)",
    (field) => {
      const payload: Record<string, unknown> = { ...VALID_CREATE };
      delete payload[field];
      const result = createRestaurantSchema.safeParse(payload);
      expect(result.success).toBe(true);
    },
  );

  it('accepte un payload ne fournissant que country (locale/timezone/currency tous omis)', () => {
    const result = createRestaurantSchema.safeParse({
      name: 'Chez Amara',
      country: 'bj',
      countryDetectionMethod: 'manual',
      ownerId: '65f000000000000000000001',
    });
    expect(result.success).toBe(true);
  });

  it('rejette un ownerId qui ne ressemble pas à un ObjectId', () => {
    const result = createRestaurantSchema.safeParse({ ...VALID_CREATE, ownerId: 'not-an-id' });
    expect(result.success).toBe(false);
  });

  it('rejette un country qui ne fait pas 2 lettres', () => {
    const result = createRestaurantSchema.safeParse({ ...VALID_CREATE, country: 'ben' });
    expect(result.success).toBe(false);
  });

  it('rejette une countryDetectionMethod hors manual/geoip', () => {
    const result = createRestaurantSchema.safeParse({
      ...VALID_CREATE,
      countryDetectionMethod: 'auto',
    });
    expect(result.success).toBe(false);
  });

  it('accepte contact/logoUrl/description en option', () => {
    const result = createRestaurantSchema.safeParse({
      ...VALID_CREATE,
      logoUrl: 'https://example.com/logo.png',
      description: 'Un restaurant',
      contact: { phone: '+22900000000', email: 'contact@chezamara.bj' },
    });
    expect(result.success).toBe(true);
  });
});

describe('updateRestaurantSchema', () => {
  it('accepte un payload vide (toutes les clés sont optionnelles)', () => {
    expect(updateRestaurantSchema.safeParse({}).success).toBe(true);
  });

  it('accepte name/logoUrl/description/contact/openingHours', () => {
    const result = updateRestaurantSchema.safeParse({
      name: 'Nouveau nom',
      openingHours: [{ day: 'monday', open: '09:00', close: '18:00' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejette un openingHours hors du format HH:mm', () => {
    const result = updateRestaurantSchema.safeParse({
      openingHours: [{ day: 'monday', open: '9h', close: '18:00' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejette un day hors de la liste des 7 jours', () => {
    const result = updateRestaurantSchema.safeParse({
      openingHours: [{ day: 'someday', open: '09:00', close: '18:00' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('updateRestaurantSettingsSchema', () => {
  it('accepte un payload vide', () => {
    expect(updateRestaurantSettingsSchema.safeParse({}).success).toBe(true);
  });

  it('accepte locale/timezone/currency/taxSettings/settings et met currency en majuscules', () => {
    const result = updateRestaurantSettingsSchema.safeParse({
      locale: 'en',
      currency: 'eur',
      taxSettings: [{ name: 'TVA standard', rate: 20, isDefault: true }],
      settings: { allowCustomerOrdering: true },
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.currency).toBe('EUR');
  });

  it('rejette un taxSettings avec un rate négatif', () => {
    const result = updateRestaurantSettingsSchema.safeParse({
      taxSettings: [{ name: 'TVA', rate: -5, isDefault: false }],
    });
    expect(result.success).toBe(false);
  });
});
