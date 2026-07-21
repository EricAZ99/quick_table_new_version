import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/plugins/i18n.plugin';

import App from '../App.vue';

// `App` bascule désormais entre `LoginScreen` (non authentifié) et
// `RestaurantSettingsScreen` (Feature 2.1, ticket "back-office restaurant")
// selon `authStore.isAuthenticated` — un simple smoke-test suffit ici (le
// comportement détaillé de chaque écran est couvert par ses propres
// specs), mais `fetch` doit être stubé : `onMounted` appelle
// `auth.restoreSession()` (`POST /auth/refresh`).
describe('App — porte d’authentification', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, ok: false }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('se monte sans erreur et affiche l’écran de connexion par défaut (pas de session restaurable)', async () => {
    i18n.global.locale.value = 'fr';
    const wrapper = mount(App, { global: { plugins: [i18n, createPinia()] } });
    await flushPromises();

    expect(wrapper.text()).toContain('Bon retour');
  });
});
