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

  findById(id: string) {
    return UserModel.findById(id);
  }
}
