import { Schema, Types, model } from 'mongoose';

/**
 * Token de réinitialisation de mot de passe (doc 07 §7.5) — absent du
 * schéma doc 05 (ni `users` ni aucune collection dédiée n'y prévoyaient de
 * stockage), collection ajoutée en miroir de `refreshTokens` (doc 05
 * §"refreshTokens") : même principe (non tenant-scoped, hash SHA-256 du
 * token opaque, jamais stocké en clair, TTL Mongo pour la purge
 * automatique) — décision validée explicitement pour ce ticket.
 *
 * `usedAt` (plutôt que suppression à l'usage) : garde une trace d'audit,
 * même convention que `revokedAt` sur `refreshTokens`.
 */
export interface PasswordResetTokenDocument {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

const passwordResetTokenSchema = new Schema<PasswordResetTokenDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'passwordResetTokens' },
);

passwordResetTokenSchema.index({ userId: 1 });
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetTokenModel = model<PasswordResetTokenDocument>(
  'PasswordResetToken',
  passwordResetTokenSchema,
);
