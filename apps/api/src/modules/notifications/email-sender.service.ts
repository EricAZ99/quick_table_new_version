import nodemailer, { type Transporter } from 'nodemailer';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  // Adresse d'expédition (doc 04 §4.1) — configurable plutôt que codée en
  // dur : Brevo rejette l'envoi si l'adresse "from" ne correspond pas à un
  // expéditeur vérifié sur le compte (Settings > Senders), ce qui exclut
  // `no-reply@quicktable.io` tant que le domaine n'est pas authentifié
  // (SPF/DKIM/DMARC, ticket séparé de cette Feature).
  from: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Encapsule Nodemailer (doc 04 §4.1) — **seul point du code qui importe
 * Nodemailer**, pour ne pas coupler le reste de l'application à ce choix
 * de transport. Relayé par Brevo (SMTP) ; migration vers Amazon SES (si le
 * volume dépasse le plan gratuit Brevo, doc 18 §18.2) confinée à ce seul
 * fichier.
 *
 * Config SMTP injectée par paramètre, jamais lue via `getEnv()` en interne
 * (doc 14 §14.4, même convention que `connectDatabase`/`connectRedis`) —
 * ce module tourne aussi bien dans le process API (rien ne l'utilise
 * encore directement) que dans le process `workers` (`email.worker.ts`,
 * seul consommateur réel aujourd'hui).
 */
export class EmailSenderService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpConfig) {
    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });
  }

  async send(input: SendEmailInput): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  }
}
