import { describe, expect, it } from 'vitest';

import { translateErrorMessage } from '../index.js';

describe('translateErrorMessage', () => {
  it('retourne le message traduit pour un code connu, dans chacune des 4 locales supportées (doc 35)', () => {
    expect(translateErrorMessage('INTERNAL_SERVER_ERROR', 'fr', 'fallback')).toBe(
      'Une erreur inattendue est survenue.',
    );
    expect(translateErrorMessage('INTERNAL_SERVER_ERROR', 'en', 'fallback')).toBe(
      'An unexpected error occurred.',
    );
    expect(translateErrorMessage('INTERNAL_SERVER_ERROR', 'it', 'fallback')).toBe(
      'Si è verificato un errore imprevisto.',
    );
    expect(translateErrorMessage('INTERNAL_SERVER_ERROR', 'es', 'fallback')).toBe(
      'Se produjo un error inesperado.',
    );
  });

  it("retombe sur le message fallback fourni pour un code absent du catalogue (module n'ayant pas encore ses clés, doc 14 §14.5)", () => {
    expect(
      translateErrorMessage('CODE_INCONNU_JAMAIS_CATALOGUE', 'fr', 'Message par défaut.'),
    ).toBe('Message par défaut.');
  });
});
