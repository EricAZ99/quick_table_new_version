import { z } from 'zod';

import { MEMBERSHIP_ROLES } from '../../database/models/membership.model.js';

const EMPLOYMENT_STATUSES = ['active', 'inactive'] as const;

/**
 * `POST /employees` (doc 09 §9.5) — payload `{email, fullName, role,
 * jobTitle?, salary?}` : contrairement à `createMembershipSchema`
 * (`memberships.validators.ts`, usage interne du provisioning restaurant,
 * qui prend un `userId` déjà existant), cet endpoint public accepte un
 * `email` qui peut ne correspondre à aucun `users` existant — dans ce cas
 * `EmployeesService#inviteEmployee` crée le compte (décision validée avec
 * toi : compte créé maintenant, envoi d'email et activation réelle
 * restent le ticket suivant, "flux d'invitation employé").
 */
export const inviteEmployeeSchema = z.object({
  email: z.string().trim().toLowerCase().email('email invalide'),
  fullName: z.string().trim().min(1, 'fullName est requis').max(200),
  role: z.enum(MEMBERSHIP_ROLES),
  jobTitle: z.string().trim().min(1).max(200).optional(),
  salary: z.number().min(0, 'salary ne peut pas être négatif').optional(),
  hiredAt: z.coerce.date().optional(),
});
export type InviteEmployeeDto = z.infer<typeof inviteEmployeeSchema>;

/** `PATCH /employees/:id` (doc 09 §9.5) : "poste, salaire, statut" — jamais l'email/le rôle, non documentés comme modifiables ici. */
export const updateEmployeeSchema = z.object({
  jobTitle: z.string().trim().min(1).max(200).optional(),
  salary: z.number().min(0, 'salary ne peut pas être négatif').optional(),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).optional(),
});
export type UpdateEmployeeDto = z.infer<typeof updateEmployeeSchema>;

/**
 * `GET /employees` (doc 09 §9.5, doc 09 §9.2 pagination offset) —
 * `page`/`limit` viennent de `req.query` (toujours des chaînes), `z.coerce`
 * les convertit ; `limit` plafonné à 100 (doc 09 §9.2).
 */
export const listEmployeesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(MEMBERSHIP_ROLES).optional(),
  status: z.enum(EMPLOYMENT_STATUSES).optional(),
});
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
