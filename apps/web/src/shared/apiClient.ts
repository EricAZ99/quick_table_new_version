import { i18n } from '@/plugins/i18n.plugin';

interface ApiSuccessBody<T> {
  success: true;
  data: T;
  meta?: unknown;
}

interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details: unknown[] };
}

/** Erreur métier renvoyée par l'API (doc 09 §9.1) — `message` est déjà localisé côté serveur via `Accept-Language`. */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Client HTTP partagé (2ᵉ+ appels réels, `login`/`refresh`/`restaurants/me`
 * GET+PATCH : factorisé maintenant, comme annoncé au ticket précédent —
 * `useCountryDetection.ts` reste sur son `fetch` direct, seul appel de tout
 * le module, pas rétrofité ici sans besoin réel, doc 14 §14.5 KISS).
 *
 * `Accept-Language` explicite (plutôt que le header navigateur par défaut) :
 * aligne les messages d'erreur renvoyés par le serveur (déjà localisés,
 * `error-handler.middleware.ts`) sur la langue choisie dans l'app
 * (`LanguageSwitcher`), pas seulement celle du navigateur.
 */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const body = await requestBody<T>(path, init);
  return body === undefined ? (undefined as T) : body.data;
}

/**
 * Variante exposant aussi `meta` (pagination offset, doc 09 §9.2) — `GET
 * /employees` (doc 09 §9.5) est le 1er endpoint paginé du projet consommé
 * par le frontend ; `apiRequest` reste la forme courte pour tous les autres
 * appels (pas de `meta` à ignorer partout ailleurs).
 */
export async function apiRequestWithMeta<T, M>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T; meta: M }> {
  const body = await requestBody<T>(path, init);
  if (body === undefined) {
    throw new ApiError('API_UNEXPECTED_204', 'Réponse 204 inattendue pour un appel paginé.');
  }
  return { data: body.data, meta: body.meta as M };
}

async function requestBody<T>(
  path: string,
  init: RequestInit,
): Promise<ApiSuccessBody<T> | undefined> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': i18n.global.locale.value,
      ...init.headers,
    },
  });

  // `204 No Content` (ex. `POST /auth/logout`) n'a pas de corps JSON à parser.
  if (response.status === 204) {
    return undefined;
  }

  const body = (await response.json()) as ApiSuccessBody<T> | ApiErrorBody;
  if (!body.success) {
    throw new ApiError(body.error.code, body.error.message);
  }
  return body;
}
