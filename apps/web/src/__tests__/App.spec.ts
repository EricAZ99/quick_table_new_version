import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import { i18n } from '@/plugins/i18n.plugin';

import App from '../App.vue';

describe('App — bootstrap', () => {
  it('se monte sans erreur', () => {
    const wrapper = mount(App, { global: { plugins: [i18n] } });

    expect(wrapper.text()).toContain('QuickTable');
  });

  it('affiche le sélecteur de langue et un texte traduit (doc 35 §35.1, écran de test)', () => {
    i18n.global.locale.value = 'en';
    const wrapper = mount(App, { global: { plugins: [i18n] } });

    expect(wrapper.text()).toContain('Hello from QuickTable');
    expect(wrapper.find('select').exists()).toBe(true);
  });
});
