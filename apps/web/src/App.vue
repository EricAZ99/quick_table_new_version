<script setup lang="ts">
import CountryDetectionScreen from '@/components/onboarding/CountryDetectionScreen.vue';

// Composant racine (doc 03 §3.2). Monte directement le premier vrai écran
// (Feature 2.1, "Écran d'inscription") tant que le Router n'existe pas —
// remplacé par le Router + les layouts (AdminLayout, CustomerLayout) dès
// qu'un deuxième écran en aura besoin.
</script>

<template>
  <CountryDetectionScreen />
</template>
