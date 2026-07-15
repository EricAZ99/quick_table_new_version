import { Schema, model } from 'mongoose';

import { tenantScope } from './plugins/tenantScope.js';

/**
 * Modèle de démonstration (doc 15 §Phase 0 — module "Hello World") : traverse
 * toutes les couches (doc 12) pour valider le patron à répliquer par les
 * modules métier de l'Epic 1+, pas un vrai concept produit.
 *
 * `tenantId` figure dans l'interface TypeScript mais **pas** dans la
 * définition du schéma ci-dessous : `tenantScope` l'ajoute lui-même au
 * schéma à l'exécution (`schema.add`, doc 03) — TypeScript ne peut pas
 * introspecter cet ajout dynamique, donc chaque futur modèle tenant-scoped
 * doit déclarer `tenantId: string` dans son interface tout en laissant le
 * plugin gérer la définition Mongoose réelle.
 */
export interface HelloWorldDocument {
  tenantId: string;
  message: string;
  createdAt: Date;
  updatedAt: Date;
}

const helloWorldSchema = new Schema<HelloWorldDocument>(
  {
    message: { type: String, required: true, trim: true, maxlength: 200 },
  },
  { timestamps: true, collection: 'helloWorlds' },
);

helloWorldSchema.plugin(tenantScope);

export const HelloWorldModel = model<HelloWorldDocument>('HelloWorld', helloWorldSchema);
