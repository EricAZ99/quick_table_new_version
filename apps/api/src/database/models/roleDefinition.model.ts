import { Schema, model } from 'mongoose';

import { MEMBERSHIP_ROLES, type MembershipRole } from './membership.model.js';

/**
 * Définition versionnée des permissions accordées par défaut à chaque
 * rôle tenant (doc 08 §8.4 matrice statique, déplacée en base par doc 22
 * §22.4 — "les permissions sont des données, pas du code", doc 14 §14.4).
 * Collection **non tenant-scoped** (pas de `tenantScope` ici) : ces rôles
 * sont système, partagés par tous les tenants — le support de rôles
 * custom par tenant est explicitement V2 (doc 08 §8.1), pas construit ici.
 *
 * `roleCode` réutilise `MEMBERSHIP_ROLES`/`MembershipRole`
 * (`membership.model.ts`) plutôt que de redéfinir une seconde liste des 5
 * rôles à portée tenant — les deux ne doivent jamais diverger. `customer`
 * (accès public, doc 08 §8.5) et `super_admin` (permissions `platform:*`
 * implicites, doc 08 §8.4) ne sont volontairement pas représentés ici :
 * ni l'un ni l'autre ne passe par `rbac.middleware.ts`.
 *
 * Versionnement (doc 22 §22.4) : une seule version `isCurrent: true` par
 * `roleCode` à la fois (index partiel unique ci-dessous) — un changement
 * de la matrice insère une nouvelle version plutôt que de modifier la
 * version courante en place, pour permettre l'audit "quelles permissions
 * un Manager avait-il le 3 mars ?" (doc 22 §22.4, doc 24).
 */
export interface RoleDefinitionDocument {
  roleCode: MembershipRole;
  version: number;
  permissions: string[];
  effectiveFrom: Date;
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const roleDefinitionSchema = new Schema<RoleDefinitionDocument>(
  {
    roleCode: { type: String, required: true, enum: MEMBERSHIP_ROLES },
    version: { type: Number, required: true, min: 1 },
    // Format `resource:action` (doc 08 §8.1) — validation légère pour
    // attraper une faute de frappe évidente dans le seed, pas une
    // vérification contre le catalogue exhaustif de doc 08 §8.3 (ticket
    // séparé si un jour nécessaire, doc 14 §14.5 KISS).
    permissions: {
      type: [{ type: String, match: /^[a-z-]+:[a-z_]+$/ }],
      required: true,
      default: [],
    },
    effectiveFrom: { type: Date, required: true },
    isCurrent: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: 'roleDefinitions' },
);

roleDefinitionSchema.index(
  { roleCode: 1 },
  { unique: true, partialFilterExpression: { isCurrent: true } },
);
roleDefinitionSchema.index({ roleCode: 1, version: 1 }, { unique: true });

export const RoleDefinitionModel = model<RoleDefinitionDocument>(
  'RoleDefinition',
  roleDefinitionSchema,
);
