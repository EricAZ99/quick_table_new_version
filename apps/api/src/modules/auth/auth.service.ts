import argon2 from 'argon2';

import { logger } from '../../logger/logger.js';
import { UnauthorizedError } from '../../shared/errors/index.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { AuthRepository } from './auth.repository.js';
import type { ForgotPasswordDto, LoginDto } from './auth.validators.js';
import { decodeExpiredAccessToken, signAccessToken, type AccessTokenPayload } from './jwt.js';
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from './passwordResetToken.util.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_MS,
} from './refreshToken.util.js';

/** Partagé par `login()` et `refresh()` — même besoin (traçabilité de session, doc 05 §"refreshTokens"). */
export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: Record<string, unknown>;
  tenants: { tenantId: string; role: string; membershipId: string }[];
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

/**
 * Hash Argon2id précalculé d'un mot de passe factice, jamais utilisé pour
 * un vrai compte — sert uniquement à maintenir un temps de réponse
 * constant quand l'email n'existe pas (`argon2.verify` est toujours
 * appelé, même sans utilisateur trouvé), pour ne pas révéler par la
 * latence qu'un compte existe ou non. Même principe d'anti-énumération
 * que doc 07 §7.5 (forgot-password), étendu ici au login.
 */
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$HT4hh0D0S/DMU/vlPRSoiA$Ch1RTnF3b0dwS23SaaB/gMbHyH2X+XozTWd8Aayy2xQ';

