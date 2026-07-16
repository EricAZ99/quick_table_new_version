import { UserModel, type UserDocument } from '../../database/models/user.model.js';

export type CreateUserInput = Pick<UserDocument, 'email' | 'passwordHash' | 'fullName'> &
  Partial<Pick<UserDocument, 'phone' | 'avatarUrl' | 'preferredLocale'>>;

/**
 * `users` est une identité globale, **non tenant-scoped** (doc 05 §5.3) —
 * ce repository n'étend donc pas `BaseRepository` (doc 06 §6.4), qui exige
 * un `context: {tenantId}` sur chaque méthode : ça n'aurait pas de sens
 * pour une collection sans `tenantId`. `modules/users/` par cohérence avec
 * l'arborescence documentée (doc 03 §3.2).
 *
 * `findByEmail` normalise en lowercase (même règle que le schéma, doc 05 :
 * "unique, normalisé lowercase") pour qu'un appelant n'ait pas à y penser.
 */
export class UsersRepository {
  create(input: CreateUserInput) {
    return UserModel.create(input);
  }

  findByEmail(email: string) {
    return UserModel.findOne({ email: email.toLowerCase() });
  }

  /**
   * `passwordHash` a `select:false` au schéma (jamais retourné par défaut,
   * doc 05 §"users") — seul le flux de vérification de mot de passe au
   * login (doc 07 §7.3) a besoin de le lire explicitement.
   */
  findByEmailWithPasswordHash(email: string) {
    return UserModel.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  }

  findById(id: string) {
    return UserModel.findById(id);
  }

  /** Réinitialisation de mot de passe (doc 07 §7.5) — le hachage Argon2id reste à la charge de l'appelant. */
  updatePasswordHash(userId: string, passwordHash: string) {
    return UserModel.updateOne({ _id: userId }, { passwordHash });
  }

  /**
   * `twoFactorSecret`/`twoFactorRecoveryCodes` ont `select:false` au schéma
   * (doc 07 §7.6) — seul le flux 2FA (confirm/verify/disable) a besoin de
   * les lire explicitement.
   */
  findByIdWithTwoFactorSecret(userId: string) {
    return UserModel.findById(userId).select('+twoFactorSecret +twoFactorRecoveryCodes');
  }

  /** `POST /auth/2fa/disable` (doc 07 §7.6) : exige le mot de passe en plus du code. */
  findByIdWithPasswordAndTwoFactorSecret(userId: string) {
    return UserModel.findById(userId).select(
      '+passwordHash +twoFactorSecret +twoFactorRecoveryCodes',
    );
  }

  /**
   * `POST /auth/2fa/enable` (doc 07 §7.6) : stocke le secret chiffré et les
   * codes de récupération hashés, mais **ne** met **pas** `twoFactorEnabled`
   * à `true` — l'activation n'est effective qu'après `confirmTwoFactor`
   * (vérification d'un premier code TOTP), pour ne jamais activer la 2FA
   * sur un secret que l'utilisateur n'a pas fini de scanner/configurer.
   */
  setPendingTwoFactorSecret(userId: string, encryptedSecret: string, recoveryCodeHashes: string[]) {
    return UserModel.updateOne(
      { _id: userId },
      {
        twoFactorSecret: encryptedSecret,
        twoFactorRecoveryCodes: recoveryCodeHashes.map((codeHash) => ({
          codeHash,
          usedAt: null,
        })),
      },
    );
  }

  confirmTwoFactor(userId: string) {
    return UserModel.updateOne({ _id: userId }, { twoFactorEnabled: true });
  }

  /** `POST /auth/2fa/disable` (doc 07 §7.6) — efface le secret et les codes de récupération, pas seulement le drapeau. */
  disableTwoFactor(userId: string) {
    return UserModel.updateOne(
      { _id: userId },
      {
        twoFactorEnabled: false,
        $unset: { twoFactorSecret: '' },
        twoFactorRecoveryCodes: [],
      },
    );
  }

  /** Marque un code de récupération comme consommé (doc 07 §7.6) — jamais supprimé, pour garder une trace d'audit. */
  markRecoveryCodeUsed(userId: string, codeHash: string) {
    return UserModel.updateOne(
      { _id: userId, 'twoFactorRecoveryCodes.codeHash': codeHash },
      { $set: { 'twoFactorRecoveryCodes.$.usedAt': new Date() } },
    );
  }
}
