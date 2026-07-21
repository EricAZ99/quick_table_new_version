import type { ClientSession } from 'mongoose';

import {
  MembershipModel,
  type MembershipDocument,
  type MembershipRole,
} from '../../database/models/membership.model.js';
import { BaseRepository, type RepositoryContext } from '../../shared/base/BaseRepository.js';

export interface CreateMembershipInput {
  userId: string;
  role: MembershipRole;
  jobTitle?: string;
  salary?: number;
}

/**
 * `memberships` est tenant-scoped (doc 05) — `modules/employees/` par
 * cohérence avec l'arborescence documentée (doc 03 §3.2 : la gestion
 * business des employés y vit, Feature 2.2), le fichier reste nommé
 * `memberships.repository.ts` conformément au nom de la collection
 * (checklist, doc 34 Feature 1.1).
 *
 * `create` n'existe pas sur `BaseRepository` (doc 06 §6.4) : injecte
 * `tenantId` depuis le `context`, jamais depuis les données fournies par
 * l'appelant — même patron que `HelloWorldRepository`.
 *
 * `session` optionnel (doc 06 §6.7) : nécessaire pour participer à la
 * transaction multi-documents du provisioning réduit
 * (`restaurants.service.ts`, Feature 2.1) — forme tableau de `.create()`
 * requise par Mongoose pour que `{session}` soit interprété comme des
 * options plutôt que comme un second document.
 */
export class MembershipsRepository extends BaseRepository<MembershipDocument> {
  constructor() {
    super(MembershipModel);
  }

  async create(input: CreateMembershipInput, context: RepositoryContext, session?: ClientSession) {
    const [doc] = await this.model.create([{ ...input, tenantId: context.tenantId }], { session });
    return doc as NonNullable<typeof doc>;
  }
}
