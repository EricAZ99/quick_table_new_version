import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/plugins/i18n.plugin';
import { useAuthStore } from '@/stores/auth.store';

import LoginScreen from '../LoginScreen.vue';

function jsonResponse(status: number, body: unknown) {
  return { status, json: () => Promise.resolve(body) };
}

async function mountScreen() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(LoginScreen, { global: { plugins: [i18n, pinia] } });
  return wrapper;
}

describe('LoginScreen', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'fr';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('désactive la soumission tant que email/mot de passe ne sont pas remplis', async () => {
    const wrapper = await mountScreen();

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();

    await wrapper.find('#login-email').setValue('a@b.com');
    await wrapper.find('#login-password').setValue('secret1234');

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
  });

  it('authentifie et laisse le store passer authentifié quand il n’y a pas de 2FA', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          success: true,
          data: { accessToken: 'at-1', user: { email: 'a@b.com' }, tenants: [] },
        }),
      ),
    );
    const wrapper = await mountScreen();
    await wrapper.find('#login-email').setValue('a@b.com');
    await wrapper.find('#login-password').setValue('secret1234');

    await wrapper.find('form').trigger('submit');
    await wrapper.vm.$nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useAuthStore().isAuthenticated).toBe(true);
  });

  it('affiche le message d’erreur du serveur sur des identifiants invalides', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          success: false,
          error: {
            code: 'AUTH_INVALID_CREDENTIALS',
            message: 'Email ou mot de passe incorrect.',
            details: [],
          },
        }),
      ),
    );
    const wrapper = await mountScreen();
    await wrapper.find('#login-email').setValue('a@b.com');
    await wrapper.find('#login-password').setValue('wrong');

    await wrapper.find('form').trigger('submit');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Email ou mot de passe incorrect.');
    expect(useAuthStore().isAuthenticated).toBe(false);
  });

  it('bascule sur la saisie du code quand le compte a la 2FA activée', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          success: true,
          data: { requires2FA: true, challengeToken: 'chal-1' },
        }),
      ),
    );
    const wrapper = await mountScreen();
    await wrapper.find('#login-email').setValue('a@b.com');
    await wrapper.find('#login-password').setValue('secret1234');

    await wrapper.find('form').trigger('submit');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('#login-2fa-code').exists()).toBe(true);
    expect(wrapper.find('#login-email').exists()).toBe(false);
  });

  it('complète la connexion après un code 2FA valide', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: { requires2FA: true, challengeToken: 'chal-1' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: { accessToken: 'at-2', user: {}, tenants: [] } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountScreen();
    await wrapper.find('#login-email').setValue('a@b.com');
    await wrapper.find('#login-password').setValue('secret1234');
    await wrapper.find('form').trigger('submit');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    await wrapper.find('#login-2fa-code').setValue('123456');
    await wrapper.find('form').trigger('submit');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useAuthStore().isAuthenticated).toBe(true);
  });
});
