import { createI18n } from 'vue-i18n';

import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import it from '../locales/it.json';

export const SUPPORTED_LOCALES = ['fr', 'en', 'it', 'es'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const DEFAULT_LOCALE: SupportedLocale = 'en';

/**
 * Résout la langue initiale (doc 35 §35.4). Ordre de priorité documenté :
 * préférence utilisateur (`users.preferredLocale`) → `restaurants.locale`
 * → langue du navigateur → défaut `en`. Seule la détection navigateur est
 * possible à ce stade (Feature 0.4) : `users`/`restaurants` n'existent pas
 * encore (Epic 1+/2) — les deux premiers niveaux de priorité se
 * brancheront devant cette fonction sans la modifier, une fois ces
 * données disponibles côté client.
 */
export function detectLocale(
  navigatorLanguages: readonly string[] = navigator.languages,
): SupportedLocale {
  for (const lang of navigatorLanguages) {
    const short = lang.slice(0, 2).toLowerCase();
    if ((SUPPORTED_LOCALES as readonly string[]).includes(short)) {
      return short as SupportedLocale;
    }
  }
  return DEFAULT_LOCALE;
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { fr, en, it, es },
});
