<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import { SUPPORTED_LOCALES } from '@/plugins/i18n.plugin';

// Composant "bête" (doc 11 §11 point 2) : ne connaît que la locale courante,
// aucune logique métier (préférence utilisateur/restaurant, Epic 1+/2).
const { locale } = useI18n();
</script>

<template>
  <label>
    {{ $t('language.label') }}
    <select v-model="locale">
      <option v-for="code in SUPPORTED_LOCALES" :key="code" :value="code">
        {{ code.toUpperCase() }}
      </option>
    </select>
  </label>
</template>
