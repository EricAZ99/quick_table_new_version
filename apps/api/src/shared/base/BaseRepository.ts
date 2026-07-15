import type { QueryFilter, Model, PipelineStage, UpdateQuery } from 'mongoose';

/**
 * Contexte minimal exigé par `BaseRepository` (doc 06 §6.4). Un filtre
 * additionnel de portée par propriétaire (doc 08 §8.8) suivra le même
 * principe de fusion obligatoire au niveau repository une fois le
 * mécanisme RBAC écrit (Epic 1) — pas anticipé ici.
 */
export interface RepositoryContext {
  tenantId: string;
}

/**
 * Ligne de défense n°2 sur 3 contre une fuite inter-tenant (doc 06 §6.4) :
 * toute méthode exige `context: { tenantId }` en paramètre obligatoire
 * (erreur TypeScript à la compilation si omis) et fusionne
 * systématiquement `tenantId` dans le filtre/pipeline avant d'appeler
 * Mongoose. Le spread de `filter` puis l'écrasement par `context.tenantId`
 * (jamais l'inverse) garantit qu'un appelant ne peut jamais imposer un
 * autre tenant, même en passant un `tenantId` dans son propre filtre.
 *
 * Un repository de module hérite de cette classe et n'ajoute que des
 * méthodes de requêtage spécifiques (`findActiveByTable`, etc., doc 12
 * §12.2) — aucune règle métier ici.
 */
export abstract class BaseRepository<T> {
  constructor(protected readonly model: Model<T>) {}

  find(filter: QueryFilter<T>, context: RepositoryContext) {
    return this.model.find(this.withTenant(filter, context));
  }

  findOne(filter: QueryFilter<T>, context: RepositoryContext) {
    return this.model.findOne(this.withTenant(filter, context));
  }

  updateOne(filter: QueryFilter<T>, update: UpdateQuery<T>, context: RepositoryContext) {
    return this.model.updateOne(this.withTenant(filter, context), update);
  }

  deleteOne(filter: QueryFilter<T>, context: RepositoryContext) {
    return this.model.deleteOne(this.withTenant(filter, context));
  }

  aggregate<R = unknown>(pipeline: PipelineStage[], context: RepositoryContext) {
    return this.model.aggregate<R>([{ $match: { tenantId: context.tenantId } }, ...pipeline]);
  }

  private withTenant(filter: QueryFilter<T>, context: RepositoryContext): QueryFilter<T> {
    return { ...filter, tenantId: context.tenantId };
  }
}
