import type { RepositoryContext } from '../../shared/base/BaseRepository.js';
import type { HelloWorldRepository } from './hello-world.repository.js';
import type { CreateHelloWorldDto } from './hello-world.validators.js';

/**
 * Logique métier (doc 12 §12.2) — volontairement minimale ici : le module
 * de référence n'a pas de vraie règle métier, seulement l'orchestration
 * repository que tout futur service métier reproduira (validation faite en
 * amont par le controller, jamais de règle dans le repository).
 */
export class HelloWorldService {
  constructor(private readonly repository: HelloWorldRepository) {}

  create(dto: CreateHelloWorldDto, context: RepositoryContext) {
    return this.repository.create(dto, context);
  }

  list(context: RepositoryContext) {
    return this.repository.find({}, context);
  }
}
