import { describe, expect, it } from 'vitest';

import { detectLocale, i18n, SUPPORTED_LOCALES } from '../i18n.plugin';

describe('detectLocale (doc 35 §35.4)', () => {
  it('retient la première langue du navigateur supportée', () => {
    expect(detectLocale(['it-IT', 'en-US'])).toBe('it');
  });

  it('ignore les langues non supportées et prend la suivante', () => {
    expect(detectLocale(['de-DE', 'es-ES'])).toBe('es');
  });

  it("retombe sur 'en' si aucune langue du navigateur n'est supportée", () => {
    expect(detectLocale(['de-DE', 'pt-PT'])).toBe('en');
  });

  it("retombe sur 'en' pour une liste vide", () => {
    expect(detectLocale([])).toBe('en');
  });

  it('normalise la casse (FR-fr -> fr)', () => {
    expect(detectLocale(['FR-fr'])).toBe('fr');
  });
});

describe('i18n (instance vue-i18n)', () => {
  it('couvre les 4 langues du MVP avec les mêmes clés (doc 35 §35.1)', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const messages = i18n.global.getLocaleMessage(locale) as Record<string, unknown>;
      expect(messages.app).toBeDefined();
      expect(messages.language).toBeDefined();
    }
  });
});
