import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';

const ISSUER = 'QuickTable';

/** Secret TOTP (RFC 6238), encodé base32 par `otplib` — chiffré avant stockage (`twoFactorSecret.util.ts`). */
export function generateTotpSecret(): string {
  return generateSecret();
}

/**
 * QR Code (doc 07 §7.6) scannable par Google Authenticator/Authy — encode
 * l'URI standard `otpauth://totp/QuickTable:{email}?secret=...&issuer=...`
 * en data URI PNG (`data:image/png;base64,...`), directement affichable
 * côté front dans une balise `<img>` sans appel réseau supplémentaire.
 */
export function generateTotpQrCodeDataUrl(email: string, secret: string): Promise<string> {
  const otpauthUri = generateURI({ issuer: ISSUER, label: email, secret });
  return QRCode.toDataURL(otpauthUri);
}

/**
 * `otplib.verify()` lève une exception plutôt que de renvoyer `valid:false`
 * quand `token` n'a pas la forme d'un code TOTP (ex. `"AB12-CD34-EF56"`,
 * un code de récupération, doc 07 §7.6 — `verifyTwoFactor`/`disableTwoFactor`
 * tentent le TOTP avant de retomber sur les codes de récupération) — un
 * format invalide est traité comme "code incorrect", pas comme une erreur
 * serveur.
 */
export async function verifyTotpCode(code: string, secret: string): Promise<boolean> {
  try {
    const result = await verify({ secret, token: code });
    return result.valid;
  } catch {
    return false;
  }
}
