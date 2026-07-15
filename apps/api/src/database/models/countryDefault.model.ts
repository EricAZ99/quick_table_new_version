import { Schema, model } from 'mongoose';

import type { SupportedLocale } from '../../middlewares/i18n.middleware.js';
import { SUPPORTED_LOCALES } from '../../middlewares/i18n.middleware.js';

/**
 * Table de référence pays → devise/langue/fuseau par défaut (doc 05 §5,
 * doc 35 §35.3) — consommée par le provisioning de tenant pour dériver
 * `restaurants.{locale,timezone,currency}` à partir de `restaurants.country`.
 * Collection de configuration **non tenant-scoped** (pas de `tenantScope`
 * plugin ici) : les mêmes documents sont partagés par tous les tenants.
 *
 * `{ timestamps: true }` : non listé dans le tableau de champs doc 05
 * §"countryDefaults" (contrairement à toutes les autres collections du même
 * document, qui listent `createdAt`/`updatedAt` explicitement) — absence
 * jugée être un oubli plutôt qu'un choix délibéré, pas une contradiction
 * entre deux sections de la documentation (donc pas de blocage "signaler et
 * attendre validation") : une collection éditable par `super_admin`
 * bénéficie d'un historique d'audit comme toutes les autres, choix aligné
 * sur le reste du schéma.
 */
export interface CountryDefaultDocument {
  countryCode: string;
  currency: string;
  defaultLocale: SupportedLocale;
  timezoneDefault: string;
  createdAt: Date;
  updatedAt: Date;
}

const countryDefaultSchema = new Schema<CountryDefaultDocument>(
  {
    countryCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: /^[A-Z]{2}$/,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      match: /^[A-Z]{3}$/,
    },
    defaultLocale: { type: String, required: true, enum: SUPPORTED_LOCALES },
    timezoneDefault: { type: String, required: true, trim: true },
  },
  { timestamps: true, collection: 'countryDefaults' },
);

export const CountryDefaultModel = model<CountryDefaultDocument>(
  'CountryDefault',
  countryDefaultSchema,
);
