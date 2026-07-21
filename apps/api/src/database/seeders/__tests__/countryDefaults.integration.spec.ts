import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectDatabase, disconnectDatabase } from '../../../config/database.js';
import { CountryDefaultModel } from '../../models/countryDefault.model.js';
import { COUNTRY_DEFAULTS_SEED_DATA, seedCountryDefaults } from '../countryDefaults.seed.js';

// Même convention que hello-world.integration.spec.ts (doc 14 §14.6) : pas
// de dépendance à config/env.ts ici, `.env` chargé seulement s'il existe.
const envPath = resolve(import.meta.dirname, '../../../../../../.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const mongodbUri = process.env.MONGODB_URI;
const hasRealCredentials = Boolean(mongodbUri);

/**
 * Vérifie contre un vrai MongoDB Atlas (pas un mock) : l'upsert idempotent,
 * l'index unique sur `countryCode` (doc 05 §"countryDefaults"), et que les 5
 * pays du backlog (doc 34 Feature 0.4) sont bien lisibles après seed.
 *
 * `countryDefaults` est une collection globale, **non tenant-scoped** —
 * pas de `deleteMany({})` ici (même bug de collision inter-fichiers déjà
 * trouvé et corrigé sur `roleDefinitions`, Feature 1.4 : un autre fichier
 * d'intégration touchant la même collection en parallèle, comportement
 * Vitest par défaut, pouvait l'effacer pendant qu'un autre la lisait —
 * `restaurants.integration.spec.ts`, Feature 2.1, lit désormais aussi
 * `countryDefaults` pour la dérivation locale/devise/fuseau). Le doublon
 * de test (`ZZ`) est nettoyé explicitement par son propre test plutôt
 * que par un `afterAll` global.
 */
describe.skipIf(!hasRealCredentials)('countryDefaults seed — intégration MongoDB réelle', () => {
  beforeAll(async () => {
    await connectDatabase(mongodbUri as string);
    // Mongoose construit les index en arrière-plan après compilation du
    // modèle (déjà rencontré cette session) : sans cet await explicite, le
    // test d'unicité ci-dessous serait flaky (faux négatif si l'index
    // `{ countryCode: 1 }` n'est pas encore prêt côté serveur).
    await CountryDefaultModel.createIndexes();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('seed les 5 pays et reste idempotent au second passage (pas de doublon)', async () => {
    await seedCountryDefaults();
    await seedCountryDefaults();

    const seededCodes = COUNTRY_DEFAULTS_SEED_DATA.map((entry) => entry.countryCode);
    const docs = await CountryDefaultModel.find({ countryCode: { $in: seededCodes } }).lean();
    expect(docs).toHaveLength(COUNTRY_DEFAULTS_SEED_DATA.length);

    const france = docs.find((doc) => doc.countryCode === 'FR');
    expect(france).toMatchObject({
      currency: 'EUR',
      defaultLocale: 'fr',
      timezoneDefault: 'Europe/Paris',
    });
  });

  it("rejette un doublon de countryCode via l'index unique", async () => {
    await CountryDefaultModel.create({
      countryCode: 'ZZ',
      currency: 'USD',
      defaultLocale: 'en',
      timezoneDefault: 'UTC',
    });

    try {
      await expect(
        CountryDefaultModel.create({
          countryCode: 'ZZ',
          currency: 'EUR',
          defaultLocale: 'fr',
          timezoneDefault: 'Europe/Paris',
        }),
      ).rejects.toThrow();
    } finally {
      await CountryDefaultModel.collection.deleteMany({ countryCode: 'ZZ' });
    }
  });
});
