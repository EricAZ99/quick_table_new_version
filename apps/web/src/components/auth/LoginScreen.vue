<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

import LanguageSwitcher from '@/components/ui/LanguageSwitcher.vue';
import { ApiError } from '@/shared/apiClient';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Écran de connexion (doc 07 §7.3, mockup `docs/design/01-authentification.html#login`).
 * Introduit ici (première consommation réelle de `useAuthStore`) parce que
 * le ticket suivant (édition du restaurant) a besoin d'un Access Token réel
 * pour appeler `GET/PATCH /restaurants/me` — décision validée avec toi
 * ("toujours créer le frontend quand un ticket en exige", construire
 * l'authentification réelle plutôt qu'un token de secours dev-only).
 *
 * La case "Rester connecté" du mockup n'est **pas** reprise ici :
 * `loginSchema` (`auth.validators.ts`) n'accepte aucun champ de ce type,
 * rien côté serveur ne distingue une session "longue" d'une session
 * normale — incohérence de mockup signalée, non corrigée (rien à brancher
 * dessus aujourd'hui).
 *
 * Le sélecteur de restaurant multi-tenant (`#tenant` du mockup) n'est pas
 * construit non plus : `POST /auth/select-tenant`, évoqué en commentaire
 * dans `auth.service.ts`, n'existe pas encore côté API — un utilisateur
 * avec 0 ou 2+ memberships verra l'erreur `TENANT_CONTEXT_REQUIRED` (déjà
 * localisée par le serveur) remonter depuis `RestaurantSettingsScreen`,
 * plutôt qu'un écran de sélection dédié.
 */
type Step = 'credentials' | 'twoFactor';

const { t } = useI18n();
const auth = useAuthStore();

const step = ref<Step>('credentials');
const email = ref('');
const password = ref('');
const code = ref('');
const isLoading = ref(false);
const errorMessage = ref<string | null>(null);

async function submitCredentials(): Promise<void> {
  if (!email.value || !password.value) return;
  isLoading.value = true;
  errorMessage.value = null;
  try {
    const { requires2FA } = await auth.login(email.value, password.value);
    if (requires2FA) {
      step.value = 'twoFactor';
    }
  } catch (error) {
    errorMessage.value = error instanceof ApiError ? error.message : t('auth.unexpectedError');
  } finally {
    isLoading.value = false;
  }
}

async function submitTwoFactor(): Promise<void> {
  if (!code.value) return;
  isLoading.value = true;
  errorMessage.value = null;
  try {
    await auth.verifyTwoFactor(code.value);
  } catch (error) {
    errorMessage.value = error instanceof ApiError ? error.message : t('auth.unexpectedError');
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="login-screen">
    <div class="locale-corner">
      <LanguageSwitcher />
    </div>

    <div class="card login-card">
      <h1 class="title">
        {{ t('auth.title') }}
      </h1>
      <p class="subtitle">
        {{ t('auth.subtitle') }}
      </p>

      <p v-if="errorMessage" class="banner banner-error">
        {{ errorMessage }}
      </p>

      <form v-if="step === 'credentials'" class="form" @submit.prevent="submitCredentials">
        <div class="field">
          <label for="login-email">{{ t('auth.emailLabel') }}</label>
          <input
            id="login-email"
            v-model="email"
            type="email"
            class="input"
            autocomplete="username"
            :disabled="isLoading"
            required
          />
        </div>
        <div class="field">
          <label for="login-password">{{ t('auth.passwordLabel') }}</label>
          <input
            id="login-password"
            v-model="password"
            type="password"
            class="input"
            autocomplete="current-password"
            :disabled="isLoading"
            required
          />
        </div>
        <button type="submit" class="btn btn-primary" :disabled="isLoading || !email || !password">
          {{ isLoading ? t('auth.loggingIn') : t('auth.submit') }}
        </button>
      </form>

      <form v-else class="form" @submit.prevent="submitTwoFactor">
        <p class="hint">
          {{ t('auth.twoFactorHint') }}
        </p>
        <div class="field">
          <label for="login-2fa-code">{{ t('auth.twoFactorLabel') }}</label>
          <input
            id="login-2fa-code"
            v-model="code"
            type="text"
            inputmode="numeric"
            class="input"
            autocomplete="one-time-code"
            :disabled="isLoading"
            required
          />
        </div>
        <button type="submit" class="btn btn-primary" :disabled="isLoading || !code">
          {{ isLoading ? t('auth.loggingIn') : t('auth.twoFactorSubmit') }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-screen {
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

.login-card {
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

.subtitle {
  margin: calc(var(--space-2) * -1) 0 0;
  color: var(--text-2);
  font-size: 0.9375rem;
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
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

.hint {
  margin: 0;
  color: var(--text-3);
  font-size: 0.8125rem;
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

.banner {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
}

.banner-error {
  background: var(--paprika-soft);
  color: var(--paprika-soft-ink);
  border: 1px solid var(--paprika);
}
</style>
