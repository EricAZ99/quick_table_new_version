import type { Request, Response } from 'express';

import { UnauthorizedError, ValidationError } from '../../shared/errors/index.js';
import type { AuthService, LoginSessionResult } from './auth.service.js';
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  twoFactorConfirmSchema,
  twoFactorDisableSchema,
  twoFactorVerifySchema,
} from './auth.validators.js';
import { resetLoginRateLimit } from './login-rate-limit.js';

const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';

/** Controller (doc 12 §12.2) : HTTP <-> DTO, réponse standard (doc 09 §9.1). */
export class AuthController {
  constructor(
    private readonly service: AuthService,
    /** `false` en dev local (HTTP) : un cookie `Secure` ne serait ni posé ni renvoyé par un vrai navigateur en clair (doc 07 §7.1). */
    private readonly secureCookies: boolean,
  ) {}

  login = async (req: Request, res: Response): Promise<void> => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        'AUTH_INVALID_PAYLOAD',
        'Email ou mot de passe manquant ou invalide.',
        parsed.error.issues,
      );
    }

    const result = await this.service.login(parsed.data, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Reset le verrouillage progressif (doc 07 §7.3) avant d'écrire la
    // réponse : un login réussi (y compris "en attente du code 2FA") ne
    // doit pas laisser le compteur d'échecs entamé par de précédentes
    // tentatives infructueuses du même (email, IP).
    await resetLoginRateLimit(req);

    // 2FA activée (doc 07 §7.3) : pas de session/cookie encore — le client
    // doit d'abord appeler `/2fa/verify` avec ce `challengeToken`.
    if (result.requires2FA) {
      res
        .status(200)
        .json({
          success: true,
          data: { requires2FA: true, challengeToken: result.challengeToken },
        });
      return;
    }

    this.respondWithSession(res, result);
  };

  /** `POST /auth/2fa/verify` (doc 07 §7.3) — seconde étape du login quand la 2FA est activée. */
  verifyTwoFactor = async (req: Request, res: Response): Promise<void> => {
    const parsed = twoFactorVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        'AUTH_INVALID_PAYLOAD',
        'challengeToken ou code manquant ou invalide.',
        parsed.error.issues,
      );
    }

    const result = await this.service.verifyTwoFactor(
      parsed.data.challengeToken,
      parsed.data.code,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );

    this.respondWithSession(res, result);
  };

  /** `POST /auth/2fa/enable` (doc 07 §7.6) — nécessite `requireAuth` (route protégée). */
  enableTwoFactor = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.enableTwoFactor(this.requireUserId(req));

    res.status(200).json({
      success: true,
      data: {
        qrCodeDataUrl: result.qrCodeDataUrl,
        secret: result.secret,
        recoveryCodes: result.recoveryCodes,
      },
    });
  };

  /** `POST /auth/2fa/confirm` (doc 07 §7.6) — nécessite `requireAuth`. */
  confirmTwoFactor = async (req: Request, res: Response): Promise<void> => {
    const parsed = twoFactorConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        'AUTH_INVALID_PAYLOAD',
        'code manquant ou invalide.',
        parsed.error.issues,
      );
    }

    await this.service.confirmTwoFactor(this.requireUserId(req), parsed.data.code);

    res.status(200).json({ success: true, data: null });
  };

  /** `POST /auth/2fa/disable` (doc 07 §7.6) — nécessite `requireAuth`. */
  disableTwoFactor = async (req: Request, res: Response): Promise<void> => {
    const parsed = twoFactorDisableSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        'AUTH_INVALID_PAYLOAD',
        'password ou code manquant ou invalide.',
        parsed.error.issues,
      );
    }

    await this.service.disableTwoFactor(
      this.requireUserId(req),
      parsed.data.password,
      parsed.data.code,
    );

    res.status(200).json({ success: true, data: null });
  };

  /**
   * `POST /auth/refresh` (doc 07 §7.4) : lit le cookie `refreshToken`
   * httpOnly posé au login et l'Access Token (même expiré) via
   * `Authorization: Bearer` — nécessaire pour reconstruire le contexte
   * tenant de la session (voir `AuthService#refresh`).
   */
  refresh = async (req: Request, res: Response): Promise<void> => {
    const authHeader = req.headers.authorization;
    const expiredAccessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

    const result = await this.service.refresh(this.getRefreshTokenCookie(req), expiredAccessToken, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    this.setRefreshTokenCookie(res, result.refreshToken, result.refreshTokenExpiresAt);

    res.status(200).json({ success: true, data: { accessToken: result.accessToken } });
  };

  /**
   * `POST /auth/logout` (doc 07 §7.10) : révoque uniquement la session
   * courante — idempotent, jamais d'erreur même sans cookie ou sur un
   * token déjà révoqué (`AuthService#logout`).
   */
  logout = async (req: Request, res: Response): Promise<void> => {
    await this.service.logout(this.getRefreshTokenCookie(req));

    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: '/' });
    res.status(204).send();
  };

  /**
   * `POST /auth/forgot-password` (doc 07 §7.5) — répond toujours `200`
   * identique, que l'email existe ou non (anti-énumération) : le
   * controller ne distingue jamais les deux cas, `AuthService#forgotPassword`
   * ne lève aucune erreur.
   */
  forgotPassword = async (req: Request, res: Response): Promise<void> => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        'AUTH_INVALID_PAYLOAD',
        'Email manquant ou invalide.',
        parsed.error.issues,
      );
    }

    await this.service.forgotPassword(parsed.data);

    res.status(200).json({ success: true, data: null });
  };

  /** `POST /auth/reset-password` (doc 07 §7.5). */
  resetPassword = async (req: Request, res: Response): Promise<void> => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        'AUTH_INVALID_PAYLOAD',
        'Token ou nouveau mot de passe manquant ou invalide.',
        parsed.error.issues,
      );
    }

    await this.service.resetPassword(parsed.data.token, parsed.data.newPassword);

    res.status(200).json({ success: true, data: null });
  };

  /** Réponse commune `login` (sans 2FA) / `2fa/verify` — pose le cookie et renvoie la session. */
  private respondWithSession(res: Response, result: LoginSessionResult): void {
    this.setRefreshTokenCookie(res, result.refreshToken, result.refreshTokenExpiresAt);

    res.status(200).json({
      success: true,
      data: { accessToken: result.accessToken, user: result.user, tenants: result.tenants },
    });
  }

  /**
   * `req.auth` est posé par `requireAuth` (`middlewares/auth.middleware.ts`)
   * sur les routes 2FA `enable`/`confirm`/`disable` — absent uniquement si
   * la route a été mal câblée (bug de câblage, pas un cas utilisateur).
   */
  private requireUserId(req: Request): string {
    if (!req.auth) {
      throw new UnauthorizedError('AUTH_TOKEN_MISSING', 'Authentification requise.');
    }
    return req.auth.sub;
  }

  private getRefreshTokenCookie(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const value = cookies?.[REFRESH_TOKEN_COOKIE_NAME];
    return typeof value === 'string' ? value : undefined;
  }

  private setRefreshTokenCookie(res: Response, refreshToken: string, expiresAt: Date): void {
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: this.secureCookies,
      sameSite: 'strict',
      expires: expiresAt,
    });
  }
}
