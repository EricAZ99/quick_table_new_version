import nodemailer, { type Transporter } from 'nodemailer';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const FROM_ADDRESS = 'QuickTable <no-reply@quicktable.io>';

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

  constructor(config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });
  }

  async send(input: SendEmailInput): Promise<void> {
    await this.transporter.sendMail({
      from: FROM_ADDRESS,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  }
}
