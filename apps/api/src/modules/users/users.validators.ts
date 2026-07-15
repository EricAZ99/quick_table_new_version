import { z } from 'zod';

import { SUPPORTED_LOCALES } from '../../middlewares/i18n.middleware.js';

const E164_PHONE_PATTERN = /^\+[1-9]\d{1,14}$/;

/**
 * DTO d'inscription (doc 12 §12.2, doc 09 §9.1) — valide le mot de passe
 * **en clair** tel que soumis par le client, pas `passwordHash` (le hachage
 * Argon2id, doc 07 §7.8, arrive avec l'endpoint d'inscription de Feature
 * 1.2 ; ce ticket ne construit que la validation Zod, pas le service qui
 * hache puis appelle `UsersRepository.create`).
 *
 * Politique de mot de passe (doc 07 §7.8) : longueur ≥ 10 caractères
 * appliquée ici. La vérification contre une liste des mots de passe les
 * plus fréquents (ex. `zxcvbn`, mentionné à titre d'exemple par la doc)
 * n'est volontairement pas ajoutée — choix de dépendance à trancher
 * explicitement pour l'endpoint d'inscription réel (Feature 1.2), pas
 * anticipé ici (doc 14 §14.5 KISS).
 */
export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('email invalide'),
  password: z.string().min(10, 'le mot de passe doit contenir au moins 10 caractères'),
  fullName: z
    .string()
    .trim()
    .min(1, 'fullName est requis')
    .max(200, 'fullName dépasse 200 caractères'),
  phone: z
    .string()
    .regex(E164_PHONE_PATTERN, 'phone doit être au format E.164 (ex. +33601020304)')
    .optional(),
  preferredLocale: z.enum(SUPPORTED_LOCALES).nullable().optional(),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
