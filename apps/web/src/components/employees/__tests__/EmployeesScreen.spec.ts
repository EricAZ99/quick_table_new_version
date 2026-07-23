import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/plugins/i18n.plugin';
import { useAuthStore } from '@/stores/auth.store';

import EmployeesScreen from '../EmployeesScreen.vue';

function jsonResponse(status: number, body: unknown) {
  return { status, json: () => Promise.resolve(body) };
}

const OWNER = {
  id: 'm-owner',
  role: 'restaurant_owner',
  jobTitle: 'Fondatrice',
  salary: 500000,
  employmentStatus: 'active',
  hiredAt: '2025-01-01T00:00:00.000Z',
  user: {
    id: 'u-owner',
    email: 'owner@lejardindawa.bj',
    fullName: 'Awa Kouassi',
    phone: null,
    avatarUrl: null,
  },
};

const WAITER = {
  id: 'm-waiter',
  role: 'waiter',
  jobTitle: 'Serveur',
  salary: 120000,
  employmentStatus: 'active',
  hiredAt: '2025-06-01T00:00:00.000Z',
  user: {
    id: 'u-waiter',
    email: 'waiter@lejardindawa.bj',
    fullName: 'Koffi Mensah',
    phone: null,
    avatarUrl: null,
  },
};

function listResponse(
  employees: unknown[],
  meta = { page: 1, limit: 20, total: employees.length },
) {
  return jsonResponse(200, { success: true, data: employees, meta });
}

async function mountScreen(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock);
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAuthStore();
  store.accessToken = 'at-1';
  const wrapper = mount(EmployeesScreen, { global: { plugins: [i18n, pinia] } });
  await flushPromises();
  return wrapper;
}

describe('EmployeesScreen', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'fr';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('charge et affiche la liste au montage (GET /employees)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(listResponse([OWNER, WAITER]));

    const wrapper = await mountScreen(fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/employees?page=1&limit=20',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer at-1' }),
      }),
    );
    expect(wrapper.text()).toContain('Awa Kouassi');
    expect(wrapper.text()).toContain('Koffi Mensah');
  });

  it('affiche la colonne Salaire quand la réponse porte la clé salary (employees:view_salary accordé)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(listResponse([OWNER]));

    const wrapper = await mountScreen(fetchMock);

    expect(wrapper.text()).toContain('Salaire');
    expect(wrapper.text()).toContain('500000');
  });

  it('masque la colonne Salaire quand la clé est absente de la réponse (pas employees:view_salary)', async () => {
    const waiterWithoutSalary: Record<string, unknown> = { ...WAITER };
    delete waiterWithoutSalary.salary;
    const fetchMock = vi.fn().mockResolvedValueOnce(listResponse([waiterWithoutSalary]));

    const wrapper = await mountScreen(fetchMock);

    expect(wrapper.text()).not.toContain('Salaire');
  });

  it('change de filtre de statut et recharge (GET ?status=active)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(listResponse([OWNER, WAITER]))
      .mockResolvedValueOnce(listResponse([OWNER]));
    const wrapper = await mountScreen(fetchMock);

    await wrapper.findAll('.chip')[1]?.trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/v1/employees?page=1&limit=20&status=active',
      expect.anything(),
    );
  });

  it('invite un employé (POST /employees) puis rafraîchit la liste', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(listResponse([OWNER]))
      .mockResolvedValueOnce(jsonResponse(201, { success: true, data: WAITER }))
      .mockResolvedValueOnce(listResponse([OWNER, WAITER]));
    const wrapper = await mountScreen(fetchMock);

    await wrapper.find('.btn-primary').trigger('click');
    await wrapper.find('#inv-fullName').setValue('Koffi Mensah');
    await wrapper.find('#inv-email').setValue('waiter@lejardindawa.bj');
    await wrapper.find('#inv-role').setValue('waiter');
    await wrapper.find('form.drawer').trigger('submit');
    await flushPromises();

    const inviteCall = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(inviteCall[0]).toBe('/api/v1/employees');
    expect(inviteCall[1].method).toBe('POST');
    const body = JSON.parse(inviteCall[1].body as string);
    expect(body).toEqual({
      fullName: 'Koffi Mensah',
      email: 'waiter@lejardindawa.bj',
      role: 'waiter',
    });
    expect(wrapper.find('.drawer-backdrop').exists()).toBe(false);
  });

  it("modifie le poste d'un employé (PATCH /employees/:id)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(listResponse([WAITER]))
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: { ...WAITER, jobTitle: 'Chef de rang' } }),
      )
      .mockResolvedValueOnce(listResponse([{ ...WAITER, jobTitle: 'Chef de rang' }]));
    const wrapper = await mountScreen(fetchMock);

    const editButtons = wrapper.findAll('button').filter((b) => b.text() === 'Modifier');
    await editButtons[0]?.trigger('click');
    await wrapper.find('#edit-jobTitle').setValue('Chef de rang');
    await wrapper.find('form.drawer').trigger('submit');
    await flushPromises();

    const patchCall = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(patchCall[0]).toBe('/api/v1/employees/m-waiter');
    expect(patchCall[1].method).toBe('PATCH');
    expect(JSON.parse(patchCall[1].body as string)).toEqual({
      jobTitle: 'Chef de rang',
      salary: 120000,
    });
  });

  it('désactive un employé actif (DELETE, jamais une suppression réelle) puis le réactive (PATCH)', async () => {
    const inactiveWaiter = { ...WAITER, employmentStatus: 'inactive' as const };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(listResponse([WAITER]))
      .mockResolvedValueOnce(jsonResponse(204, null))
      .mockResolvedValueOnce(listResponse([inactiveWaiter]))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: WAITER }))
      .mockResolvedValueOnce(listResponse([WAITER]));
    const wrapper = await mountScreen(fetchMock);

    const toggleButtons = wrapper.findAll('button').filter((b) => b.text() === 'Désactiver');
    await toggleButtons[0]?.trigger('click');
    await flushPromises();

    const deleteCall = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(deleteCall[0]).toBe('/api/v1/employees/m-waiter');
    expect(deleteCall[1].method).toBe('DELETE');
    expect(wrapper.text()).toContain('Inactif');

    const reactivateButtons = wrapper.findAll('button').filter((b) => b.text() === 'Réactiver');
    await reactivateButtons[0]?.trigger('click');
    await flushPromises();

    const patchCall = fetchMock.mock.calls[3] as [string, RequestInit];
    expect(patchCall[0]).toBe('/api/v1/employees/m-waiter');
    expect(patchCall[1].method).toBe('PATCH');
    expect(JSON.parse(patchCall[1].body as string)).toEqual({ employmentStatus: 'active' });
  });

  it('navigue vers la page suivante (GET ?page=2)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(listResponse([OWNER], { page: 1, limit: 1, total: 2 }))
      .mockResolvedValueOnce(listResponse([WAITER], { page: 2, limit: 1, total: 2 }));
    const wrapper = await mountScreen(fetchMock);

    await wrapper.find('.pagination .btn:last-child').trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/v1/employees?page=2&limit=1',
      expect.anything(),
    );
  });

  it('affiche une erreur si le chargement échoue', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(403, {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: "Vous n'avez pas la permission requise.",
          details: [],
        },
      }),
    );

    const wrapper = await mountScreen(fetchMock);

    expect(wrapper.text()).toContain("Vous n'avez pas la permission requise.");
  });
});
