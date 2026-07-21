import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/plugins/i18n.plugin';
import { useAuthStore } from '@/stores/auth.store';

import RestaurantSettingsScreen from '../RestaurantSettingsScreen.vue';

function jsonResponse(status: number, body: unknown) {
  return { status, json: () => Promise.resolve(body) };
}

const BASE_RESTAURANT = {
  name: "Le Jardin d'Awa",
  logoUrl: 'https://example.com/logo.png',
  contact: {
    phone: '+229210000000',
    email: 'contact@lejardindawa.bj',
    address: 'Avenue Steinmetz',
    city: 'Cotonou',
  },
  openingHours: [{ day: 'monday', open: '09:00', close: '22:00' }],
};

async function mountScreen() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAuthStore();
  store.accessToken = 'at-1';
  const wrapper = mount(RestaurantSettingsScreen, { global: { plugins: [i18n, pinia] } });
  await flushPromises();
  return wrapper;
}

describe('RestaurantSettingsScreen', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'fr';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('charge et affiche le restaurant courant au montage (GET /restaurants/me)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: BASE_RESTAURANT })),
    );

    const wrapper = await mountScreen();

    expect((wrapper.find('#rs-name').element as HTMLInputElement).value).toBe("Le Jardin d'Awa");
    expect((wrapper.find('#rs-city').element as HTMLInputElement).value).toBe('Cotonou');
    const mondayCheckbox = wrapper.findAll('.hours-row')[0]?.find('input[type="checkbox"]');
    expect((mondayCheckbox?.element as HTMLInputElement).checked).toBe(true);
    const tuesdayCheckbox = wrapper.findAll('.hours-row')[1]?.find('input[type="checkbox"]');
    expect((tuesdayCheckbox?.element as HTMLInputElement).checked).toBe(false);
  });

  it('affiche une erreur si le chargement échoue (ex. TENANT_CONTEXT_REQUIRED)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(400, {
          success: false,
          error: {
            code: 'TENANT_CONTEXT_REQUIRED',
            message: 'Aucun restaurant actif sélectionné — veuillez en choisir un.',
            details: [],
          },
        }),
      ),
    );

    const wrapper = await mountScreen();

    expect(wrapper.text()).toContain('Aucun restaurant actif sélectionné');
  });

  it('enregistre les modifications (PATCH /restaurants/me) avec seulement les jours ouverts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: BASE_RESTAURANT }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: BASE_RESTAURANT }));
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountScreen();

    await wrapper.find('#rs-name').setValue('Nouveau nom');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const patchCall = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(patchCall[0]).toBe('/api/v1/restaurants/me');
    expect(patchCall[1].method).toBe('PATCH');
    const body = JSON.parse(patchCall[1].body as string);
    expect(body.name).toBe('Nouveau nom');
    expect(body.openingHours).toEqual([{ day: 'monday', open: '09:00', close: '22:00' }]);
    expect(wrapper.text()).toContain('Modifications enregistrées.');
  });

  it('inclut un jour nouvellement coché avec les horaires par défaut', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: { ...BASE_RESTAURANT, openingHours: [] } }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: BASE_RESTAURANT }));
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountScreen();

    const mondayCheckbox = wrapper.findAll('.hours-row')[0]?.find('input[type="checkbox"]');
    await mondayCheckbox?.setValue(true);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const patchCall = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(patchCall[1].body as string);
    expect(body.openingHours).toEqual([{ day: 'monday', open: '09:00', close: '22:00' }]);
  });

  it('se déconnecte via le bouton dédié', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: BASE_RESTAURANT }))
      .mockResolvedValueOnce(jsonResponse(204, null));
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountScreen();

    await wrapper.find('button.btn-ghost').trigger('click');
    await flushPromises();

    expect(useAuthStore().isAuthenticated).toBe(false);
  });
});
