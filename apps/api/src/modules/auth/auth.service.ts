import argon2 from 'argon2';
import type { HydratedDocument } from 'mongoose';

import type { UserDocument } from '../../database/models/user.model.js';
import type { EmailJobData } from '../../jobs/queues.js';
import { DEFAULT_LOCALE } from '../../middlewares/i18n.middleware.js';
import { ConflictError, UnauthorizedError } from '../../shared/errors/index.js';
import { passwordChangedEmailTemplate } from '../notifications/email-templates/passwordChanged.template.js';
import { passwordResetEmailTemplate } from '../notifications/email-templates/passwordReset.template.js';
import { twoFactorStatusChangedEmailTemplate } from '../notifications/email-templates/twoFactorStatusChanged.template.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { AuthRepository } from './auth.repository.js';
import type { ForgotPasswordDto, LoginDto } from './auth.validators.js';
import { decodeExpiredAccessToken, signAccessToken, type AccessTokenPayload } from './jwt.js';
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from './passwordResetToken.util.js';
import { generateRecoveryCodes, hashRecoveryCode } from './recoveryCode.util.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_MS,
} from './refreshToken.util.js';
import { generateTotpQrCodeDataUrl, generateTotpSecret, verifyTotpCode } from './totp.util.js';
import { decryptTwoFactorSecret, encryptTwoFactorSecret } from './twoFactorSecret.util.js';
import {
  signTwoFactorChallengeToken,
  verifyTwoFactorChallengeToken,
} from './twoFactorChallengeToken.js';

/** Partagé par `login()` et `refresh()` — même besoin (traçabilité de session, doc 05 §"refreshTokens"). */
export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface LoginSessionResult {
  requires2FA?: false;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: Record<string, unknown>;
  tenants: { tenantId: string; role: string; membershipId: string }[];
}

/** doc 07 §7.3 : réponse intermédiaire quand `users.twoFactorEnabled` est vrai — pas de session émise avant `verifyTwoFactor`. */
export interface LoginChallengeResult {
  requires2FA: true;
  challengeToken: string;
}

