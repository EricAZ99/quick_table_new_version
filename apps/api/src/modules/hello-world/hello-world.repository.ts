import {
  HelloWorldModel,
  type HelloWorldDocument,
} from '../../database/models/helloWorld.model.js';
import { BaseRepository, type RepositoryContext } from '../../shared/base/BaseRepository.js';
import type { CreateHelloWorldDto } from './hello-world.validators.js';

/**
 * `create` n'existe pas sur `BaseRepository` (doc 06 §6.4 ne liste que
 * find/findOne/updateOne/deleteOne/aggregate — la création reste
 * spécifique à chaque module). Méthode ajoutée ici, à répliquer par
 * chaque futur repository de module : injecte `tenantId` depuis le
 * `context`, jamais depuis les données fournies par l'appelant.
 */
export class HelloWorldRepository extends BaseRepository<HelloWorldDocument> {
  constructor() {
    super(HelloWorldModel);
  }

  create(dto: CreateHelloWorldDto, context: RepositoryContext) {
    return this.model.create({ ...dto, tenantId: context.tenantId });
  }
}
