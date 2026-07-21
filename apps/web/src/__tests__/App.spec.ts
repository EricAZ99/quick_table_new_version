import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/plugins/i18n.plugin';

import App from '../App.vue';

// `App` monte désormais `CountryDetectionScreen` (Feature 2.1), qui appelle
// `fetch` dès `onMounted` — un simple smoke-test suffit ici (le
// comportement détaillé est couvert par
// `CountryDetectionScreen.spec.ts`), mais `fetch` doit être stubé pour ne
// jamais dépendre d'un vrai réseau/backend dans ce test.
describe('App — bootstrap', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { country: null, city: null } }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('se monte sans erreur et affiche le premier écran réel (Feature 2.1, écran d’inscription)', () => {
    i18n.global.locale.value = 'fr';
    const wrapper = mount(App, { global: { plugins: [i18n] } });

    expect(wrapper.text()).toContain('QuickTable');
  });
});
