import type { SupportedLocale } from '../../../middlewares/i18n.middleware.js';
import type { EmailContent } from './template.types.js';

const CONTENT: Record<SupportedLocale, { subject: string; body: (link: string) => string }> = {
  fr: {
    subject: 'Vous êtes invité·e à rejoindre QuickTable',
    body: (link) =>
      `Vous avez été ajouté·e à une équipe sur QuickTable.\n\nCliquez sur ce lien pour activer votre compte et choisir votre mot de passe (valable 30 minutes) :\n${link}\n\nSi vous ne vous attendiez pas à cet email, vous pouvez l'ignorer.`,
  },
  en: {
    subject: "You've been invited to join QuickTable",
    body: (link) =>
      `You've been added to a team on QuickTable.\n\nClick this link to activate your account and choose your password (valid for 30 minutes):\n${link}\n\nIf you weren't expecting this email, you can safely ignore it.`,
  },
  it: {
    subject: 'Sei stato invitato a unirti a QuickTable',
    body: (link) =>
      `Sei stato aggiunto a un team su QuickTable.\n\nClicca su questo link per attivare il tuo account e scegliere la password (valido 30 minuti):\n${link}\n\nSe non ti aspettavi questa email, puoi ignorarla.`,
  },
  es: {
    subject: 'Has sido invitado a unirte a QuickTable',
    body: (link) =>
      `Has sido añadido a un equipo en QuickTable.\n\nHaz clic en este enlace para activar tu cuenta y elegir tu contraseña (válido 30 minutos):\n${link}\n\nSi no esperabas este correo, puedes ignorarlo.`,
  },
};

/**
 * `POST /employees` (doc 09 §9.5) quand l'email est inconnu — même
 * mécanisme de token que "mot de passe oublié" (doc 07 §7.5,
 * `PASSWORD_RESET_TOKEN_TTL_MS`, `POST /auth/reset-password`), copie
 * différente pour refléter l'intention réelle côté utilisateur (activer
 * un tout premier compte, pas réinitialiser un mot de passe existant).
 *
 * Ne nomme volontairement pas le restaurant : le récupérer exigerait que
 * `employees.service.ts` dépende de `restaurants` (`RestaurantsRepository`),
 * alors que `restaurants.service.ts` dépend déjà de `employees`
 * (`MembershipsRepository`) — une dépendance circulaire entre modules pour
 * un simple embellissement de copie, pas justifiée ici.
 */
export function employeeInvitationEmailTemplate(
  locale: SupportedLocale,
  activationLink: string,
): EmailContent {
  const { subject, body } = CONTENT[locale];
  const text = body(activationLink);
  return { subject, text, html: `<p>${text.replace(/\n/g, '<br>')}</p>` };
}
