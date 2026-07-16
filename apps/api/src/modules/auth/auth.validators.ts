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

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('email invalide'),
});

export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

/**
 * `newPassword` impose la politique de complexité (min 10, doc 07 §7.8) —
 * contrairement à `loginSchema.password`, c'est une création de mot de
 * passe, pas sa vérification.
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'token est requis'),
  newPassword: z.string().min(10, 'le mot de passe doit contenir au moins 10 caractères'),
});

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

/** `POST /auth/2fa/confirm` (doc 07 §7.6) — code TOTP à 6 chiffres. */
export const twoFactorConfirmSchema = z.object({
  code: z.string().trim().min(1, 'code est requis'),
});

export type TwoFactorConfirmDto = z.infer<typeof twoFactorConfirmSchema>;

/**
 * `POST /auth/2fa/verify` (doc 07 §7.3) — `code` accepte aussi bien un code
 * TOTP qu'un code de récupération (`AuthService#verifyTwoFactor` essaie les
 * deux), d'où l'absence de contrainte de longueur/format stricte ici.
 */
export const twoFactorVerifySchema = z.object({
  challengeToken: z.string().min(1, 'challengeToken est requis'),
  code: z.string().trim().min(1, 'code est requis'),
});

export type TwoFactorVerifyDto = z.infer<typeof twoFactorVerifySchema>;

/** `POST /auth/2fa/disable` (doc 07 §7.6) — exige le mot de passe en plus du code (défense en profondeur). */
export const twoFactorDisableSchema = z.object({
  password: z.string().min(1, 'password est requis'),
  code: z.string().trim().min(1, 'code est requis'),
});

export type TwoFactorDisableDto = z.infer<typeof twoFactorDisableSchema>;
