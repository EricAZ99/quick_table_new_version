<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import LanguageSwitcher from '@/components/ui/LanguageSwitcher.vue';
import { useCountryDetection } from '@/composables/useCountryDetection';

/**
 * Écran d'inscription — étape pays (doc 34 Feature 2.1, doc 35 §35.2).
 * Version autonome minimale (décision validée avec toi) : ni Router ni
 * Pinia (aucun des deux n'existe encore dans l'app, doc 03 §3.2 les
 * prévoit pour plus tard), aucune soumission réelle vers le backend.
 * `POST /platform/restaurants` (seul endpoint de création existant,
 * doc 09 §9.3) est réservé `super_admin` et exige un `ownerId` déjà
 * existant — il n'y a pas encore de route d'inscription self-service
 * publique (doc 06 §6.7 en évoque le principe sans qu'il soit construit,
 * incohérence entre le nom du ticket et la surface d'API réelle,
 * signalée). Ce composant s'arrête donc à la confirmation du pays et
 * émet le résultat (`confirmed`) pour qu'un futur flux d'inscription
 * complet puisse le consommer.
 *
 * Pays limités aux 5 couverts par `countryDefaults` côté backend (Feature
 * 0.4/2.1) — un pays hors de cette liste ferait échouer la dérivation
 * locale/devise/fuseau à la création réelle (422
 * `RESTAURANT_COUNTRY_DEFAULTS_MISSING`), autant ne jamais le proposer ici.
 */
const SUPPORTED_COUNTRIES = ['BJ', 'FR', 'IT', 'ES', 'US'] as const;
type SupportedCountry = (typeof SUPPORTED_COUNTRIES)[number];
type CountryDetectionMethod = 'manual' | 'geoip';

const COUNTRY_FLAGS: Record<SupportedCountry, string> = {
  BJ: '🇧🇯',
  FR: '🇫🇷',
  IT: '🇮🇹',
  ES: '🇪🇸',
  US: '🇺🇸',
};

function isSupportedCountry(value: string | null | undefined): value is SupportedCountry {
  return Boolean(value) && (SUPPORTED_COUNTRIES as readonly string[]).includes(value as string);
}

const emit = defineEmits<{
  confirmed: [
    payload: { country: SupportedCountry; countryDetectionMethod: CountryDetectionMethod },
  ];
}>();

const { t } = useI18n();
const { hasError, detected, detect } = useCountryDetection();

type Step = 'detecting' | 'confirm-detected' | 'manual' | 'confirmed';
const step = ref<Step>('detecting');
const manualSelection = ref<SupportedCountry | ''>('');
const confirmedCountry = ref<SupportedCountry | null>(null);

const detectedCountry = computed(() => {
  const country = detected.value?.country;
  return isSupportedCountry(country) ? country : null;
});

onMounted(async () => {
  await detect();
  step.value = detectedCountry.value ? 'confirm-detected' : 'manual';
});

function confirmDetected(): void {
  const country = detectedCountry.value;
  if (!country) return;
  confirmedCountry.value = country;
  step.value = 'confirmed';
  emit('confirmed', { country, countryDetectionMethod: 'geoip' });
}

function rejectDetected(): void {
  step.value = 'manual';
}

function submitManual(): void {
  if (!manualSelection.value) return;
  confirmedCountry.value = manualSelection.value;
  step.value = 'confirmed';
  emit('confirmed', { country: manualSelection.value, countryDetectionMethod: 'manual' });
}

function changeCountry(): void {
  step.value = 'manual';
  confirmedCountry.value = null;
  manualSelection.value = '';
}
</script>

<template>
  <div class="onboarding-screen">
    <div class="locale-corner">
      <LanguageSwitcher />
    </div>

    <div class="card onboarding-card">
      <h1 class="title">
        {{ t('onboarding.title') }}
      </h1>

      <div v-if="step === 'detecting'" class="state state-detecting">
        <span class="spinner" aria-hidden="true" />
        <p>{{ t('onboarding.detecting') }}</p>
      </div>

      <div v-else-if="step === 'confirm-detected'" class="state state-confirm">
        <p class="detected-line">
          <span class="flag" aria-hidden="true">{{
            COUNTRY_FLAGS[detectedCountry as SupportedCountry]
          }}</span>
          {{ t('onboarding.detectedQuestion', { country: t(`countries.${detectedCountry}`) }) }}
        </p>
        <div class="actions">
          <button type="button" class="btn btn-primary" @click="confirmDetected">
            {{ t('onboarding.confirm') }}
          </button>
          <button type="button" class="btn btn-secondary" @click="rejectDetected">
            {{ t('onboarding.notMyCountry') }}
          </button>
        </div>
      </div>

      <div v-else-if="step === 'manual'" class="state state-manual">
        <p v-if="hasError || !detectedCountry" class="hint">
          {{ t('onboarding.detectionFailed') }}
        </p>
        <div class="field">
          <label for="country-select">{{ t('onboarding.manualLabel') }}</label>
          <select id="country-select" v-model="manualSelection" class="input">
            <option value="" disabled>—</option>
            <option v-for="code in SUPPORTED_COUNTRIES" :key="code" :value="code">
              {{ COUNTRY_FLAGS[code] }} {{ t(`countries.${code}`) }}
            </option>
          </select>
        </div>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!manualSelection"
          @click="submitManual"
        >
          {{ t('onboarding.continue') }}
        </button>
      </div>

      <div v-else-if="step === 'confirmed'" class="state state-confirmed">
        <p class="banner banner-success">
          {{ t('onboarding.confirmedSummary', { country: t(`countries.${confirmedCountry}`) }) }}
        </p>
        <button type="button" class="btn btn-ghost" @click="changeCountry">
          {{ t('onboarding.change') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.onboarding-screen {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-6);
  padding: var(--space-6);
  box-sizing: border-box;
}

.locale-corner {
  align-self: flex-end;
}

.card {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-2);
}

.onboarding-card {
  width: 100%;
  max-width: 380px;
  padding: var(--space-7);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  box-sizing: border-box;
}

.title {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--text-1);
}

.state {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.state-detecting {
  align-items: center;
  color: var(--text-2);
}

.spinner {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-full);
  border: 2px solid var(--border-strong);
  border-top-color: var(--accent);
  animation: spin var(--dur-base) linear infinite;
  animation-duration: 800ms;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.detected-line {
  margin: 0;
  color: var(--text-1);
  font-size: 0.9375rem;
  line-height: 1.5;
}

.flag {
  margin-right: var(--space-2);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.hint {
  margin: 0;
  color: var(--text-3);
  font-size: 0.8125rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.field label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-2);
}

.input {
  height: 38px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-3);
  background: var(--surface-1);
  color: var(--text-1);
  font-family: var(--font-ui);
  font-size: 0.9375rem;
}

.input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--ember-soft);
}

.btn {
  height: 38px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  font-weight: 600;
  font-size: 0.84375rem;
  cursor: pointer;
  transition: filter var(--dur-fast) var(--ease);
}

.btn-primary {
  background: var(--accent);
  color: var(--accent-ink);
}

.btn-primary:hover:not(:disabled) {
  filter: brightness(1.08);
}

.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--surface-2);
  border-color: var(--border-strong);
  color: var(--text-1);
}

.btn-ghost {
  background: transparent;
  border-color: transparent;
  color: var(--text-2);
  align-self: flex-start;
}

.banner-success {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  background: var(--basil-soft);
  color: var(--basil-soft-ink);
  border: 1px solid var(--basil);
  font-size: 0.875rem;
}
</style>
