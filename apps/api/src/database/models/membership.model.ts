import { Schema, Types, model } from 'mongoose';

import { tenantScope } from './plugins/tenantScope.js';

export const MEMBERSHIP_ROLES = [
  'restaurant_owner',
  'manager',
  'cashier',
  'kitchen',
  'waiter',
] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/**
 * Jonction Utilisateur ↔ Restaurant, porteuse du rôle (doc 05 §"memberships")
 * — tenant-scoped (`tenantScope` plugin, doc 06 §6.4). `role` couvre les 5
 * rôles à portée tenant de doc 08 §8.2 ; `super_admin` (portée plateforme) et
 * `customer` (collection `customers` séparée) n'ont volontairement pas de
 * `membership`.
 *
 * `tenantId` figure dans l'interface TypeScript mais **pas** dans la
 * définition du schéma ci-dessous : `tenantScope` l'ajoute lui-même au
 * schéma à l'exécution (même convention que `helloWorld.model.ts`).
 *
 * Hors périmètre de ce ticket (juste le schéma) : la résolution combinée
 * rôle + `permissionsOverrides`, le contrôle de visibilité de `salary`
 * (doc 05 : "visible uniquement par restaurant_owner/manager habilité") —
 * arrivent avec `rbac.middleware.ts` (Feature 1.4), pas anticipés ici
 * (doc 14 §14.5 KISS).
 */
export interface MembershipDocument {
  tenantId: string;
  userId: Types.ObjectId;
  role: MembershipRole;
  permissionsOverrides: string[];
  jobTitle?: string;
  salary?: number;
  employmentStatus: 'active' | 'inactive';
  hiredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const membershipSchema = new Schema<MembershipDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, required: true, enum: MEMBERSHIP_ROLES },
    permissionsOverrides: { type: [String], default: [] },
    jobTitle: { type: String, trim: true },
    salary: { type: Number, min: 0 },
    employmentStatus: {
      type: String,
      required: true,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    hiredAt: { type: Date },
  },
  { timestamps: true, collection: 'memberships' },
);

membershipSchema.plugin(tenantScope);

// Un même employé n'a qu'un seul rôle par restaurant (doc 05 : "un couple
// (tenantId, userId) ne peut exister qu'une fois") — les ajustements fins
// passent par `permissionsOverrides`, jamais par un second membership.
membershipSchema.index({ tenantId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ tenantId: 1, role: 1 });
membershipSchema.index({ userId: 1 });

export const MembershipModel = model<MembershipDocument>('Membership', membershipSchema);
