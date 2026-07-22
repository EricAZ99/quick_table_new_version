import { describe, expect, it } from 'vitest';

import { employeeInvitationEmailTemplate } from '../employeeInvitation.template.js';

const ACTIVATION_LINK = 'https://app.quicktable.io/activate-account?token=abc123';

describe('employeeInvitationEmailTemplate', () => {
  it.each(['fr', 'en', 'it', 'es'] as const)(
    'génère un sujet et un corps non vides pour la locale %s, incluant le lien',
    (locale) => {
      const content = employeeInvitationEmailTemplate(locale, ACTIVATION_LINK);

      expect(content.subject.length).toBeGreaterThan(0);
      expect(content.text).toContain(ACTIVATION_LINK);
      expect(content.html).toContain(ACTIVATION_LINK);
    },
  );

  it('convertit les sauts de ligne du texte en <br> dans le HTML', () => {
    const content = employeeInvitationEmailTemplate('fr', ACTIVATION_LINK);

    expect(content.text).toContain('\n');
    expect(content.html).not.toContain('\n');
    expect(content.html).toContain('<br>');
  });
});
