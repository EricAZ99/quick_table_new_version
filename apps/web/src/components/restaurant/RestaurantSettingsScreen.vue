<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import LanguageSwitcher from '@/components/ui/LanguageSwitcher.vue';
import { ApiError } from '@/shared/apiClient';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Écran back-office : création/édition restaurant — "horaires, logo,
 * coordonnées" (doc 09 §9.4 `PATCH /restaurants/me`, mockup
 * `docs/design/10-statistiques-parametres.html#settings`, onglet
 * "Général"). Langue/devise/fuseau (`PATCH /restaurants/me/settings`,
 * onglet "Langue & devise" du mockup) et notifications sont hors périmètre
 * littéral de ce ticket — un ticket à la fois, doc 14 §14.5.
 *
 * "Changer le logo" du mockup suppose un vrai upload de fichier — aucune
 * infrastructure de stockage (S3/Cloudinary/multer) n'existe côté API,
 * `restaurants.model.ts` ne porte qu'un `logoUrl: string` (URL). Incohérence
 * de mockup signalée, non corrigée : construit ici comme un simple champ URL,
 * pas un sélecteur de fichier (un vrai upload serait une fonctionnalité à
 * part entière, cf. ticket "gestion du menu avec upload photo", Feature 3.2).
 */
const OPENING_HOUR_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
type OpeningHourDay = (typeof OPENING_HOUR_DAYS)[number];

interface OpeningHourDraft {
  isOpen: boolean;
  open: string;
  close: string;
}

interface RestaurantData {
  name: string;
  logoUrl?: string;
  contact?: { phone?: string; email?: string; address?: string; city?: string };
  openingHours: { day: OpeningHourDay; open: string; close: string }[];
}

const { t } = useI18n();
const auth = useAuthStore();

const isLoading = ref(true);
const isSaving = ref(false);
const errorMessage = ref<string | null>(null);
const savedAt = ref<number | null>(null);

const name = ref('');
const logoUrl = ref('');
const phone = ref('');
const email = ref('');
const address = ref('');
const city = ref('');
const hours = reactive<Record<OpeningHourDay, OpeningHourDraft>>(
  Object.fromEntries(
    OPENING_HOUR_DAYS.map((day) => [day, { isOpen: false, open: '09:00', close: '22:00' }]),
  ) as Record<OpeningHourDay, OpeningHourDraft>,
);

function applyRestaurant(restaurant: RestaurantData): void {
  name.value = restaurant.name;
  logoUrl.value = restaurant.logoUrl ?? '';
  phone.value = restaurant.contact?.phone ?? '';
  email.value = restaurant.contact?.email ?? '';
  address.value = restaurant.contact?.address ?? '';
  city.value = restaurant.contact?.city ?? '';
  for (const day of OPENING_HOUR_DAYS) {
    hours[day] = { isOpen: false, open: '09:00', close: '22:00' };
  }
  for (const entry of restaurant.openingHours) {
    hours[entry.day] = { isOpen: true, open: entry.open, close: entry.close };
  }
}

