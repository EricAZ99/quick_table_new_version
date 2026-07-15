import type { NextFunction, Request, Response } from 'express';

export const SUPPORTED_LOCALES = ['fr', 'en', 'it', 'es'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

/**
 * Résout la locale de la requête (doc 35 §35.4) depuis le header
 * `Accept-Language`. La résolution depuis le JWT (claim `locale`, doc 07
 * §7.2) — prioritaire sur `Accept-Language` une fois disponible — arrivera
 * avec `auth.middleware.ts` (Epic 1) : se branchera devant cette fonction
 * sans la modifier, même principe que `detectLocale` côté frontend
 * (ticket précédent, apps/web/src/plugins/i18n.plugin.ts).
 */
export function resolveLocaleFromHeader(acceptLanguageHeader: string | undefined): SupportedLocale {
  if (!acceptLanguageHeader) {
    return DEFAULT_LOCALE;
  }

  const tagsByQuality = acceptLanguageHeader
    .split(',')
    .map((part) => {
      const [tag, qualityPart] = part.trim().split(';q=');
      return {
        tag: (tag ?? '').trim().slice(0, 2).toLowerCase(),
        quality: qualityPart ? Number(qualityPart) : 1,
      };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of tagsByQuality) {
    if ((SUPPORTED_LOCALES as readonly string[]).includes(tag)) {
      return tag as SupportedLocale;
    }
  }
  return DEFAULT_LOCALE;
}

export function i18nMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.locale = resolveLocaleFromHeader(req.headers['accept-language']);
  next();
}
