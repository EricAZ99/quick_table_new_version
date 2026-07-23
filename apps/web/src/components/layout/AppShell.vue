<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, RouterView } from 'vue-router';

import { useAuthStore } from '@/stores/auth.store';

/**
 * Coquille des écrans authentifiés (doc 11 §11.5, `AppShell`) : sidebar de
 * navigation + `<RouterView>`. N'inclut volontairement que les deux entrées
 * réellement construites ("Mon restaurant", "Employés") — pas les autres
 * groupes de `docs/design/08-employes-reservations.html` (Dashboard,
 * Réservations, Menu, Stock, Clients…), qui n'ont pas encore d'écran.
 *
 * Chaque écran garde sa propre barre supérieure (titre, sélecteur de langue,
 * déconnexion) plutôt que de la centraliser ici — `RestaurantSettingsScreen`
 * l'a déjà et reste inchangé, dupliquer ces ~15 lignes dans `EmployeesScreen`
 * coûte moins qu'un refactor de son test existant (doc 14 §14.5).
 *
 * "Employés" n'est affiché que pour `restaurant_owner`/`manager` (doc 08
 * §8.4, seuls rôles avec `employees:read` aujourd'hui) — gating par rôle
 * brut décodé du JWT (`auth.role`), pas par permissions résolues : doc 36
 * §36.5 documente une sidebar générée depuis `usePermissions()`, mais aucun
 * endpoint n'expose les permissions résolues au client (signalé, non
 * corrigé) ; l'API reste le vrai garde-fou (403 sinon), ceci n'est qu'un
 * raccourci d'affichage.
 */
const { t } = useI18n();
const auth = useAuthStore();

const canSeeEmployeesNav = computed(
  () => auth.role === 'restaurant_owner' || auth.role === 'manager',
);
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <nav class="nav">
        <RouterLink to="/restaurant" class="nav-item" active-class="active">
          {{ t('app.nav.restaurant') }}
        </RouterLink>
        <RouterLink
          v-if="canSeeEmployeesNav"
          to="/employees"
          class="nav-item"
          active-class="active"
        >
          {{ t('app.nav.employees') }}
        </RouterLink>
      </nav>
    </aside>
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--surface-1);
  border-right: 1px solid var(--border);
  padding: var(--space-5) var(--space-4);
}

.nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.nav-item {
  display: block;
  text-decoration: none;
  font-size: 0.83125rem;
  font-weight: 600;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--text-2);
}

.nav-item:hover {
  background: var(--surface-2);
  color: var(--text-1);
}

.nav-item.active {
  background: var(--ember-soft);
  color: var(--ember-soft-ink);
}

.content {
  flex: 1;
  min-width: 0;
}
</style>
