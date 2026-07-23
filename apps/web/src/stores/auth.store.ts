import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { apiRequest, apiRequestWithMeta, ApiError } from '@/shared/apiClient';

interface LoginSessionData {
  accessToken: string;
  user: Record<string, unknown>;
  tenants: { tenantId: string; role: string; membershipId: string }[];
}

interface LoginChallengeData {
  requires2FA: true;
  challengeToken: string;
}

type LoginOutcome = (LoginSessionData & { requires2FA?: false }) | LoginChallengeData;

/**
 * Codes d'erreur (doc 07 §7.9) qui signifient "l'Access Token n'est plus
 * exploitable" — seuls ceux-là déclenchent une tentative de rafraîchissement
 * silencieux dans `authorizedFetch`, jamais un échec métier (ex. RBAC).
 */
const EXPIRED_TOKEN_CODES = new Set(['AUTH_TOKEN_MISSING', 'AUTH_TOKEN_INVALID']);

/**
 * Décode le claim `role` du payload JWT (doc 07, `AccessTokenPayload`,
 * `apps/api/src/modules/auth/jwt.ts`) sans vérifier la signature — usage
 * UI uniquement (afficher/masquer un lien de nav), jamais un contrôle
 * d'accès réel (celui-ci reste entièrement côté serveur, `requirePermission`).
 * Nécessaire car `tenants` (posé par `login`/`verifyTwoFactor`) ne survit
 * pas à un rechargement de page : `POST /auth/refresh` ne renvoie qu'un
 * `accessToken` (cf. commentaire `restoreSession` ci-dessous), alors que le
 * claim `role` qu'il contient est lui bien préservé d'un refresh à l'autre
 * (`auth.service.ts#refresh` : `role: previousPayload.role`).
 */
function decodeRoleFromAccessToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) return null;
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const payload = JSON.parse(json) as { role?: string | null };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

/**
 * État d'authentification (doc 07) — premier vrai besoin d'un store partagé
 * entre plusieurs composants (`LoginScreen`/`RestaurantSettingsScreen`),
 * Pinia introduit ici pour cette raison (`main.ts`, doc 03 §3.2).
 *
 * `accessToken` reste en mémoire uniquement (jamais `localStorage`, doc 07
 * §7.2 : réduit la surface de vol par XSS) — perdu au rechargement de page,
 * `restoreSession()` le reconstruit silencieusement via le cookie
 * `refreshToken` (httpOnly, posé par le serveur) si la session est encore
 * valide. `POST /auth/refresh` ne renvoie qu'un `accessToken` (doc 07 §7.4,
 * `auth.controller.ts#refresh`) — jamais `user`/`tenants` — c'est pourquoi
 * aucun écran de ce ticket n'affiche l'identité de l'utilisateur connecté,
 * uniquement une action de déconnexion.
 */
export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null);
  const tenants = ref<{ tenantId: string; role: string; membershipId: string }[]>([]);
  const pendingChallengeToken = ref<string | null>(null);

  const isAuthenticated = computed(() => accessToken.value !== null);
  const role = computed(() => decodeRoleFromAccessToken(accessToken.value));

  async function login(email: string, password: string): Promise<{ requires2FA: boolean }> {
    const result = await apiRequest<LoginOutcome>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (result.requires2FA) {
      pendingChallengeToken.value = result.challengeToken;
      return { requires2FA: true };
    }

    applySession(result);
    return { requires2FA: false };
  }

  async function verifyTwoFactor(code: string): Promise<void> {
    if (!pendingChallengeToken.value) {
      throw new ApiError(
        'AUTH_2FA_CHALLENGE_INVALID',
        'Session de connexion invalide ou expirée, veuillez vous reconnecter.',
      );
    }
    const result = await apiRequest<LoginSessionData>('/api/v1/auth/2fa/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeToken: pendingChallengeToken.value, code }),
    });
    applySession(result);
    pendingChallengeToken.value = null;
  }

  async function logout(): Promise<void> {
    // Idempotent côté serveur (`auth.service.ts#logout`) — best-effort, la
    // session locale est purgée même si l'appel réseau échoue.
    await apiRequest('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearSession();
  }

  /** `POST /auth/refresh` (doc 07 §7.4) — s'appuie sur le cookie `refreshToken`, jamais transmis explicitement (httpOnly). */
  async function restoreSession(): Promise<boolean> {
    try {
      const result = await apiRequest<{ accessToken: string }>('/api/v1/auth/refresh', {
        method: 'POST',
      });
      accessToken.value = result.accessToken;
      return true;
    } catch {
      clearSession();
      return false;
    }
  }

  /**
   * Requête authentifiée avec un seul essai de rafraîchissement silencieux
   * en cas d'Access Token expiré/absent (doc 07 §7.4) — jamais de boucle,
   * un échec après ce second essai est propagé tel quel à l'appelant.
   */
  async function authorizedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    return withRefreshRetry(() =>
      apiRequest<T>(path, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${accessToken.value ?? ''}` },
      }),
    );
  }

  /** Même comportement qu'`authorizedFetch`, pour les endpoints paginés exposant `meta` (doc 09 §9.2). */
  async function authorizedFetchWithMeta<T, M>(
    path: string,
    init: RequestInit = {},
  ): Promise<{ data: T; meta: M }> {
    return withRefreshRetry(() =>
      apiRequestWithMeta<T, M>(path, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${accessToken.value ?? ''}` },
      }),
    );
  }

  async function withRefreshRetry<T>(attempt: () => Promise<T>): Promise<T> {
    try {
      return await attempt();
    } catch (error) {
      if (
        error instanceof ApiError &&
        EXPIRED_TOKEN_CODES.has(error.code) &&
        (await restoreSession())
      ) {
        return await attempt();
      }
      throw error;
    }
  }

  function applySession(session: LoginSessionData): void {
    accessToken.value = session.accessToken;
    tenants.value = session.tenants;
  }

  function clearSession(): void {
    accessToken.value = null;
    tenants.value = [];
    pendingChallengeToken.value = null;
  }

  return {
    accessToken,
    tenants,
    isAuthenticated,
    role,
    login,
    verifyTwoFactor,
    logout,
    restoreSession,
    authorizedFetch,
    authorizedFetchWithMeta,
  };
});
