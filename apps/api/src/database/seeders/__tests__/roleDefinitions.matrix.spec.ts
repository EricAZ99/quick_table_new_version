import { describe, expect, it } from 'vitest';

import type { MembershipRole } from '../../models/membership.model.js';
import { ROLE_DEFINITIONS_SEED_DATA } from '../roleDefinitions.seed.js';

/**
 * Retranscription **indépendante** de la matrice doc 08 §8.4 — relue et
 * ré-écrite ici depuis le document, sans copier `roleDefinitions.seed.ts`,
 * pour que ce test ait une chance réelle d'attraper une divergence entre
 * la matrice source et le seed (une simple comparaison du seed contre
 * lui-même n'aurait aucune valeur). Seules les cellules ✅ (accordé par
 * défaut) sont incluses — jamais les 🔒 (override uniquement) ni les ➖
 * (non applicable) — même convention que `roleDefinitions.seed.ts`.
 *
 * `super_admin`/`customer` ne sont pas couverts par la matrice §8.4 (voir
 * `roleDefinition.model.ts`) et n'apparaissent donc pas ici.
 */
const EXPECTED_PERMISSIONS_BY_ROLE: Record<MembershipRole, string[]> = {
  restaurant_owner: [
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
  manager: [
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
  cashier: [
    'restaurants:read',
    'tables:change_status',
    'orders:read',
    'payments:create',
    'payments:print_receipt',
    'customers:read',
  ],
  kitchen: [
    'restaurants:read',
    'menus:toggle_availability',
    'stock:read',
    'orders:read',
    'orders:change_status',
    'kitchen:read_tickets',
    'kitchen:update_item_status',
  ],
  waiter: [
    'restaurants:read',
    'tables:change_status',
    'orders:create',
    'orders:read',
    'orders:update',
    'orders:change_status',
    'orders:transfer_table',
    'customers:read',
  ],
};

describe('Matrice de permissions doc 08 §8.4 — roleDefinitions vs transcription indépendante', () => {
  it.each(Object.keys(EXPECTED_PERMISSIONS_BY_ROLE) as MembershipRole[])(
    "le seed de '%s' accorde exactement les permissions ✅ de la matrice (ni plus, ni moins)",
    (roleCode) => {
      const entry = ROLE_DEFINITIONS_SEED_DATA.find((e) => e.roleCode === roleCode);
      expect(entry).toBeDefined();

      const seeded = new Set(entry?.permissions);
      const expected = new Set(EXPECTED_PERMISSIONS_BY_ROLE[roleCode]);

      const missing = [...expected].filter((permission) => !seeded.has(permission));
      const unexpected = [...seeded].filter((permission) => !expected.has(permission));

      expect(missing, `permissions manquantes pour ${roleCode}`).toEqual([]);
      expect(unexpected, `permissions inattendues pour ${roleCode}`).toEqual([]);
    },
  );

  it('couvre exactement les 5 rôles tenant de la matrice (doc 08 §8.2), rien de plus', () => {
    const seededRoles = ROLE_DEFINITIONS_SEED_DATA.map((entry) => entry.roleCode).sort();
    const expectedRoles = Object.keys(EXPECTED_PERMISSIONS_BY_ROLE).sort();

    expect(seededRoles).toEqual(expectedRoles);
  });

  it.each`
    roleCode     | forbidden
    ${'manager'} | ${'employees:view_salary'}
    ${'manager'} | ${'restaurants:manage_settings'}
    ${'manager'} | ${'settings:update'}
    ${'manager'} | ${'audit-logs:read'}
    ${'cashier'} | ${'orders:create'}
    ${'cashier'} | ${'payments:refund'}
    ${'kitchen'} | ${'stock:record_movement'}
    ${'waiter'}  | ${'orders:cancel'}
    ${'waiter'}  | ${'reservations:read'}
  `(
    // Redondant avec le test exact-match ci-dessus (qui prouve déjà
    // l'absence de toute permission 🔒) — conservé pour des messages
    // d'échec explicites sur des cas métier sensibles (doc 31 §31.3).
    "'$roleCode' n'a jamais '$forbidden' par défaut (🔒, override uniquement, doc 08 §8.4)",
    ({ roleCode, forbidden }: { roleCode: MembershipRole; forbidden: string }) => {
      const entry = ROLE_DEFINITIONS_SEED_DATA.find((e) => e.roleCode === roleCode);
      expect(entry?.permissions).not.toContain(forbidden);
    },
  );

  it("'restaurant_owner' a bien employees:view_salary par défaut (✅, pas 🔒 — contraste avec manager)", () => {
    const owner = ROLE_DEFINITIONS_SEED_DATA.find((entry) => entry.roleCode === 'restaurant_owner');
    expect(owner?.permissions).toContain('employees:view_salary');
  });
});
