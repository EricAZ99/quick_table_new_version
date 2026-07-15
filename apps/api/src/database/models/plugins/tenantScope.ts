import type { PipelineStage, Schema } from 'mongoose';

/**
 * Ligne de défense n°2 sur 3 contre une fuite inter-tenant (doc 06 §6.4),
 * indépendante de `BaseRepository` (ligne n°1) : garde-fou au niveau
 * schéma Mongoose. Même si un repository de module contourne un jour
 * `BaseRepository` (bug humain), toute requête sans `tenantId` échoue à
 * l'exécution plutôt que de retourner silencieusement des données d'un
 * autre tenant.
 *
 * Double rôle (doc 03, explication des dossiers clés) : déclare le champ
 * `tenantId` + son index sur le schéma (un schéma de module ne le
 * redéclare jamais, ne peut donc pas l'oublier), **et** garde les requêtes.
 *
 * `timestamps` (doc 12 §12.7) n'a volontairement pas de plugin dédié ici :
 * c'est une option native Mongoose (`{ timestamps: true }`), pas du code à
 * écrire — chaque schéma de module l'active directement dans ses
 * `SchemaOptions`, aux côtés de `schema.plugin(tenantScope)`.
 */

export const MISSING_TENANT_ID_MESSAGE =
  'tenantScope : tenantId manquant dans la requête — deuxième filet de sécurité (doc 06 §6.4), la première ligne de défense (BaseRepository) aurait dû le fournir.';

/** Fonction pure, testable indépendamment des hooks Mongoose (find/findOne/updateOne/updateMany/deleteOne). */
export function assertTenantIdInFilter(filter: Record<string, unknown> | undefined): void {
  if (!filter?.tenantId) {
    throw new Error(MISSING_TENANT_ID_MESSAGE);
  }
}

/** Fonction pure, testable indépendamment du hook Mongoose (aggregate). */
export function assertTenantIdInPipeline(pipeline: readonly PipelineStage[]): void {
  const hasTenantMatch = pipeline.some(
    (stage) =>
      '$match' in stage &&
      typeof stage.$match === 'object' &&
      stage.$match !== null &&
      'tenantId' in stage.$match,
  );
  if (!hasTenantMatch) {
    throw new Error(MISSING_TENANT_ID_MESSAGE);
  }
}

export function tenantScope(schema: Schema): void {
  // doc 03 (explication des dossiers clés) : le plugin déclare lui-même le
  // champ `tenantId` + son index — un schéma de module n'a pas besoin de le
  // redéclarer, et ne peut donc pas non plus l'oublier par erreur humaine.
  schema.add({ tenantId: { type: String, required: true } });
  schema.index({ tenantId: 1 });

  // Mongoose 9 : les hooks `pre` n'ont plus de callback `next` — throw
  // (ou rejeter une Promise) annule l'opération, un retour normal la
  // laisse continuer (types `PreMiddlewareFunction`, mongoose/types/middlewares.d.ts).
  //
  // Couvre les 5 méthodes exposées par `BaseRepository` (doc 06 §6.4 point
  // 1 : find/findOne/updateOne/deleteOne/aggregate) — `updateMany` en plus
  // par cohérence, bien que `BaseRepository` ne l'expose pas encore.
  // `updateOne`/`deleteOne` étaient absents de la liste de hooks du doc 06
  // §6.4 point 2 (écart signalé et corrigé, cf. doc).
  schema.pre(['find', 'findOne', 'updateOne', 'updateMany', 'deleteOne'], function () {
    assertTenantIdInFilter(this.getFilter());
  });

  schema.pre('aggregate', function () {
    assertTenantIdInPipeline(this.pipeline());
  });
}
