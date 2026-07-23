import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';

import { i18n } from '@/plugins/i18n.plugin';
import { useAuthStore } from '@/stores/auth.store';

import AppShell from '../AppShell.vue';

/** Header/payload/signature bidons — seul le claim `role` du payload compte ici. */
function fakeAccessToken(role: string): string {
  const base64url = (value: string) =>
    btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${base64url('{}')}.${base64url(JSON.stringify({ sub: 'u-1', role }))}.sig`;
}

async function mountShell(role: string) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().accessToken = fakeAccessToken(role);

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/restaurant' },
      { path: '/restaurant', component: { template: '<div>restaurant</div>' } },
      { path: '/employees', component: { template: '<div>employees</div>' } },
    ],
  });
  await router.push('/restaurant');
  await router.isReady();

  return mount(AppShell, { global: { plugins: [i18n, pinia, router] } });
}

describe('AppShell', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'fr';
  });

  it('affiche l’entrée "Employés" pour un restaurant_owner', async () => {
    const wrapper = await mountShell('restaurant_owner');

    expect(wrapper.text()).toContain('Employés');
  });

  it('affiche l’entrée "Employés" pour un manager', async () => {
    const wrapper = await mountShell('manager');

    expect(wrapper.text()).toContain('Employés');
  });

  it('masque l’entrée "Employés" pour un waiter', async () => {
    const wrapper = await mountShell('waiter');

    expect(wrapper.text()).not.toContain('Employés');
  });

  it('affiche toujours l’entrée "Mon restaurant", quel que soit le rôle', async () => {
    const wrapper = await mountShell('cashier');

    expect(wrapper.text()).toContain('Mon restaurant');
  });
});
