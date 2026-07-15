import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_LOCALE, i18nMiddleware, resolveLocaleFromHeader } from '../i18n.middleware.js';

describe('resolveLocaleFromHeader', () => {
  it("retourne 'en' par défaut quand le header est absent (doc 35 §35.4)", () => {
    expect(resolveLocaleFromHeader(undefined)).toBe(DEFAULT_LOCALE);
  });

  it("retourne 'en' par défaut quand le header est une chaîne vide", () => {
    expect(resolveLocaleFromHeader('')).toBe(DEFAULT_LOCALE);
  });

  it('retourne la locale supportée demandée pour un header simple', () => {
    expect(resolveLocaleFromHeader('fr')).toBe('fr');
  });

  it('respecte les quality-values et choisit la locale supportée la mieux notée', () => {
    expect(resolveLocaleFromHeader('de;q=0.9, fr;q=0.8, en;q=0.5')).toBe('fr');
  });

  it('ignore les langues non supportées et retombe sur la première supportée par ordre de qualité', () => {
    expect(resolveLocaleFromHeader('de-DE,de;q=0.9,it;q=0.8')).toBe('it');
  });

  it("retourne 'en' par défaut quand aucune langue du header n'est supportée", () => {
    expect(resolveLocaleFromHeader('de-DE,pt-BR;q=0.8')).toBe(DEFAULT_LOCALE);
  });

  it('normalise les tags régionaux (ex. fr-FR) vers leur langue de base', () => {
    expect(resolveLocaleFromHeader('fr-FR')).toBe('fr');
  });
});

function createMockReqRes(acceptLanguage: string | undefined) {
  const req = { headers: { 'accept-language': acceptLanguage } } as unknown as Request;
  const res = {} as Response;
  const next = vi.fn();

  return { req, res, next };
}

describe('i18nMiddleware', () => {
  it('attache req.locale résolue depuis Accept-Language et appelle next()', () => {
    const { req, res, next } = createMockReqRes('es-ES,es;q=0.9');

    i18nMiddleware(req, res, next);

    expect(req.locale).toBe('es');
    expect(next).toHaveBeenCalledOnce();
  });

  it("attache la locale par défaut 'en' quand Accept-Language est absent", () => {
    const { req, res, next } = createMockReqRes(undefined);

    i18nMiddleware(req, res, next);

    expect(req.locale).toBe(DEFAULT_LOCALE);
    expect(next).toHaveBeenCalledOnce();
  });
});
