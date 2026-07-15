import { Schema, Types, model } from 'mongoose';

/**
 * Sessions (doc 05 §"refreshTokens", doc 07 §7.2) — **non tenant-scoped**
 * (comme `users`) : une session appartient à un utilisateur, pas à un
 * tenant. Le token lui-même est opaque côté client (UUID haute entropie,
 * généré par `jwt.ts`) ; seul son hash SHA-256 (`tokenHash`) est persisté
 * ici — même en cas de fuite de la base, les tokens ne sont pas
 * directement réutilisables (doc 07 §7.2).
 *
 * Index TTL sur `expiresAt` : MongoDB purge automatiquement les sessions
 * expirées, pas de job de nettoyage à écrire.
 */
export interface RefreshTokenDocument {
  userId: Types.ObjectId;
  tokenHash: string;
  deviceInfo?: { userAgent?: string; ip?: string; deviceLabel?: string };
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    deviceInfo: {
      userAgent: { type: String },
      ip: { type: String },
      deviceLabel: { type: String },
    },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'refreshTokens' },
);

refreshTokenSchema.index({ userId: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshTokenModel = model<RefreshTokenDocument>('RefreshToken', refreshTokenSchema);