/**
 * Login (doc 07 §7.3). La branche 2FA du diagramme de séquence
 * (`requires2FA: true, challengeToken`) n'est volontairement pas
 * implémentée ici : `users.twoFactorEnabled` vaut toujours `false`
 * aujourd'hui (aucun endpoint `/auth/2fa/enable` n'existe encore, Feature
 * 1.2 ticket séparé) — la brancher maintenant serait construire un chemin
 * mort, pas testable de bout en bout (doc 14 §14.5 KISS).
 *
 * `permissionsVersion` fixé à `0` : le suivi réel du compteur (doc 07 §7.2,
 * doc 08) arrive avec RBAC (Feature 1.4), pas anticipé ici.
 */
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authRepository: AuthRepository,
    private readonly jwtSecret: string,
  ) {}

  async login(dto: LoginDto, meta: RequestMeta): Promise<LoginResult> {
    const user = await this.usersRepository.findByEmailWithPasswordHash(dto.email);

    const passwordValid = await argon2.verify(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      dto.password,
    );
    if (!user || !passwordValid) {
      throw new UnauthorizedError('AUTH_INVALID_CREDENTIALS', 'Email ou mot de passe incorrect.');
    }

    const memberships = await this.authRepository.findMembershipsByUserId(user._id.toString());

    // Un seul tenant -> contexte immédiatement résolu dans le token ; 0 ou
    // 2+ -> tenantId/role/membershipId restent null, `tenants[]` liste les
    // options disponibles (doc 07 §7.3 : "la réponse de login liste les
    // tenants disponibles" ; le choix actif via `POST /auth/select-tenant`
    // n'est pas construit dans ce ticket).
    let tenantId: string | null = null;
    let role: AccessTokenPayload['role'] = null;
    let membershipId: string | null = null;
    const [onlyMembership] = memberships;
    if (memberships.length === 1 && onlyMembership) {
      tenantId = onlyMembership.tenantId;
      role = onlyMembership.role;
      membershipId = onlyMembership.id;
    }

    const payload: AccessTokenPayload = {
      sub: user._id.toString(),
      membershipId,
      tenantId,
      role,
      isSuperAdmin: user.isSuperAdmin,
      permissionsVersion: 0,
    };
    const accessToken = signAccessToken(payload, this.jwtSecret);
    const { refreshToken, refreshTokenExpiresAt } = await this.issueRefreshToken(
      user._id.toString(),
      meta,
    );

    user.lastLoginAt = new Date();
    await user.save();

    return {
      accessToken,
      refreshToken,
      refreshTokenExpiresAt,
      user: user.toJSON() as unknown as Record<string, unknown>,
      tenants: memberships.map((membership) => ({
        tenantId: membership.tenantId,
        role: membership.role,
        membershipId: membership.id,
      })),
    };
  }

  /**
   * Rotation du refresh token (doc 07 §7.1/§7.4). Contexte tenant
   * (`tenantId`/`role`/`membershipId`) repris tel quel depuis l'ancien
   * Access Token (même expiré — seule sa signature est vérifiée, doc 06
   * §6.3 : le contexte actif persiste jusqu'à un changement explicite via
   * `POST /auth/select-tenant`, pas re-résolu à chaque refresh) — décision
   * validée explicitement pour ce ticket.
   */
  async refresh(
    rawRefreshToken: string | undefined,
    expiredAccessToken: string | undefined,
    meta: RequestMeta,
  ): Promise<RefreshResult> {
    if (!rawRefreshToken || !expiredAccessToken) {
      throw new UnauthorizedError('AUTH_REFRESH_TOKEN_INVALID', 'Session invalide.');
    }

    let previousPayload: AccessTokenPayload;
    try {
      previousPayload = decodeExpiredAccessToken(expiredAccessToken, this.jwtSecret);
    } catch {
      throw new UnauthorizedError('AUTH_REFRESH_TOKEN_INVALID', 'Session invalide.');
    }

    const tokenHash = hashRefreshToken(rawRefreshToken);
    const storedToken = await this.authRepository.findRefreshTokenByHash(tokenHash);

    if (!storedToken || storedToken.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError('AUTH_REFRESH_TOKEN_INVALID', 'Session invalide.');
    }

    // Le refresh token doit appartenir au même utilisateur que l'Access
    // Token présenté — un couple dépareillé (vol partiel, erreur client)
    // ne doit jamais permettre de rejouer la session d'un autre.
    if (storedToken.userId.toString() !== previousPayload.sub) {
      throw new UnauthorizedError('AUTH_REFRESH_TOKEN_INVALID', 'Session invalide.');
    }

    if (storedToken.revokedAt !== null) {
      // Rejeu d'un token déjà révoqué = signe de vol (doc 07 §7.1) :
      // révoque toute la famille. L'envoi d'une notification de sécurité
      // (doc 07 §7.1) est hors périmètre — aucun système d'envoi d'email
      // n'existe encore (arrive avec un ticket séparé de cette Feature).
      await this.authRepository.revokeAllUserRefreshTokens(storedToken.userId.toString());
      throw new UnauthorizedError('AUTH_REFRESH_TOKEN_REUSED', 'Session invalide.');
    }

    await this.authRepository.revokeRefreshToken(storedToken.id);

    const payload: AccessTokenPayload = {
      sub: previousPayload.sub,
      membershipId: previousPayload.membershipId,
      tenantId: previousPayload.tenantId,
      role: previousPayload.role,
      isSuperAdmin: previousPayload.isSuperAdmin,
      permissionsVersion: previousPayload.permissionsVersion,
    };
    const accessToken = signAccessToken(payload, this.jwtSecret);
    const { refreshToken, refreshTokenExpiresAt } = await this.issueRefreshToken(
      storedToken.userId.toString(),
      meta,
    );

    return { accessToken, refreshToken, refreshTokenExpiresAt };
  }

  /**
   * Révocation de la session courante (doc 07 §7.10) — idempotent : pas de
   * cookie, token inconnu ou déjà révoqué ne sont jamais des erreurs (un
   * logout "à vide" est un no-op réussi, pas un échec). Ne révoque que
   * *cette* session, contrairement à `revokeAllUserRefreshTokens` (rejeu
   * détecté au refresh) ou à la révocation globale de `reset-password`
   * (doc 07 §7.5, ticket séparé).
   */
  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }

    const tokenHash = hashRefreshToken(rawRefreshToken);
    const storedToken = await this.authRepository.findRefreshTokenByHash(tokenHash);
    if (storedToken && storedToken.revokedAt === null) {
      await this.authRepository.revokeRefreshToken(storedToken.id);
    }
  }

  /**
   * `POST /auth/forgot-password` (doc 07 §7.5) — anti-énumération : répond
   * toujours de la même façon (aucune valeur de retour, jamais d'erreur)
   * que l'email existe ou non, le controller renvoie systématiquement 200.
   *
   * Envoi d'email hors périmètre de ce ticket : aucun worker
   * Nodemailer/Brevo n'existe encore (ticket séparé de cette Feature). En
   * attendant, le lien de réinitialisation est loggé — un contributeur qui
   * teste le flux en local/staging peut le récupérer dans les logs, pas
   * dans sa boîte mail.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.usersRepository.findByEmail(dto.email);
    if (!user) {
      return;
    }

    const rawToken = generatePasswordResetToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
    await this.authRepository.createPasswordResetToken({
      userId: user._id.toString(),
      tokenHash: hashPasswordResetToken(rawToken),
      expiresAt,
    });

    logger.info(
      {
        userId: user._id.toString(),
        resetLink: `https://app.quicktable.io/reset-password?token=${rawToken}`,
      },
      "Lien de réinitialisation de mot de passe généré (email non envoyé — worker d'envoi pas encore construit)",
    );
  }

  /**
   * `POST /auth/reset-password` (doc 07 §7.5) : vérifie le token à usage
   * unique, met à jour `passwordHash`, puis révoque **toutes** les sessions
   * actives de l'utilisateur (déconnexion de sécurité, différent du
   * `logout` qui ne révoque que la session courante). Notification de
   * confirmation par email hors périmètre (même raison que
   * `forgotPassword`).
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashPasswordResetToken(rawToken);
    const storedToken = await this.authRepository.findPasswordResetTokenByHash(tokenHash);

    if (
      !storedToken ||
      storedToken.usedAt !== null ||
      storedToken.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedError(
        'AUTH_RESET_TOKEN_INVALID',
        'Lien de réinitialisation invalide ou expiré.',
      );
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    const userId = storedToken.userId.toString();
    await this.usersRepository.updatePasswordHash(userId, passwordHash);
    await this.authRepository.markPasswordResetTokenUsed(storedToken.id);
    await this.authRepository.revokeAllUserRefreshTokens(userId);
  }

  private async issueRefreshToken(
    userId: string,
    meta: RequestMeta,
  ): Promise<{ refreshToken: string; refreshTokenExpiresAt: Date }> {
    const refreshToken = generateRefreshToken();
    const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await this.authRepository.createRefreshToken({
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiresAt,
      deviceInfo: { userAgent: meta.userAgent, ip: meta.ip },
    });
    return { refreshToken, refreshTokenExpiresAt };
  }
}
