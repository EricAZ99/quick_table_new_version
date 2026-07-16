import { describe, expect, it } from 'vitest';

import { passwordResetEmailTemplate } from '../passwordReset.template.js';

const RESET_LINK = 'https://app.quicktable.io/reset-password?token=abc123';

describe('passwordResetEmailTemplate', () => {
  it.each(['fr', 'en', 'it', 'es'] as const)(
    'génère un sujet et un corps non vides pour la locale %s, incluant le lien',
    (locale) => {
      const content = passwordResetEmailTemplate(locale, RESET_LINK);

      expect(content.subject.length).toBeGreaterThan(0);
      expect(content.text).toContain(RESET_LINK);
      expect(content.html).toContain(RESET_LINK);
    },
  );

  it('convertit les sauts de ligne du texte en <br> dans le HTML', () => {
    const content = passwordResetEmailTemplate('fr', RESET_LINK);

    expect(content.text).toContain('\n');
    expect(content.html).not.toContain('\n');
    expect(content.html).toContain('<br>');
  });
});
