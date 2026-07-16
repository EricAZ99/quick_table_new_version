import type { SupportedLocale } from '../../../middlewares/i18n.middleware.js';
import type { EmailContent } from './template.types.js';

const CONTENT: Record<SupportedLocale, { subject: string; body: (link: string) => string }> = {
  fr: {
    subject: 'Réinitialisez votre mot de passe QuickTable',
    body: (link) =>
      `Vous avez demandé la réinitialisation de votre mot de passe.\n\nCliquez sur ce lien pour en choisir un nouveau (valable 30 minutes) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
  },
  en: {
    subject: 'Reset your QuickTable password',
    body: (link) =>
      `You requested a password reset.\n\nClick this link to choose a new one (valid for 30 minutes):\n${link}\n\nIf you didn't request this, you can safely ignore this email.`,
  },
  it: {
    subject: 'Reimposta la tua password QuickTable',
    body: (link) =>
      `Hai richiesto la reimpostazione della password.\n\nClicca su questo link per sceglierne una nuova (valido 30 minuti):\n${link}\n\nSe non hai effettuato questa richiesta, ignora questa email.`,
  },
  es: {
    subject: 'Restablece tu contraseña de QuickTable',
    body: (link) =>
      `Solicitaste restablecer tu contraseña.\n\nHaz clic en este enlace para elegir una nueva (válido 30 minutos):\n${link}\n\nSi no solicitaste esto, puedes ignorar este correo.`,
  },
};

/** doc 07 §7.5 — lien à usage unique, 30 min (`PASSWORD_RESET_TOKEN_TTL_MS`). */
export function passwordResetEmailTemplate(
  locale: SupportedLocale,
  resetLink: string,
): EmailContent {
  const { subject, body } = CONTENT[locale];
  const text = body(resetLink);
  return { subject, text, html: `<p>${text.replace(/\n/g, '<br>')}</p>` };
}
