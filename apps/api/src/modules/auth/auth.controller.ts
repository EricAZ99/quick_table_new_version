import type { Request, Response } from 'express';

import { ValidationError } from '../../shared/errors/index.js';
import type { AuthService } from './auth.service.js';
import { loginSchema } from './auth.validators.js';
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
    // réponse : un login réussi ne doit pas laisser le compteur d'échecs
    // entamé par de précédentes tentatives infructueuses du même (email, IP).
    await resetLoginRateLimit(req);

    this.setRefreshTokenCookie(res, result.refreshToken, result.refreshTokenExpiresAt);

    res.status(200).json({
      success: true,
      data: { accessToken: result.accessToken, user: result.user, tenants: result.tenants },
    });
  };

  /**
   * `POST /auth/refresh` (doc 07 §7.4) : lit le cookie `refreshToken`
   * httpOnly posé au login et l'Access Token (même expiré) via
   * `Authorization: Bearer` — nécessaire pour reconstruire le contexte
   * tenant de la session (voir `AuthService#refresh`).
   */
  refresh = async (req: Request, res: Response): Promise<void> => {
    const rawRefreshToken = req.cookies as Record<string, unknown> | undefined;
    const refreshTokenCookie = rawRefreshToken?.[REFRESH_TOKEN_COOKIE_NAME];
    const authHeader = req.headers.authorization;
    const expiredAccessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

    const result = await this.service.refresh(
      typeof refreshTokenCookie === 'string' ? refreshTokenCookie : undefined,
      expiredAccessToken,
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );

    this.setRefreshTokenCookie(res, result.refreshToken, result.refreshTokenExpiresAt);

    res.status(200).json({ success: true, data: { accessToken: result.accessToken } });
  };

  private setRefreshTokenCookie(res: Response, refreshToken: string, expiresAt: Date): void {
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: this.secureCookies,
      sameSite: 'strict',
      expires: expiresAt,
    });
  }
}
