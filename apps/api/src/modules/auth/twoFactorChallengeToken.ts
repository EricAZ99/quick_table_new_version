import jwt from 'jsonwebtoken';

/**
 * Jeton intermédiaire du flux 2FA (doc 07 §7.3 : `{requires2FA: true,
 * challengeToken}` puis `POST /auth/2fa/verify {challengeToken, code}`).
 *
 * Signé (même secret que l'Access Token) plutôt que stocké en base
 * (décision validée) : sa seule raison d'être est de relier un appel à
 * `/2fa/verify` à l'utilisateur dont le mot de passe vient d'être vérifié,
 * pour une fenêtre de quelques minutes — un JWT à TTL court répond
 * exactement à ce besoin sans nouvelle collection ni round-trip DB pour le
 * valider. Le claim `purpose` empêche qu'un Access Token normal (ou
 * inversement) soit accepté à sa place.
 */
const CHALLENGE_PURPOSE = '2fa-challenge';
const CHALLENGE_TOKEN_TTL_SECONDS = 5 * 60;

interface TwoFactorChallengePayload {
  sub: string;
  purpose: typeof CHALLENGE_PURPOSE;
}

export function signTwoFactorChallengeToken(userId: string, secret: string): string {
  const payload: TwoFactorChallengePayload = { sub: userId, purpose: CHALLENGE_PURPOSE };
  return jwt.sign(payload, secret, { expiresIn: CHALLENGE_TOKEN_TTL_SECONDS });
}

/** Lève si la signature/l'expiration est invalide, ou si ce n'est pas un challenge 2FA. */
export function verifyTwoFactorChallengeToken(token: string, secret: string): { userId: string } {
  const decoded = jwt.verify(token, secret) as TwoFactorChallengePayload;
  if (decoded.purpose !== CHALLENGE_PURPOSE) {
    throw new Error('Ce jeton ne correspond pas à un challenge 2FA.');
  }
  return { userId: decoded.sub };
}
