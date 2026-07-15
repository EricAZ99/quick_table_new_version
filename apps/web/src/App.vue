<script setup lang="ts">
import LanguageSwitcher from '@/components/ui/LanguageSwitcher.vue';

// Composant racine minimal (doc 03 §3.2). Remplacé progressivement par le
// Router + les layouts (AdminLayout, CustomerLayout, doc 03 §3.2) au fil des
// tickets Epic 1+. Sert aussi d'écran de test pour le sélecteur de langue
// (Feature 0.4, doc 35 §35.4) tant qu'aucun vrai écran n'existe.
</script>

<template>
  <main>
    <p>QuickTable — bootstrap OK</p>
    <p>{{ $t('app.greeting') }}</p>
    <LanguageSwitcher />
  </main>
</template>
