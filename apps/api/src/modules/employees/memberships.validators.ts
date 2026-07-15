import { z } from 'zod';

import { MEMBERSHIP_ROLES } from '../../database/models/membership.model.js';

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/**
 * DTO de rattachement d'un employé à un restaurant (doc 12 §12.2, doc 09
 * §9.1). `tenantId` n'apparaît volontairement jamais dans ce schéma : il
 * vient toujours de `context.tenantId` (résolu côté serveur, doc 06 §6.2),
 * jamais d'un champ soumis par le client — même règle absolue que
 * `BaseRepository`/`tenantScope`.
 *
 * Contrôle de visibilité de `salary` (doc 05 : "visible uniquement par
 * restaurant_owner/manager habilité") hors périmètre ici : arrive avec
 * `rbac.middleware.ts` (Feature 1.4), pas anticipé (doc 14 §14.5 KISS).
 */
export const createMembershipSchema = z.object({
  userId: z.string().regex(OBJECT_ID_PATTERN, 'userId doit être un ObjectId MongoDB valide'),
  role: z.enum(MEMBERSHIP_ROLES),
  jobTitle: z.string().trim().min(1).max(200).optional(),
  salary: z.number().min(0, 'salary ne peut pas être négatif').optional(),
  hiredAt: z.coerce.date().optional(),
});

export type CreateMembershipDto = z.infer<typeof createMembershipSchema>;
