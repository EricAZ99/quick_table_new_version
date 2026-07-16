import { generate } from 'otplib';
import { describe, expect, it } from 'vitest';

import { generateTotpQrCodeDataUrl, generateTotpSecret, verifyTotpCode } from '../totp.util.js';

describe('totp.util', () => {
  it('génère un secret base32 (RFC 6238)', () => {
    const secret = generateTotpSecret();

    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    expect(secret.length).toBeGreaterThan(0);
  });

  it('génère un QR Code en data URI PNG', async () => {
    const secret = generateTotpSecret();

    const dataUrl = await generateTotpQrCodeDataUrl('chef@quicktable.io', secret);

    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('accepte un code TOTP réellement généré pour ce secret', async () => {
    const secret = generateTotpSecret();
    const code = await generate({ secret });

    await expect(verifyTotpCode(code, secret)).resolves.toBe(true);
  });

  it('rejette un code incorrect', async () => {
    const secret = generateTotpSecret();

    await expect(verifyTotpCode('000000', secret)).resolves.toBe(false);
  });

  it("retourne false (pas d'exception) pour un token qui n'a pas la forme d'un code TOTP — ex. un code de récupération (doc 07 §7.6)", async () => {
    const secret = generateTotpSecret();

    await expect(verifyTotpCode('AB12-CD34-EF56', secret)).resolves.toBe(false);
  });
});
