import { ref } from 'vue';

export interface DetectedLocation {
  country: string | null;
  city: string | null;
}

interface DetectLocationResponse {
  success: true;
  data: DetectedLocation;
}

/**
 * Appelle `GET /api/v1/restaurants/detect-location` (doc 09 §9.4, public,
 * non authentifié, doc 35 §35.2) — jamais bloquant côté backend (toujours
 * `200`, y compris en échec de géolocalisation tierce : `{country:null,
 * city:null}`). Le seul état d'erreur ici est donc un vrai problème réseau
 * (backend injoignable), pas "pays non détecté" — ce cas-là reste un
 * succès avec `country: null`, à distinguer explicitement côté appelant.
 *
 * Premier appel HTTP du frontend (Feature 2.1) — pas de client HTTP
 * partagé construit ici (aucun autre écran n'en a encore besoin,
 * doc 14 §14.5 KISS) : `fetch` natif direct, à factoriser dès qu'un
 * second appel réel apparaîtra (même principe que
 * `createRedisRateLimiter`/`requireTenantContext` côté API).
 */
export function useCountryDetection() {
  const isLoading = ref(false);
  const hasError = ref(false);
  const detected = ref<DetectedLocation | null>(null);

  async function detect(): Promise<void> {
    isLoading.value = true;
    hasError.value = false;
    try {
      const response = await fetch('/api/v1/restaurants/detect-location');
      if (!response.ok) {
        hasError.value = true;
        return;
      }
      const body = (await response.json()) as DetectLocationResponse;
      detected.value = body.data;
    } catch {
      hasError.value = true;
    } finally {
      isLoading.value = false;
    }
  }

  return { isLoading, hasError, detected, detect };
}
