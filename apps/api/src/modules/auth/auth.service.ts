import argon2 from 'argon2';

import { UnauthorizedError } from '../../shared/errors/index.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { AuthRepository } from './auth.repository.js';
import type { LoginDto } from './auth.validators.js';
import { signAccessToken, type AccessTokenPayload } from './jwt.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_MS,
} from './refreshToken.util.js';

export interface LoginRequestMeta {
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

  async login(dto: LoginDto, meta: LoginRequestMeta): Promise<LoginResult> {
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

    const rawRefreshToken = generateRefreshToken();
    const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await this.authRepository.createRefreshToken({
      userId: user._id.toString(),
      tokenHash: hashRefreshToken(rawRefreshToken),
      expiresAt: refreshTokenExpiresAt,
      deviceInfo: { userAgent: meta.userAgent, ip: meta.ip },
    });

    user.lastLoginAt = new Date();
    await user.save();

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      refreshTokenExpiresAt,
      user: user.toJSON() as unknown as Record<string, unknown>,
      tenants: memberships.map((membership) => ({
        tenantId: membership.tenantId,
        role: membership.role,
        membershipId: membership.id,
      })),
    };
  }
}
