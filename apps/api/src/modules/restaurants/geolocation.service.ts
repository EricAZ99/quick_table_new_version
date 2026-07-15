export interface GeoLocationResult {
  /** ISO 3166-1 alpha-2, `null` si non déterminable (IP privée, échec réseau, timeout). */
  country: string | null;
  city: string | null;
}

interface IpApiResponse {
  status: 'success' | 'fail';
  message?: string;
  countryCode?: string;
  city?: string;
}

const UNKNOWN_LOCATION: GeoLocationResult = { country: null, city: null };

const IP_API_BASE_URL = 'http://ip-api.com/json';
const REQUEST_TIMEOUT_MS = 3000;

/**
 * Géolocalisation par IP (doc 35 §35.2) — fournisseur `ip-api.com` (gratuit,
 * aucune clé requise, choisi pour ce ticket plutôt que MaxMind GeoLite2 dont
 * la base embarquée + le job de mise à jour périodique dépassent le budget
 * de ce ticket). Ne lève jamais : une IP privée/loopback (dev local), un
 * timeout ou une panne du fournisseur tiers renvoient `{country:null,
 * city:null}` plutôt qu'une erreur — la détection est un simple pré-remplissage
 * best-effort, jamais un pré-requis bloquant de l'inscription (doc 35 §35.2 :
 * "toujours présenté comme pré-rempli et modifiable, jamais appliqué
 * silencieusement").
 */
export async function detectLocationFromIp(ip: string): Promise<GeoLocationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${IP_API_BASE_URL}/${encodeURIComponent(ip)}?fields=status,message,countryCode,city`,
      { signal: controller.signal },
    );

    if (!response.ok) {
      return UNKNOWN_LOCATION;
    }

    const data = (await response.json()) as IpApiResponse;
    if (data.status !== 'success') {
      return UNKNOWN_LOCATION;
    }

    return { country: data.countryCode ?? null, city: data.city ?? null };
  } catch {
    return UNKNOWN_LOCATION;
  } finally {
    clearTimeout(timeout);
  }
}
