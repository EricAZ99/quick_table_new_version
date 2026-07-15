// Node ESM natif (contrairement à Vite côté apps/web) exige l'attribut
// `type: 'json'` pour importer un fichier JSON — sans lui, l'import échoue
// au démarrage du process, pas seulement au typecheck.
import en from './en.json' with { type: 'json' };
import es from './es.json' with { type: 'json' };
import fr from './fr.json' with { type: 'json' };
import it from './it.json' with { type: 'json' };

import type { SupportedLocale } from '../middlewares/i18n.middleware.js';

/**
 * Catalogue de messages d'erreur par code (doc 35 §35.4) : `error.code`
 * (doc 09 §9.1) reste stable et non traduit, seul `error.message` varie
 * par locale. Ne couvre que les codes déjà émis par le code applicatif
 * (`INTERNAL_SERVER_ERROR`, `HELLO_WORLD_INVALID_PAYLOAD`) — un futur
 * module ajoute ses propres clés au fil de l'eau, pas de catalogue
 * spéculatif pour des codes qui n'existent pas encore (doc 14 §14.5).
 */
const catalogs: Record<SupportedLocale, Record<string, string>> = { fr, en, it, es };

export function translateErrorMessage(
  code: string,
  locale: SupportedLocale,
  fallback: string,
): string {
  return catalogs[locale]?.[code] ?? fallback;
}
