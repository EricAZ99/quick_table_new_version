import { CountryDefaultModel } from '../models/countryDefault.model.js';

interface CountryDefaultSeed {
  countryCode: string;
  currency: string;
  defaultLocale: 'fr' | 'en' | 'it' | 'es';
  timezoneDefault: string;
}

/**
 * Table de référence pays → devise/langue/fuseau par défaut (doc 35 §35.3).
 * Couvre a minima les 5 pays du backlog (doc 34 Feature 0.4) ; un nouveau
 * pays s'ajoute ici sans déploiement de code une fois `super_admin` capable
 * d'éditer `countryDefaults` en base (hors périmètre de ce ticket — pas de
 * CRUD `countryDefaults` documenté au doc 09, seul le provisioning de tenant
 * consomme cette collection pour l'instant).
 */
export const COUNTRY_DEFAULTS_SEED_DATA: readonly CountryDefaultSeed[] = [
  { countryCode: 'BJ', currency: 'XOF', defaultLocale: 'fr', timezoneDefault: 'Africa/Porto-Novo' },
  { countryCode: 'FR', currency: 'EUR', defaultLocale: 'fr', timezoneDefault: 'Europe/Paris' },
  { countryCode: 'IT', currency: 'EUR', defaultLocale: 'it', timezoneDefault: 'Europe/Rome' },
  { countryCode: 'ES', currency: 'EUR', defaultLocale: 'es', timezoneDefault: 'Europe/Madrid' },
  // Un seul fuseau retenu pour les USA (choix simplificateur documenté) :
  // America/New_York (Eastern), fuseau de référence le plus courant pour un
  // défaut US — un restaurant sur un autre fuseau américain reste libre de
  // surcharger `restaurants.timezone` après provisioning (doc 05 §"restaurants").
  { countryCode: 'US', currency: 'USD', defaultLocale: 'en', timezoneDefault: 'America/New_York' },
];

/**
 * Idempotent (upsert par `countryCode`) : rejouable sans risque en local,
 * en CI ou en staging sans dupliquer ni écraser un ajustement manuel fait
 * entre-temps par un `super_admin` sur un champ non couvert ici.
 */
export async function seedCountryDefaults(): Promise<void> {
  await Promise.all(
    COUNTRY_DEFAULTS_SEED_DATA.map((entry) =>
      CountryDefaultModel.updateOne(
        { countryCode: entry.countryCode },
        { $set: entry },
        { upsert: true },
      ),
    ),
  );
}
