import { Schema, model } from 'mongoose';

import { SUPPORTED_LOCALES } from '../../middlewares/i18n.middleware.js';
import type { SupportedLocale } from '../../middlewares/i18n.middleware.js';

/**
 * Identité globale (doc 05 §5.3) — **non tenant-scoped** (pas de
 * `tenantScope` plugin) : un même utilisateur peut avoir un `membership`
 * dans plusieurs restaurants (doc 05 §"memberships"). Le rattachement à un
 * tenant se fait exclusivement via `memberships`, jamais ici.
 *
 * `passwordHash` (Argon2id, doc 07 §7.8) et `twoFactorSecret` (chiffré
 * AES-256-GCM, doc 07 §7.6) sont déclarés en `string` simple — le
 * hachage/chiffrement est à la charge de l'appelant (`AuthService`),
 * jamais de ce fichier.
 */

/**
 * Code de récupération 2FA à usage unique (doc 07 §7.6) — 10 générés à
 * l'activation, hashés (SHA-256, `recoveryCode.util.ts`) ; `usedAt` marque
 * la consommation plutôt qu'une suppression, pour garder une trace (audit).
 */
export interface TwoFactorRecoveryCode {
  codeHash: string;
  usedAt: Date | null;
}

export interface UserDocument {
  email: string;
  passwordHash: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  isSuperAdmin: boolean;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  twoFactorRecoveryCodes: TwoFactorRecoveryCode[];
  preferredLocale: SupportedLocale | null;
  status: 'active' | 'suspended';
  lastLoginAt?: Date;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PHONE_PATTERN = /^\+[1-9]\d{1,14}$/;

const userSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: EMAIL_PATTERN,
    },
    // Jamais retourné par l'API (doc 05 §"users") : exclu au niveau du
    // schéma de sérialisation ci-dessous (`toJSON`/`toObject`), pas laissé
    // à la charge de chaque controller de le retirer manuellement.
    passwordHash: { type: String, required: true, select: false },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, match: E164_PHONE_PATTERN },
    avatarUrl: { type: String, trim: true },
    isSuperAdmin: { type: Boolean, required: true, default: false },
    twoFactorEnabled: { type: Boolean, required: true, default: false },
    twoFactorSecret: { type: String, select: false },
    twoFactorRecoveryCodes: {
      type: [
        {
          codeHash: { type: String, required: true },
          usedAt: { type: Date, default: null },
        },
      ],
      select: false,
      default: [],
      _id: false,
    },
    preferredLocale: { type: String, enum: SUPPORTED_LOCALES, default: null },
    status: { type: String, required: true, enum: ['active', 'suspended'], default: 'active' },
    lastLoginAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'users' },
);

userSchema.index({ status: 1 });

function stripSecrets<
  T extends { passwordHash?: unknown; twoFactorSecret?: unknown; twoFactorRecoveryCodes?: unknown },
>(_doc: unknown, ret: T): Omit<T, 'passwordHash' | 'twoFactorSecret' | 'twoFactorRecoveryCodes'> {
  delete ret.passwordHash;
  delete ret.twoFactorSecret;
  delete ret.twoFactorRecoveryCodes;
  return ret;
}
userSchema.set('toJSON', { transform: stripSecrets });
userSchema.set('toObject', { transform: stripSecrets });

export const UserModel = model<UserDocument>('User', userSchema);
