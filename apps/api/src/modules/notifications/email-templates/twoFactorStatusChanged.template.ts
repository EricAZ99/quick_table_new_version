import type { SupportedLocale } from '../../../middlewares/i18n.middleware.js';
import type { EmailContent } from './template.types.js';

const CONTENT: Record<SupportedLocale, { enabled: string; disabled: string }> = {
  fr: {
    enabled:
      "La double authentification vient d'être activée sur votre compte.\n\nSi vous n'êtes pas à l'origine de cette action, contactez immédiatement le support.",
    disabled:
      "La double authentification vient d'être désactivée sur votre compte.\n\nSi vous n'êtes pas à l'origine de cette action, contactez immédiatement le support.",
  },
  en: {
    enabled:
      "Two-factor authentication was just enabled on your account.\n\nIf you didn't make this change, please contact support immediately.",
    disabled:
      "Two-factor authentication was just disabled on your account.\n\nIf you didn't make this change, please contact support immediately.",
  },
  it: {
    enabled:
      "L'autenticazione a due fattori è stata appena attivata sul tuo account.\n\nSe non hai effettuato tu questa modifica, contatta immediatamente il supporto.",
    disabled:
      "L'autenticazione a due fattori è stata appena disattivata sul tuo account.\n\nSe non hai effettuato tu questa modifica, contatta immediatamente il supporto.",
  },
  es: {
    enabled:
      'La autenticación de dos factores acaba de activarse en tu cuenta.\n\nSi no realizaste este cambio, contacta al soporte de inmediato.',
    disabled:
      'La autenticación de dos factores acaba de desactivarse en tu cuenta.\n\nSi no realizaste este cambio, contacta al soporte de inmediato.',
  },
};

const SUBJECTS: Record<SupportedLocale, { enabled: string; disabled: string }> = {
  fr: {
    enabled: 'Double authentification activée',
    disabled: 'Double authentification désactivée',
  },
  en: {
    enabled: 'Two-factor authentication enabled',
    disabled: 'Two-factor authentication disabled',
  },
  it: {
    enabled: 'Autenticazione a due fattori attivata',
    disabled: 'Autenticazione a due fattori disattivata',
  },
  es: {
    enabled: 'Autenticación de dos factores activada',
    disabled: 'Autenticación de dos factores desactivada',
  },
};

/** doc 07 §7.7 — notification de sécurité envoyée à toute activation/désactivation de la 2FA. */
export function twoFactorStatusChangedEmailTemplate(
  locale: SupportedLocale,
  enabled: boolean,
): EmailContent {
  const key = enabled ? 'enabled' : 'disabled';
  const subject = SUBJECTS[locale][key];
  const text = CONTENT[locale][key];
  return { subject, text, html: `<p>${text.replace(/\n/g, '<br>')}</p>` };
}
