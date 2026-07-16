import { describe, expect, it } from 'vitest';

import { twoFactorStatusChangedEmailTemplate } from '../twoFactorStatusChanged.template.js';

describe('twoFactorStatusChangedEmailTemplate', () => {
  it.each(['fr', 'en', 'it', 'es'] as const)(
    'génère un contenu non vide, différent activé/désactivé, pour la locale %s',
    (locale) => {
      const enabled = twoFactorStatusChangedEmailTemplate(locale, true);
      const disabled = twoFactorStatusChangedEmailTemplate(locale, false);

      expect(enabled.subject.length).toBeGreaterThan(0);
      expect(disabled.subject.length).toBeGreaterThan(0);
      expect(enabled.subject).not.toBe(disabled.subject);
      expect(enabled.text).not.toBe(disabled.text);
    },
  );

  it('convertit les sauts de ligne du texte en <br> dans le HTML', () => {
    const content = twoFactorStatusChangedEmailTemplate('fr', true);

    expect(content.text).toContain('\n');
    expect(content.html).not.toContain('\n');
    expect(content.html).toContain('<br>');
  });
});