export type LoginOutcome = LoginSessionResult | LoginChallengeResult;

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface EnableTwoFactorResult {
  qrCodeDataUrl: string;
  // Saisie manuelle (UX standard des apps d'authentification : "impossible
  // de scanner ? entrez ce code") — pas explicitement listé au doc 07 §7.6,
  // mais une omission aurait rendu l'activation impossible sans scanner
  // physiquement un QR Code (donc aussi non testable de bout en bout).
  secret: string;
  recoveryCodes: string[];
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
 * Login (doc 07 §7.3).
 *
 * `permissionsVersion` fixé à `0` : le suivi réel du compteur (doc 07 §7.2,
 * doc 08) arrive avec RBAC (Feature 1.4), pas anticipé ici.
 */
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authRepository: AuthRepository,
    private readonly jwtSecret: string,
    // Enfilage injecté (pas un import direct de `jobs/queues.ts`) pour que
    // ce service reste testable unitairement sans connexion BullMQ/Redis
    // réelle — même logique que `jwtSecret` en paramètre plutôt que
    // `getEnv()` interne.
    private readonly enqueueEmailJob: (data: EmailJobData) => Promise<void>,
    // Clé AES-256-GCM de `users.twoFactorSecret` (doc 07 §7.6, doc 13
    // §13.6) — même convention d'injection que `jwtSecret`.
    private readonly twoFactorEncryptionKey: string,
  ) {}

  async login(dto: LoginDto, meta: RequestMeta): Promise<LoginOutcome> {
    const user = await this.usersRepository.findByEmailWithPasswordHash(dto.email);

    const passwordValid = await argon2.verify(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      dto.password,
    );
    if (!user || !passwordValid) {
      throw new UnauthorizedError('AUTH_INVALID_CREDENTIALS', 'Email ou mot de passe incorrect.');
    }

    // 2FA activée (doc 07 §7.3, §7.6) : pas de session émise tout de suite —
    // le client doit d'abord présenter un code TOTP/récupération valide via
    // `POST /auth/2fa/verify` avec ce `challengeToken` de courte durée.
    if (user.twoFactorEnabled) {
      const challengeToken = signTwoFactorChallengeToken(user._id.toString(), this.jwtSecret);
      return { requires2FA: true, challengeToken };
    }

    return this.issueSession(user, meta);
  }

  /**
   * `POST /auth/2fa/verify` (doc 07 §7.3) : seconde étape du login quand la
   * 2FA est activée. Accepte soit un code TOTP courant, soit l'un des 10
   * codes de récupération non consommés (doc 07 §7.6) — dans ce dernier
   * cas, le code est marqué utilisé (jamais réutilisable).
   */
  async verifyTwoFactor(
    challengeToken: string,
    code: string,
    meta: RequestMeta,
  ): Promise<LoginSessionResult> {
    let userId: string;
    try {
      ({ userId } = verifyTwoFactorChallengeToken(challengeToken, this.jwtSecret));
    } catch {
      throw new UnauthorizedError(
        'AUTH_2FA_CHALLENGE_INVALID',
        'Session de connexion invalide ou expirée.',
      );
    }

    const user = await this.usersRepository.findByIdWithTwoFactorSecret(userId);
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedError(
        'AUTH_2FA_CHALLENGE_INVALID',
        'Session de connexion invalide ou expirée.',
      );
    }

    const secret = decryptTwoFactorSecret(user.twoFactorSecret, this.twoFactorEncryptionKey);
    if (!(await verifyTotpCode(code, secret))) {
      const codeHash = hashRecoveryCode(code);
      const matchingRecoveryCode = user.twoFactorRecoveryCodes.find(
        (recoveryCode) => recoveryCode.codeHash === codeHash && recoveryCode.usedAt === null,
      );
      if (!matchingRecoveryCode) {
        throw new UnauthorizedError('AUTH_2FA_INVALID_CODE', 'Code de vérification incorrect.');
      }
      await this.usersRepository.markRecoveryCodeUsed(userId, codeHash);
    }

    return this.issueSession(user, meta);
  }

  /**
   * `POST /auth/2fa/enable` (doc 07 §7.6) : génère un secret TOTP + 10 codes
   * de récupération, les stocke (secret chiffré, codes hashés), mais
   * n'active **pas** encore la 2FA — `confirmTwoFactor` doit valider un
   * premier code avant que `twoFactorEnabled` ne passe à `true`, pour ne
   * jamais activer un secret que l'utilisateur n'a pas fini de configurer.
   */
  async enableTwoFactor(userId: string): Promise<EnableTwoFactorResult> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedError('AUTH_TOKEN_INVALID', 'Session invalide.');
    }
    if (user.twoFactorEnabled) {
      throw new ConflictError(
        'AUTH_2FA_ALREADY_ENABLED',
        'La double authentification est déjà activée.',
      );
    }

    const secret = generateTotpSecret();
    const recoveryCodes = generateRecoveryCodes();

    await this.usersRepository.setPendingTwoFactorSecret(
      userId,
      encryptTwoFactorSecret(secret, this.twoFactorEncryptionKey),
      recoveryCodes.map(hashRecoveryCode),
    );

    const qrCodeDataUrl = await generateTotpQrCodeDataUrl(user.email, secret);

    return { qrCodeDataUrl, secret, recoveryCodes };
  }

  /**
   * `POST /auth/2fa/confirm` (doc 07 §7.6) : vérifie un premier code TOTP
   * contre le secret généré par `enableTwoFactor`, puis active
   * effectivement la 2FA. Révoque toutes les sessions actives et notifie
   * par email (doc 07 §7.7 : toute activation/désactivation 2FA déclenche
   * une révocation globale + notification de sécurité).
   */
  async confirmTwoFactor(userId: string, code: string): Promise<void> {
    const user = await this.usersRepository.findByIdWithTwoFactorSecret(userId);
    if (!user || !user.twoFactorSecret) {
      throw new UnauthorizedError(
        'AUTH_2FA_NOT_ENABLED',
        "La double authentification n'a pas été initialisée.",
      );
    }
    if (user.twoFactorEnabled) {
      throw new ConflictError(
        'AUTH_2FA_ALREADY_ENABLED',
        'La double authentification est déjà activée.',
      );
    }

    const secret = decryptTwoFactorSecret(user.twoFactorSecret, this.twoFactorEncryptionKey);
    if (!(await verifyTotpCode(code, secret))) {
      throw new UnauthorizedError('AUTH_2FA_INVALID_CODE', 'Code de vérification incorrect.');
    }

    await this.usersRepository.confirmTwoFactor(userId);
    await this.authRepository.revokeAllUserRefreshTokens(userId);
    await this.sendTwoFactorStatusEmail(user, true);
  }

  /**
   * `POST /auth/2fa/disable` (doc 07 §7.6) : exige le mot de passe **et**
   * un code valide (défense en profondeur — un Access Token volé seul ne
   * suffit pas à désactiver la 2FA). Efface le secret et les codes de
   * récupération, révoque toutes les sessions actives, notifie par email.
   */
  async disableTwoFactor(userId: string, password: string, code: string): Promise<void> {
    const user = await this.usersRepository.findByIdWithPasswordAndTwoFactorSecret(userId);
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedError(
        'AUTH_2FA_NOT_ENABLED',
        "La double authentification n'est pas activée.",
      );
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);
    if (!passwordValid) {
      throw new UnauthorizedError('AUTH_INVALID_CREDENTIALS', 'Mot de passe incorrect.');
    }

    const secret = decryptTwoFactorSecret(user.twoFactorSecret, this.twoFactorEncryptionKey);
    const isValidTotp = await verifyTotpCode(code, secret);
    const codeHash = hashRecoveryCode(code);
    const isValidRecoveryCode = user.twoFactorRecoveryCodes.some(
      (recoveryCode) => recoveryCode.codeHash === codeHash && recoveryCode.usedAt === null,
    );
    if (!isValidTotp && !isValidRecoveryCode) {
      throw new UnauthorizedError('AUTH_2FA_INVALID_CODE', 'Code de vérification incorrect.');
    }

    await this.usersRepository.disableTwoFactor(userId);
    await this.authRepository.revokeAllUserRefreshTokens(userId);
    await this.sendTwoFactorStatusEmail(user, false);
  }

  private async sendTwoFactorStatusEmail(
    user: HydratedDocument<UserDocument>,
    enabled: boolean,
  ): Promise<void> {
    const locale = user.preferredLocale ?? DEFAULT_LOCALE;
    const { subject, html, text } = twoFactorStatusChangedEmailTemplate(locale, enabled);
    await this.enqueueEmailJob({ to: user.email, subject, html, text });
  }

  /**
   * Résolution du contexte tenant + émission de la session (doc 07 §7.3) —
   * partagée par `login` (pas de 2FA) et `verifyTwoFactor` (2FA validée),
   * pour ne jamais dupliquer la logique de résolution des memberships/
   * émission des tokens entre les deux chemins.
   */
  private async issueSession(
    user: HydratedDocument<UserDocument>,
    meta: RequestMeta,
  ): Promise<LoginSessionResult> {
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
   * L'email est enfilé (BullMQ, `jobs/queues.ts`) plutôt qu'envoyé en
   * synchrone : un worker séparé (`workers/email.worker.ts`) le consomme,
   * la requête HTTP ne dépend jamais de la latence/disponibilité de Brevo.
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

    const resetLink = `https://app.quicktable.io/reset-password?token=${rawToken}`;
    const locale = user.preferredLocale ?? DEFAULT_LOCALE;
    const { subject, html, text } = passwordResetEmailTemplate(locale, resetLink);
    await this.enqueueEmailJob({ to: user.email, subject, html, text });
  }

  /**
   * `POST /auth/reset-password` (doc 07 §7.5) : vérifie le token à usage
   * unique, met à jour `passwordHash`, puis révoque **toutes** les sessions
   * actives de l'utilisateur (déconnexion de sécurité, différent du
   * `logout` qui ne révoque que la session courante), puis enfile une
   * notification de confirmation par email.
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

    const user = await this.usersRepository.findById(userId);
    if (user) {
      const locale = user.preferredLocale ?? DEFAULT_LOCALE;
      const { subject, html, text } = passwordChangedEmailTemplate(locale);
      await this.enqueueEmailJob({ to: user.email, subject, html, text });
    }
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
