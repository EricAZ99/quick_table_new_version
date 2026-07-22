// Point d'entrée public du module (doc 03/12 §12.1) — seul fichier qu'un
// autre module ou app.ts a le droit d'importer.
export { employeesRouter } from './employees.routes.js';
export { MembershipsRepository } from './memberships.repository.js';
export type { CreateMembershipInput } from './memberships.repository.js';
