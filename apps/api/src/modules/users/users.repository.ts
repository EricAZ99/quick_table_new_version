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
}
