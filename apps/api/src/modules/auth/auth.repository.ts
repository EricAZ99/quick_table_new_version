import { MembershipModel } from '../../database/models/membership.model.js';
import { PasswordResetTokenModel } from '../../database/models/passwordResetToken.model.js';
import { RefreshTokenModel } from '../../database/models/refreshToken.model.js';
import { ALLOW_CROSS_TENANT_OPTION } from '../../database/models/plugins/tenantScope.js';

export interface CreateRefreshTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  deviceInfo?: { userAgent?: string; ip?: string; deviceLabel?: string };
}

export interface CreatePasswordResetTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

/**
 * `users`/`refreshTokens` sont non tenant-scoped (doc 05 §5.3) : ce
 * repository n'étend pas `BaseRepository`, comme `UsersRepository`.
 *
 * `findMembershipsByUserId` est le seul point du code qui invoque
 * l'échappatoire `ALLOW_CROSS_TENANT_OPTION` (`tenantScope.ts`) : résoudre
 * *tous* les memberships d'un utilisateur, toutes tenants confondues, est
 * une opération d'identité plateforme légitime au login (doc 07 §7.3),
 * pas un accès à une donnée métier d'un tenant précis — jamais utilisé
 * pour retourner des données métier à l'appelant.
 */
export class AuthRepository {
  createRefreshToken(input: CreateRefreshTokenInput) {
    return RefreshTokenModel.create(input);
  }

  findMembershipsByUserId(userId: string) {
    return MembershipModel.find({ userId }).setOptions({ [ALLOW_CROSS_TENANT_OPTION]: true });
  }

  findRefreshTokenByHash(tokenHash: string) {
    return RefreshTokenModel.findOne({ tokenHash });
  }

  revokeRefreshToken(id: string) {
    return RefreshTokenModel.updateOne({ _id: id }, { revokedAt: new Date() });
  }

  /**
   * Révocation de toute la famille de sessions d'un utilisateur (doc 07
   * §7.1) : déclenchée quand un refresh token déjà révoqué est présenté
   * (signe de vol/rejeu) — `refreshTokens` n'a pas de notion de "famille"
   * explicite au schéma (doc 05), donc "toute la famille" = tous les
   * tokens actifs de ce `userId`.
   */
  revokeAllUserRefreshTokens(userId: string) {
    return RefreshTokenModel.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });
  }

  /** `GET /auth/sessions` (doc 07 §7.7) : sessions actives, plus récentes en premier. */
  findActiveRefreshTokensByUserId(userId: string) {
    return RefreshTokenModel.find({
      userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });
  }

  findRefreshTokenById(id: string) {
    return RefreshTokenModel.findById(id);
  }

  /**
   * `DELETE /auth/sessions` (doc 07 §7.7 : "déconnecter tous les autres
   * appareils") — révoque toutes les sessions actives **sauf** celle
   * identifiée par `exceptId` (la session courante, si connue).
   */
  revokeAllUserRefreshTokensExcept(userId: string, exceptId: string | undefined) {
    return RefreshTokenModel.updateMany(
      { userId, revokedAt: null, ...(exceptId ? { _id: { $ne: exceptId } } : {}) },
      { revokedAt: new Date() },
    );
  }

  createPasswordResetToken(input: CreatePasswordResetTokenInput) {
    return PasswordResetTokenModel.create(input);
  }

  findPasswordResetTokenByHash(tokenHash: string) {
    return PasswordResetTokenModel.findOne({ tokenHash });
  }

  markPasswordResetTokenUsed(id: string) {
    return PasswordResetTokenModel.updateOne({ _id: id }, { usedAt: new Date() });
  }
}
