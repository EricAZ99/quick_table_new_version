import type { MembershipRole } from '../models/membership.model.js';
import { RoleDefinitionModel } from '../models/roleDefinition.model.js';

interface RoleDefinitionSeed {
  roleCode: MembershipRole;
  permissions: readonly string[];
}

/**
 * Transcription **littérale** de la matrice doc 08 §8.4 : seules les
 * cellules ✅ (accordé par défaut) sont incluses. Les cellules 🔒
 * (accordé uniquement via `permissionsOverrides` explicite d'un
 * membership) sont volontairement exclues du seed — ce ne sont pas des
 * permissions par défaut du rôle. `super_admin` et `customer` ne sont pas
 * seedés ici (doc 08 §8.4/§8.5, voir `roleDefinition.model.ts`).
 *
 * **Incohérence de doc signalée, non corrigée** (décision validée avec
 * toi, "seeder strictement la matrice écrite") : plusieurs permissions du
 * catalogue (doc 08 §8.3) n'apparaissent dans **aucune** ligne de la
 * matrice §8.4, pour aucun rôle — `employees:read`, `tables:read`,
 * `menus:read`, `payments:read`, `subscriptions:read`, ainsi que tout le
 * groupe `notifications:*` et `qrcode:regenerate`. Probablement un oubli
 * (un manager sans `employees:read` ne pourrait jamais lister son
 * équipe), mais l'intention du Product Owner n'est pas devinée ici — ces
 * permissions ne sont donc accordées à aucun rôle pour l'instant. Sans
 * impact fonctionnel aujourd'hui : aucun endpoint réel ne consomme encore
 * `employees`/`tables`/`menus`/`payments`/`notifications`/`qrcode`
 * (Epic 2+, pas commencé).
 *
 * La portée `own` de doc 08 §8.8 (`orders:read`/`orders:update` pour
 * `waiter`) n'a pas de représentation dans le schéma `roleDefinitions` de
 * doc 22 §22.4 (`permissions: string[]` plat, pas de champ scope) —
 * incohérence de doc également signalée, sans impact ici puisque le
 * module `orders` n'existe pas encore (Epic 3) : la permission est
 * accordée telle quelle (portée `all` par défaut), la restriction `own`
 * sera résolue par `rbac.middleware.ts` quand `orders` existera.
 */
export const ROLE_DEFINITIONS_SEED_DATA: readonly RoleDefinitionSeed[] = [
  {
    roleCode: 'restaurant_owner',
    permissions: [
      'restaurants:read',
      'restaurants:update',
      'restaurants:manage_settings',
      'employees:create',
      'employees:update',
      'employees:delete',
      'employees:view_salary',
      'rooms:create',
      'rooms:read',
      'rooms:update',
      'rooms:delete',
      'tables:create',
      'tables:update',
      'tables:delete',
      'tables:change_status',
      'menus:create',
      'menus:update',
      'menus:delete',
      'menus:toggle_availability',
      'stock:read',
      'stock:manage_ingredients',
      'stock:manage_suppliers',
      'stock:record_movement',
      'orders:create',
      'orders:read',
      'orders:update',
      'orders:change_status',
      'orders:cancel',
      'orders:transfer_table',
      'kitchen:read_tickets',
      'kitchen:update_item_status',
      'payments:create',
      'payments:refund',
      'payments:print_receipt',
      'reservations:create',
      'reservations:read',
      'reservations:update',
      'reservations:cancel',
      'customers:create',
      'customers:read',
      'customers:update',
      'customers:view_history',
      'statistics:view_basic',
      'statistics:view_advanced',
      'subscriptions:manage',
      'billing:read',
      'billing:manage_payment_method',
      'settings:read',
      'settings:update',
      'audit-logs:read',
    ],
  },
  {
    roleCode: 'manager',
    permissions: [
      'restaurants:read',
      'employees:create',
      'employees:update',
      'employees:delete',
      'rooms:create',
      'rooms:read',
      'rooms:update',
      'rooms:delete',
      'tables:create',
      'tables:update',
      'tables:delete',
      'tables:change_status',
      'menus:create',
      'menus:update',
      'menus:delete',
      'menus:toggle_availability',
      'stock:read',
      'stock:manage_ingredients',
      'stock:manage_suppliers',
      'stock:record_movement',
      'orders:create',
      'orders:read',
      'orders:update',
      'orders:change_status',
      'orders:cancel',
      'orders:transfer_table',
      'kitchen:read_tickets',
      'kitchen:update_item_status',
      'payments:create',
      'payments:refund',
      'payments:print_receipt',
      'reservations:create',
      'reservations:read',
      'reservations:update',
      'reservations:cancel',
      'customers:create',
      'customers:read',
      'customers:update',
      'customers:view_history',
      'statistics:view_basic',
      'statistics:view_advanced',
    ],
  },
  {
    roleCode: 'cashier',
    permissions: [
      'restaurants:read',
      'tables:change_status',
      'orders:read',
      'payments:create',
      'payments:print_receipt',
      'customers:read',
    ],
  },
  {
    roleCode: 'kitchen',
    permissions: [
      'restaurants:read',
      'menus:toggle_availability',
      'stock:read',
      'orders:read',
      'orders:change_status',
      'kitchen:read_tickets',
      'kitchen:update_item_status',
    ],
  },
  {
    roleCode: 'waiter',
    permissions: [
      'restaurants:read',
      'tables:change_status',
      'orders:create',
      'orders:read',
      'orders:update',
      'orders:change_status',
      'orders:transfer_table',
      'customers:read',
    ],
  },
];

function sameSortedPermissions(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

/**
 * Idempotent et versionné (doc 22 §22.4) : contrairement à
 * `countryDefaults.seed.ts` (simple upsert), une nouvelle version n'est
 * insérée que si les permissions cibles diffèrent de la version courante
 * — la version courante précédente n'est jamais modifiée en place
 * (`isCurrent: false` seulement), pour préserver l'historique d'audit.
 * Rejouer ce seed sans changement de matrice ne crée donc aucune nouvelle
 * version.
 */
export async function seedRoleDefinitions(): Promise<void> {
  for (const entry of ROLE_DEFINITIONS_SEED_DATA) {
    const current = await RoleDefinitionModel.findOne({
      roleCode: entry.roleCode,
      isCurrent: true,
    });

    if (current && sameSortedPermissions(current.permissions, entry.permissions)) {
      continue;
    }

    if (current) {
      await RoleDefinitionModel.updateOne({ _id: current._id }, { $set: { isCurrent: false } });
    }

    await RoleDefinitionModel.create({
      roleCode: entry.roleCode,
      version: (current?.version ?? 0) + 1,
      permissions: [...entry.permissions],
      effectiveFrom: new Date(),
      isCurrent: true,
    });
  }
}
