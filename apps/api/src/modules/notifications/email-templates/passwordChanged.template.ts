import type { SupportedLocale } from '../../../middlewares/i18n.middleware.js';
import type { EmailContent } from './template.types.js';

const CONTENT: Record<SupportedLocale, { subject: string; body: string }> = {
  fr: {
    subject: 'Votre mot de passe QuickTable a été modifié',
    body: "Votre mot de passe vient d'être modifié.\n\nSi vous n'êtes pas à l'origine de ce changement, contactez immédiatement le support.",
  },
  en: {
    subject: 'Your QuickTable password was changed',
    body: "Your password was just changed.\n\nIf you didn't make this change, please contact support immediately.",
  },
  it: {
    subject: 'La tua password QuickTable è stata modificata',
    body: 'La tua password è stata appena modificata.\n\nSe non hai effettuato tu questa modifica, contatta immediatamente il supporto.',
  },
  es: {
    subject: 'Tu contraseña de QuickTable ha sido cambiada',
    body: 'Tu contraseña acaba de ser cambiada.\n\nSi no realizaste este cambio, contacta al soporte de inmediato.',
  },
};

/** doc 07 §7.5 — confirmation envoyée après un `reset-password` réussi. */
export function passwordChangedEmailTemplate(locale: SupportedLocale): EmailContent {
  const { subject, body } = CONTENT[locale];
  return { subject, text: body, html: `<p>${body.replace(/\n/g, '<br>')}</p>` };
}
