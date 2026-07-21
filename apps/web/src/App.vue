<script setup lang="ts">
import { onMounted } from 'vue';

import LoginScreen from '@/components/auth/LoginScreen.vue';
import RestaurantSettingsScreen from '@/components/restaurant/RestaurantSettingsScreen.vue';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Composant racine (doc 03 §3.2). Bascule entre `LoginScreen` et
 * `RestaurantSettingsScreen` selon `authStore.isAuthenticated` — pas de
 * Router : ce n'est qu'une porte d'authentification à deux états, pas une
 * navigation entre plusieurs pages adressables, le Router restant reporté
 * jusqu'à un vrai besoin de ce type (doc 14 §14.5 KISS).
 *
 * `CountryDetectionScreen` (ticket précédent, flux d'inscription) n'est
 * plus monté ici : les deux écrans ne peuvent pas coexister sans Router, et
 * ce ticket porte sur le flux de gestion d'un restaurant existant
 * (connexion → édition), pas sur l'inscription. Le composant reste
 * entièrement implémenté et testé (`CountryDetectionScreen.spec.ts`),
 * simplement non atteignable depuis `App.vue` pour l'instant.
 */
const auth = useAuthStore();

onMounted(() => {
  void auth.restoreSession();
});
</script>

<template>
  <LoginScreen v-if="!auth.isAuthenticated" />
  <RestaurantSettingsScreen v-else />
</template>
