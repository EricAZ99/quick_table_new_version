import { MembershipModel } from '../../database/models/membership.model.js';
import { RefreshTokenModel } from '../../database/models/refreshToken.model.js';
import { ALLOW_CROSS_TENANT_OPTION } from '../../database/models/plugins/tenantScope.js';

export interface CreateRefreshTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  deviceInfo?: { userAgent?: string; ip?: string; deviceLabel?: string };
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
}
