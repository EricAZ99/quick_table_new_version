import { Schema, model } from 'mongoose';

import { SUPPORTED_LOCALES, type SupportedLocale } from '../../middlewares/i18n.middleware.js';

export const RESTAURANT_STATUSES = ['trial', 'active', 'suspended', 'archived'] as const;
export type RestaurantStatus = (typeof RESTAURANT_STATUSES)[number];

export const COUNTRY_DETECTION_METHODS = ['manual', 'geoip'] as const;
export type CountryDetectionMethod = (typeof COUNTRY_DETECTION_METHODS)[number];

const OPENING_HOUR_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
export type OpeningHourDay = (typeof OPENING_HOUR_DAYS)[number];

export interface RestaurantContact {
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
}

export interface TaxSetting {
  name: string;
  rate: number;
  isDefault: boolean;
}

export interface OpeningHour {
  day: OpeningHourDay;
  open: string;
  close: string;
}

/**
 * `restaurants` = le Tenant lui-même (doc 05 §"restaurants", doc 06 §6.2) —
 * `_id` **est** le `tenantId` utilisé partout ailleurs (`memberships.tenantId`,
 * etc.). Collection **non tenant-scoped** par construction : elle n'a pas de
 * champ `tenantId` distinct pointant vers elle-même, donc pas de plugin
 * `tenantScope` ici — même raisonnement que `users`/`roleDefinitions`
 * (doc 06 §6.4 : le garde-fou ne s'applique qu'aux collections *enfants*
 * d'un tenant). L'isolation d'accès se fait autrement : les endpoints
 * `/restaurants/me` ne lisent/écrivent jamais que le document dont `_id`
 * correspond à `req.context.tenantId` (jamais un id fourni par le client).
 *
 * `country`/`locale`/`timezone`/`currency` requis dès la création dans ce
 * ticket (CRUD de base) — la dérivation automatique depuis `countryDefaults`
 * (permettant de ne fournir que `country`) est le ticket suivant de cette
 * Feature, pas construite ici (doc 14 §14.5 KISS, un ticket à la fois).
 *
 * `taxSettings`/`openingHours` : structure de tableau documentée par doc 05
 * mais sans détail de sous-champs pour `openingHours` — `day` en jour de
 * semaine explicite (`monday`..`sunday`) et `open`/`close` en `HH:mm`,
 * convention la plus lisible en l'absence de précision documentée,
 * validée au niveau Zod (`restaurants.validators.ts`) plutôt qu'ici par
 * un `match` de schéma (cohérent avec le reste du projet : Mongoose porte
 * les contraintes de forme minimales, Zod la validation métier complète).
 */
export interface RestaurantDocument {
  name: string;
  slug: string;
  logoUrl?: string;
  description?: string;
  contact?: RestaurantContact;
  country: string;
  countryDetectionMethod: CountryDetectionMethod;
  locale: SupportedLocale;
  timezone: string;
  currency: string;
  taxSettings: TaxSetting[];
  openingHours: OpeningHour[];
  status: RestaurantStatus;
  clusterId: string | null;
  settings: Record<string, unknown>;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const contactSchema = new Schema<RestaurantContact>(
  {
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
  },
  { _id: false },
);

const taxSettingSchema = new Schema<TaxSetting>(
  {
    name: { type: String, required: true, trim: true },
    rate: { type: Number, required: true, min: 0 },
    isDefault: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

const openingHourSchema = new Schema<OpeningHour>(
  {
    day: { type: String, required: true, enum: OPENING_HOUR_DAYS },
    open: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    close: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  },
  { _id: false },
);

const restaurantSchema = new Schema<RestaurantDocument>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, match: /^[a-z0-9-]+$/ },
    logoUrl: { type: String, trim: true },
    description: { type: String, trim: true },
    contact: { type: contactSchema },
    country: { type: String, required: true, uppercase: true, trim: true, match: /^[A-Z]{2}$/ },
    countryDetectionMethod: {
      type: String,
      required: true,
      enum: COUNTRY_DETECTION_METHODS,
    },
    locale: { type: String, required: true, enum: SUPPORTED_LOCALES },
    timezone: { type: String, required: true, trim: true },
    currency: { type: String, required: true, uppercase: true, trim: true, match: /^[A-Z]{3}$/ },
    taxSettings: { type: [taxSettingSchema], default: [] },
    openingHours: { type: [openingHourSchema], default: [] },
    status: { type: String, required: true, enum: RESTAURANT_STATUSES, default: 'trial' },
    clusterId: { type: String, default: null },
    settings: { type: Schema.Types.Mixed, default: {} },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'restaurants' },
);

restaurantSchema.index({ status: 1 });
restaurantSchema.index({ country: 1 });

export const RestaurantModel = model<RestaurantDocument>('Restaurant', restaurantSchema);