async function loadRestaurant(): Promise<void> {
  isLoading.value = true;
  errorMessage.value = null;
  try {
    const restaurant = await auth.authorizedFetch<RestaurantData>('/api/v1/restaurants/me');
    applyRestaurant(restaurant);
  } catch (error) {
    errorMessage.value = error instanceof ApiError ? error.message : t('auth.unexpectedError');
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadRestaurant);

async function save(): Promise<void> {
  isSaving.value = true;
  errorMessage.value = null;
  savedAt.value = null;
  try {
    const contact: Record<string, string> = {};
    if (phone.value) contact.phone = phone.value;
    if (email.value) contact.email = email.value;
    if (address.value) contact.address = address.value;
    if (city.value) contact.city = city.value;

    const openingHours = OPENING_HOUR_DAYS.filter((day) => hours[day].isOpen).map((day) => ({
      day,
      open: hours[day].open,
      close: hours[day].close,
    }));

    const payload: Record<string, unknown> = { name: name.value, openingHours };
    if (logoUrl.value) payload.logoUrl = logoUrl.value;
    if (Object.keys(contact).length > 0) payload.contact = contact;

    const restaurant = await auth.authorizedFetch<RestaurantData>('/api/v1/restaurants/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    applyRestaurant(restaurant);
    savedAt.value = Date.now();
  } catch (error) {
    errorMessage.value = error instanceof ApiError ? error.message : t('auth.unexpectedError');
  } finally {
    isSaving.value = false;
  }
}

async function logout(): Promise<void> {
  await auth.logout();
}
</script>

<template>
  <div class="screen">
    <header class="topbar">
      <h1 class="title">
        {{ t('restaurantSettings.title') }}
      </h1>
      <div class="topbar-actions">
        <LanguageSwitcher />
        <button type="button" class="btn btn-ghost" @click="logout">
          {{ t('restaurantSettings.logout') }}
        </button>
      </div>
    </header>

    <main class="body">
      <p v-if="errorMessage" class="banner banner-error">
        {{ errorMessage }}
      </p>
      <p v-else-if="savedAt" class="banner banner-success">
        {{ t('restaurantSettings.saved') }}
      </p>

      <p v-if="isLoading" class="hint">
        {{ t('restaurantSettings.loading') }}
      </p>

      <form v-else class="form" @submit.prevent="save">
        <section class="card">
          <h2 class="section-title">
            {{ t('restaurantSettings.generalSection') }}
          </h2>
          <div class="field">
            <label for="rs-name">{{ t('restaurantSettings.nameLabel') }}</label>
            <input id="rs-name" v-model="name" class="input" required />
          </div>
          <div class="field">
            <label for="rs-logo">{{ t('restaurantSettings.logoUrlLabel') }}</label>
            <input
              id="rs-logo"
              v-model="logoUrl"
              type="url"
              class="input"
              placeholder="https://…"
            />
          </div>
          <div class="row2">
            <div class="field">
              <label for="rs-phone">{{ t('restaurantSettings.phoneLabel') }}</label>
              <input id="rs-phone" v-model="phone" class="input" />
            </div>
            <div class="field">
              <label for="rs-email">{{ t('restaurantSettings.emailLabel') }}</label>
              <input id="rs-email" v-model="email" type="email" class="input" />
            </div>
          </div>
          <div class="field">
            <label for="rs-address">{{ t('restaurantSettings.addressLabel') }}</label>
            <input id="rs-address" v-model="address" class="input" />
          </div>
          <div class="field">
            <label for="rs-city">{{ t('restaurantSettings.cityLabel') }}</label>
            <input id="rs-city" v-model="city" class="input" />
          </div>
        </section>

        <section class="card">
          <h2 class="section-title">
            {{ t('restaurantSettings.hoursSection') }}
          </h2>
          <div v-for="day in OPENING_HOUR_DAYS" :key="day" class="hours-row">
            <label class="hours-day">
              <input
                v-model="hours[day].isOpen"
                type="checkbox"
                :aria-label="t(`restaurantSettings.days.${day}`)"
              />
              {{ t(`restaurantSettings.days.${day}`) }}
            </label>
            <template v-if="hours[day].isOpen">
              <input v-model="hours[day].open" type="time" class="input input-time" />
              <span class="hours-sep">–</span>
              <input v-model="hours[day].close" type="time" class="input input-time" />
            </template>
            <span v-else class="hours-closed">{{ t('restaurantSettings.dayClosed') }}</span>
          </div>
        </section>

        <button type="submit" class="btn btn-primary" :disabled="isSaving || !name">
          {{ isSaving ? t('restaurantSettings.saving') : t('restaurantSettings.save') }}
        </button>
      </form>
    </main>
  </div>
</template>

<style scoped>
.screen {
  min-height: 100vh;
  box-sizing: border-box;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-1);
}

.body {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  box-sizing: border-box;
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.card {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-1);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.section-title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-1);
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

.row2 {
  display: flex;
  gap: var(--space-4);
}

.row2 .field {
  flex: 1;
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

.hours-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: 0.875rem;
  color: var(--text-1);
}

.hours-day {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 120px;
  flex-shrink: 0;
}

.input-time {
  width: 110px;
  padding: 0 var(--space-2);
}

.hours-sep {
  color: var(--text-3);
}

.hours-closed {
  color: var(--text-3);
  font-size: 0.8125rem;
}

.hint {
  margin: 0;
  color: var(--text-2);
  font-size: 0.9375rem;
}

.btn {
  height: 38px;
  align-self: flex-start;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  font-weight: 600;
  font-size: 0.84375rem;
  cursor: pointer;
  padding: 0 var(--space-5);
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

.btn-ghost {
  background: transparent;
  border-color: var(--border-strong);
  color: var(--text-2);
  height: 32px;
  padding: 0 var(--space-3);
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

.banner-success {
  background: var(--basil-soft);
  color: var(--basil-soft-ink);
  border: 1px solid var(--basil);
}
</style>
