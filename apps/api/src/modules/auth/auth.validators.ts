import { z } from 'zod';

/**
 * DTO de connexion (doc 07 §7.3, doc 09 §9.1). Contrairement à
 * `createUserSchema` (inscription), on **n'impose pas** la politique de
 * complexité (longueur ≥ 10, doc 07 §7.8) ici : un mot de passe existant
 * doit pouvoir être vérifié tel quel, la politique de complexité ne
 * s'applique qu'à la création/au changement d'un mot de passe, jamais à
 * sa vérification.
 */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('email invalide'),
  password: z.string().min(1, 'password est requis'),
});

export type LoginDto = z.infer<typeof loginSchema>;
