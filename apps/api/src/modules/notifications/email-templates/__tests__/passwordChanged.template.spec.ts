import { describe, expect, it } from 'vitest';

import { passwordChangedEmailTemplate } from '../passwordChanged.template.js';

describe('passwordChangedEmailTemplate', () => {
  it.each(['fr', 'en', 'it', 'es'] as const)(
    'génère un sujet et un corps non vides pour la locale %s',
    (locale) => {
      const content = passwordChangedEmailTemplate(locale);

      expect(content.subject.length).toBeGreaterThan(0);
      expect(content.text.length).toBeGreaterThan(0);
      expect(content.html.length).toBeGreaterThan(0);
    },
  );

  it('convertit les sauts de ligne du texte en <br> dans le HTML', () => {
    const content = passwordChangedEmailTemplate('en');

    expect(content.text).toContain('\n');
    expect(content.html).not.toContain('\n');
    expect(content.html).toContain('<br>');
  });
});
