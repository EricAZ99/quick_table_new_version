import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import { i18n, SUPPORTED_LOCALES } from '@/plugins/i18n.plugin';

import LanguageSwitcher from '../LanguageSwitcher.vue';

describe('LanguageSwitcher', () => {
  it('affiche une option par langue supportée (doc 35 §35.1 : FR/EN/IT/ES)', () => {
    const wrapper = mount(LanguageSwitcher, { global: { plugins: [i18n] } });
    const options = wrapper.findAll('option').map((o) => o.element.value);

    expect(options).toEqual([...SUPPORTED_LOCALES]);
  });

  it('change réellement la locale globale au changement de sélection', async () => {
    const wrapper = mount(LanguageSwitcher, { global: { plugins: [i18n] } });

    await wrapper.find('select').setValue('it');

    expect(i18n.global.locale.value).toBe('it');
  });
});
