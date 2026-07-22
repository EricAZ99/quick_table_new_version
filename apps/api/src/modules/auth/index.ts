// Point d'entrée public du module (doc 03/12 §12.1) — seul fichier qu'un
// autre module ou app.ts a le droit d'importer.
export { authRouter } from './auth.routes.js';
export { AuthRepository } from './auth.repository.js';
export type { CreatePasswordResetTokenInput } from './auth.repository.js';
// Réutilisés par `employees.service.ts` (Feature 2.2, flux d'invitation
// employé) : l'activation d'un compte fraîchement créé est le même
// mécanisme que "mot de passe oublié" (token opaque à usage unique, même
// `POST /auth/reset-password` pour le consommer), pas une seconde
// implémentation.
export {
  generatePasswordResetToken,
  hashPasswordResetToken,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from './passwordResetToken.util.js';
