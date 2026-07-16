import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMailMock, createTransportMock } = vi.hoisted(() => ({
  sendMailMock: vi.fn().mockResolvedValue(undefined),
  createTransportMock: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

import { EmailSenderService } from '../email-sender.service.js';

const FROM = 'Quick Table <verified-sender@example.com>';

describe('EmailSenderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTransportMock.mockReturnValue({ sendMail: sendMailMock });
  });

  it('construit le transport Nodemailer avec la config SMTP fournie (secure=false sur 587)', () => {
    new EmailSenderService({
      host: 'smtp-relay.brevo.com',
      port: 587,
      user: 'u',
      pass: 'p',
      from: FROM,
    });

    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: { user: 'u', pass: 'p' },
    });
  });

  it('active secure=true sur le port 465 (SMTPS)', () => {
    new EmailSenderService({
      host: 'smtp-relay.brevo.com',
      port: 465,
      user: 'u',
      pass: 'p',
      from: FROM,
    });

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true, port: 465 }),
    );
  });

  it("envoie l'email via le transport avec l'adresse d'expédition configurée (doit correspondre à un sender vérifié dans Brevo)", async () => {
    const service = new EmailSenderService({
      host: 'smtp-relay.brevo.com',
      port: 587,
      user: 'u',
      pass: 'p',
      from: FROM,
    });

    await service.send({
      to: 'chef@quicktable.io',
      subject: 'Sujet',
      html: '<p>Corps</p>',
      text: 'Corps',
    });

    expect(sendMailMock).toHaveBeenCalledWith({
      from: FROM,
      to: 'chef@quicktable.io',
      subject: 'Sujet',
      html: '<p>Corps</p>',
      text: 'Corps',
    });
  });

  it("propage une erreur d'envoi (le retry est géré par BullMQ, pas ici)", async () => {
    sendMailMock.mockRejectedValueOnce(new Error('SMTP indisponible'));
    const service = new EmailSenderService({
      host: 'smtp-relay.brevo.com',
      port: 587,
      user: 'u',
      pass: 'p',
      from: FROM,
    });

    await expect(
      service.send({ to: 'chef@quicktable.io', subject: 's', html: 'h', text: 't' }),
    ).rejects.toThrow('SMTP indisponible');
  });
});
