// Point d'entrée public du module (doc 03/12 §12.1) — seul fichier qu'un
// autre module ou app.ts a le droit d'importer.
export { UsersRepository } from './users.repository.js';
export type { CreateUserInput } from './users.repository.js';
