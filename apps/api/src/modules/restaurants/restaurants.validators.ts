import { z } from 'zod';

import { COUNTRY_DETECTION_METHODS } from '../../database/models/restaurant.model.js';
import { SUPPORTED_LOCALES } from '../../middlewares/i18n.middleware.js';

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const contactSchema = z.object({
  phone: z.string().trim().min(1).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  address: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
});

const openingHourSchema = z.object({
  day: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
  open: z.string().regex(TIME_PATTERN, 'open doit être au format HH:mm'),
  close: z.string().regex(TIME_PATTERN, 'close doit être au format HH:mm'),
});

const taxSettingSchema = z.object({
  name: z.string().trim().min(1).max(60),
  rate: z.number().min(0, 'rate ne peut pas être négatif'),
  isDefault: z.boolean().default(false),
});

/**
 * `POST /platform/restaurants` (doc 09 §9.3, super_admin uniquement) —
 * provisioning **réduit** (décision validée avec toi, ticket précédent) :
 * `ownerId` référence un utilisateur **existant** qui devient
 * `restaurant_owner` — ce ticket ne construit pas de création de compte
 * utilisateur inline (hors périmètre, aucun endpoint public d'inscription
 * self-service n'existe encore, doc 06 §6.7 en évoque le principe sans
 * qu'il soit dans la surface d'API doc 09). L'étape `subscriptions` de
 * doc 06 §6.7 est explicitement absente (Feature 9.1, pas commencée).
 *
 * `locale`/`timezone`/`currency` **optionnels** (doc 09 §9.3 : "dérivés
 * automatiquement depuis `countryDefaults` sauf surcharge explicite") —
 * seul `country` reste obligatoire ; la dérivation elle-même vit dans
 * `restaurants.service.ts` (`RestaurantsService#deriveLocaleTimezoneCurrency`),
 * pas ici : la validation Zod ne fait que définir la *forme* du payload,
 * jamais une requête base de données (doc 12 §12.2 — validation vs
 * logique métier restent des couches séparées).
 */
export const createRestaurantSchema = z.object({
  name: z.string().trim().min(1, 'name est requis').max(120),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'country doit être un code ISO 3166-1 alpha-2')
    .transform((value) => value.toUpperCase()),
  countryDetectionMethod: z.enum(COUNTRY_DETECTION_METHODS),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
  timezone: z.string().trim().min(1, 'timezone est requis').optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'currency doit être un code ISO 4217')
    .transform((value) => value.toUpperCase())
    .optional(),
  ownerId: z.string().regex(OBJECT_ID_PATTERN, 'ownerId doit être un ObjectId MongoDB valide'),
  logoUrl: z.string().trim().url().optional(),
  description: z.string().trim().max(2000).optional(),
  contact: contactSchema.optional(),
});
export type CreateRestaurantDto = z.infer<typeof createRestaurantSchema>;

/** `PATCH /restaurants/me` (doc 09 §9.4) : identité de base — "nom, horaires, logo, coordonnées". */
export const updateRestaurantSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  logoUrl: z.string().trim().url().optional(),
  description: z.string().trim().max(2000).optional(),
  contact: contactSchema.optional(),
  openingHours: z.array(openingHourSchema).optional(),
});
export type UpdateRestaurantDto = z.infer<typeof updateRestaurantSchema>;

/** `PATCH /restaurants/me/settings` (doc 09 §9.4) : "Paramètres avancés" — locale/devise/fuseau/taxes/préférences. */
export const updateRestaurantSettingsSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES).optional(),
  timezone: z.string().trim().min(1).optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'currency doit être un code ISO 4217')
    .transform((value) => value.toUpperCase())
    .optional(),
  taxSettings: z.array(taxSettingSchema).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateRestaurantSettingsDto = z.infer<typeof updateRestaurantSettingsSchema>;
