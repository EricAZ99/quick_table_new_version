<script setup lang="ts">
import { onMounted } from 'vue';

import LoginScreen from '@/components/auth/LoginScreen.vue';
import AppShell from '@/components/layout/AppShell.vue';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Composant racine (doc 03 §3.2). Bascule entre `LoginScreen` et `AppShell`
 * selon `authStore.isAuthenticated` — cette porte d'authentification à deux
 * états reste une simple condition, pas une route : le Router (`router/`,
 * introduit avec le ticket "écran Employés") ne gère que la navigation
 * *entre* écrans authentifiés, jamais l'état connecté/non connecté.
 *
 * `CountryDetectionScreen` (ticket précédent, flux d'inscription) reste non
 * atteignable depuis ici, inchangé — toujours hors périmètre (inscription,
 * pas gestion d'un restaurant existant).
 */
const auth = useAuthStore();

onMounted(() => {
  void auth.restoreSession();
});
</script>

<template>
  <LoginScreen v-if="!auth.isAuthenticated" />
  <AppShell v-else />
</template>
