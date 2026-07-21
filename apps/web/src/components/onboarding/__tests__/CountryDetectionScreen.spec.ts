import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/plugins/i18n.plugin';

import CountryDetectionScreen from '../CountryDetectionScreen.vue';

// `LanguageSwitcher` (toujours affiché, `.locale-corner`) a lui aussi un
// `<select>` — `#country-select` cible sans ambiguïté celui du pays,
// jamais `find('select')` seul (qui matcherait le premier du DOM, celui
// de la langue, avant même d'atteindre l'étape manuelle).
const COUNTRY_SELECT = '#country-select';

function stubDetectLocation(data: { country: string | null; city: string | null }) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data }),
    }),
  );
}

async function mountScreen() {
  const wrapper = mount(CountryDetectionScreen, { global: { plugins: [i18n] } });
  await flushPromises();
  return wrapper;
}

describe('CountryDetectionScreen', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'fr';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('affiche un état de détection au montage, avant que la réponse ne revienne', () => {
    stubDetectLocation({ country: 'FR', city: 'Paris' });
    const wrapper = mount(CountryDetectionScreen, { global: { plugins: [i18n] } });

    expect(wrapper.text()).toContain('Détection de votre pays');
  });

  it('propose de confirmer un pays détecté et supporté (doc 35 §35.2)', async () => {
    stubDetectLocation({ country: 'FR', city: 'Paris' });
    const wrapper = await mountScreen();

    expect(wrapper.text()).toContain('France');
    expect(wrapper.findAll('button')).toHaveLength(2);
    expect(wrapper.find(COUNTRY_SELECT).exists()).toBe(false);
  });

  it('émet confirmed avec countryDetectionMethod:geoip quand on confirme le pays détecté', async () => {
    stubDetectLocation({ country: 'FR', city: 'Paris' });
    const wrapper = await mountScreen();

    await wrapper.findAll('button')[0]?.trigger('click');

    expect(wrapper.emitted('confirmed')).toEqual([
      [{ country: 'FR', countryDetectionMethod: 'geoip' }],
    ]);
    expect(wrapper.text()).toContain('Pays sélectionné');
  });

  it("bascule en sélection manuelle si le pays détecté n'est pas le sien", async () => {
    stubDetectLocation({ country: 'FR', city: 'Paris' });
    const wrapper = await mountScreen();

    await wrapper.findAll('button')[1]?.trigger('click');

    expect(wrapper.find(COUNTRY_SELECT).exists()).toBe(true);
  });

  it('passe directement en sélection manuelle si la détection échoue (country:null, doc 35 §35.2)', async () => {
    stubDetectLocation({ country: null, city: null });
    const wrapper = await mountScreen();

    expect(wrapper.find(COUNTRY_SELECT).exists()).toBe(true);
    expect(wrapper.text()).toContain("n'avons pas pu détecter");
  });

  it("passe directement en sélection manuelle si le pays détecté n'est pas dans la liste supportée (countryDefaults, doc 05)", async () => {
    stubDetectLocation({ country: 'DE', city: 'Berlin' });
    const wrapper = await mountScreen();

    expect(wrapper.find(COUNTRY_SELECT).exists()).toBe(true);
  });

  it('désactive le bouton continuer tant que rien n’est sélectionné manuellement', async () => {
    stubDetectLocation({ country: null, city: null });
    const wrapper = await mountScreen();

    const continueButton = wrapper.find('button.btn-primary');
    expect(continueButton.attributes('disabled')).toBeDefined();
  });

  it('émet confirmed avec countryDetectionMethod:manual après une sélection manuelle', async () => {
    stubDetectLocation({ country: null, city: null });
    const wrapper = await mountScreen();

    await wrapper.find(COUNTRY_SELECT).setValue('IT');
    await wrapper.find('button.btn-primary').trigger('click');

    expect(wrapper.emitted('confirmed')).toEqual([
      [{ country: 'IT', countryDetectionMethod: 'manual' }],
    ]);
  });

  it('permet de revenir en sélection manuelle depuis l’écran confirmé ("Modifier")', async () => {
    stubDetectLocation({ country: 'FR', city: 'Paris' });
    const wrapper = await mountScreen();
    await wrapper.findAll('button')[0]?.trigger('click');

    await wrapper.find('button.btn-ghost').trigger('click');

    expect(wrapper.find(COUNTRY_SELECT).exists()).toBe(true);
  });

  it('affiche toujours le sélecteur de langue, y compris pendant la sélection du pays (Feature 0.4)', async () => {
    stubDetectLocation({ country: null, city: null });
    const wrapper = await mountScreen();

    expect(wrapper.findAll('select')).toHaveLength(2);
  });
});
