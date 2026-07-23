<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import LanguageSwitcher from '@/components/ui/LanguageSwitcher.vue';
import { ApiError } from '@/shared/apiClient';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Écran back-office : liste et gestion des employés (doc 09 §9.5, doc 21
 * §21.5, mockup `docs/design/08-employes-reservations.html#employes`).
 *
 * Décisions validées avec toi pour ce ticket :
 * - 2 filtres de statut seulement (Actifs/Inactifs) — le filtre "Invités" de
 *   la maquette suppose un statut `invited` distinct que le backend ne suit
 *   nulle part (`employmentStatus` n'a que `'active'|'inactive'`,
 *   `employees.validators.ts`). Incohérence signalée, non corrigée.
 * - "Désactiver" n'est jamais une suppression réelle (`DELETE /employees/:id`
 *   ne fait que passer `employmentStatus` à `inactive`) ; "Réactiver" repasse
 *   par `PATCH .../:id` avec `{employmentStatus:'active'}` — même endpoint
 *   que l'édition poste/salaire, pas une route dédiée.
 *
 * `salary` : le serveur omet déjà la clé pour un acteur sans
 * `employees:view_salary` (`employees.service.ts#toEmployeeDto`,
 * `salary: undefined` → absent du JSON) — la colonne/le champ salaire ne
 * s'affichent ici que si la clé est réellement présente dans la réponse,
 * sans dupliquer la logique RBAC côté client.
 */
interface Employee {
  id: string;
  role: string;
  jobTitle: string | null;
  salary?: number | null;
  employmentStatus: 'active' | 'inactive';
  hiredAt: string | null;
  user: {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    avatarUrl: string | null;
  };
}

const MEMBERSHIP_ROLES = ['restaurant_owner', 'manager', 'cashier', 'kitchen', 'waiter'] as const;

const { t } = useI18n();
const auth = useAuthStore();

const isLoading = ref(true);
const errorMessage = ref<string | null>(null);
const employees = ref<Employee[]>([]);
const meta = reactive({ page: 1, limit: 20, total: 0 });
const statusFilter = ref<'all' | 'active' | 'inactive'>('all');

const canViewSalary = computed(() => employees.value.some((employee) => 'salary' in employee));
const totalPages = computed(() => Math.max(1, Math.ceil(meta.total / meta.limit)));

interface EmployeesMeta {
  page: number;
  limit: number;
  total: number;
}

async function refresh(): Promise<void> {
  isLoading.value = true;
  errorMessage.value = null;
  try {
    const params = new URLSearchParams({ page: String(meta.page), limit: String(meta.limit) });
    if (statusFilter.value !== 'all') params.set('status', statusFilter.value);

    const result = await auth.authorizedFetchWithMeta<Employee[], EmployeesMeta>(
      `/api/v1/employees?${params.toString()}`,
    );
    employees.value = result.data;
    meta.page = result.meta.page;
    meta.limit = result.meta.limit;
    meta.total = result.meta.total;
  } catch (error) {
    errorMessage.value = error instanceof ApiError ? error.message : t('auth.unexpectedError');
  } finally {
    isLoading.value = false;
  }
}

onMounted(refresh);
watch(statusFilter, () => {
  meta.page = 1;
  void refresh();
});

function goToPage(page: number): void {
  if (page < 1 || page > totalPages.value) return;
  meta.page = page;
  void refresh();
}

// --- Invitation ---
const showInviteForm = ref(false);
const isInviting = ref(false);
const inviteError = ref<string | null>(null);
const inviteForm = reactive({ fullName: '', email: '', role: 'waiter', jobTitle: '', salary: '' });

function openInviteForm(): void {
  inviteForm.fullName = '';
  inviteForm.email = '';
  inviteForm.role = 'waiter';
  inviteForm.jobTitle = '';
  inviteForm.salary = '';
  inviteError.value = null;
  showInviteForm.value = true;
}

async function submitInvite(): Promise<void> {
  isInviting.value = true;
  inviteError.value = null;
  try {
    const payload: Record<string, unknown> = {
      fullName: inviteForm.fullName,
      email: inviteForm.email,
      role: inviteForm.role,
    };
    if (inviteForm.jobTitle) payload.jobTitle = inviteForm.jobTitle;
    if (inviteForm.salary) payload.salary = Number(inviteForm.salary);

    await auth.authorizedFetch('/api/v1/employees', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showInviteForm.value = false;
    meta.page = 1;
    await refresh();
  } catch (error) {
    inviteError.value = error instanceof ApiError ? error.message : t('auth.unexpectedError');
  } finally {
    isInviting.value = false;
  }
}

// --- Édition (poste / salaire) ---
const editingEmployee = ref<Employee | null>(null);
const isSavingEdit = ref(false);
const editError = ref<string | null>(null);
const editForm = reactive({ jobTitle: '', salary: '' });

function openEditForm(employee: Employee): void {
  editingEmployee.value = employee;
  editForm.jobTitle = employee.jobTitle ?? '';
  editForm.salary = employee.salary != null ? String(employee.salary) : '';
  editError.value = null;
}

async function submitEdit(): Promise<void> {
  if (!editingEmployee.value) return;
  isSavingEdit.value = true;
  editError.value = null;
  try {
    const payload: Record<string, unknown> = { jobTitle: editForm.jobTitle || null };
    if ('salary' in editingEmployee.value) {
      payload.salary = editForm.salary ? Number(editForm.salary) : null;
    }
    await auth.authorizedFetch(`/api/v1/employees/${editingEmployee.value.id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    editingEmployee.value = null;
    await refresh();
  } catch (error) {
    editError.value = error instanceof ApiError ? error.message : t('auth.unexpectedError');
  } finally {
    isSavingEdit.value = false;
  }
}

// --- Désactivation / réactivation ---
const pendingStatusChangeId = ref<string | null>(null);

async function toggleStatus(employee: Employee): Promise<void> {
  pendingStatusChangeId.value = employee.id;
  errorMessage.value = null;
  try {
    if (employee.employmentStatus === 'active') {
      await auth.authorizedFetch(`/api/v1/employees/${employee.id}`, { method: 'DELETE' });
    } else {
      await auth.authorizedFetch(`/api/v1/employees/${employee.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ employmentStatus: 'active' }),
      });
    }
    await refresh();
  } catch (error) {
    errorMessage.value = error instanceof ApiError ? error.message : t('auth.unexpectedError');
  } finally {
    pendingStatusChangeId.value = null;
  }
}
</script>

<template>
  <div class="screen">
    <header class="topbar">
      <h1 class="title">
        {{ t('employees.title') }}
      </h1>
      <div class="topbar-actions">
        <LanguageSwitcher />
        <button type="button" class="btn btn-ghost" @click="auth.logout()">
          {{ t('restaurantSettings.logout') }}
        </button>
      </div>
    </header>

    <main class="body">
      <p v-if="errorMessage" class="banner banner-error">
        {{ errorMessage }}
      </p>

      <div class="toolbar">
        <div class="filters" role="tablist">
          <button
            type="button"
            class="chip"
            :class="{ active: statusFilter === 'all' }"
            @click="statusFilter = 'all'"
          >
            {{ t('employees.filters.all') }}
          </button>
          <button
            type="button"
            class="chip"
            :class="{ active: statusFilter === 'active' }"
            @click="statusFilter = 'active'"
          >
            {{ t('employees.filters.active') }}
          </button>
          <button
            type="button"
            class="chip"
            :class="{ active: statusFilter === 'inactive' }"
            @click="statusFilter = 'inactive'"
          >
            {{ t('employees.filters.inactive') }}
          </button>
        </div>
        <button type="button" class="btn btn-primary" @click="openInviteForm">
          {{ t('employees.inviteButton') }}
        </button>
      </div>

      <p v-if="isLoading" class="hint">
        {{ t('employees.loading') }}
      </p>

      <template v-else>
        <p v-if="employees.length === 0" class="hint">
          {{ t('employees.empty') }}
        </p>

        <table v-else class="table">
          <thead>
            <tr>
              <th>{{ t('employees.table.employee') }}</th>
              <th>{{ t('employees.table.role') }}</th>
              <th>{{ t('employees.table.jobTitle') }}</th>
              <th v-if="canViewSalary">
                {{ t('employees.table.salary') }}
              </th>
              <th>{{ t('employees.table.status') }}</th>
              <th class="col-actions">
                {{ t('employees.table.actions') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="employee in employees" :key="employee.id">
              <td>
                <div class="employee-cell">
                  <div class="fullName">
                    {{ employee.user.fullName }}
                  </div>
                  <div class="email">
                    {{ employee.user.email }}
                  </div>
                </div>
              </td>
              <td>
                <span class="pill">{{ t(`employees.roles.${employee.role}`) }}</span>
              </td>
              <td>{{ employee.jobTitle ?? '—' }}</td>
              <td v-if="canViewSalary">
                {{ employee.salary ?? '—' }}
              </td>
              <td>
                <span
                  class="badge"
                  :class="
                    employee.employmentStatus === 'active' ? 'badge-active' : 'badge-inactive'
                  "
                >
                  {{ t(`employees.status.${employee.employmentStatus}`) }}
                </span>
              </td>
              <td class="col-actions">
                <button type="button" class="btn btn-ghost btn-sm" @click="openEditForm(employee)">
                  {{ t('employees.actions.edit') }}
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  :disabled="pendingStatusChangeId === employee.id"
                  @click="toggleStatus(employee)"
                >
                  {{
                    employee.employmentStatus === 'active'
                      ? t('employees.actions.deactivate')
                      : t('employees.actions.reactivate')
                  }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="employees.length > 0" class="pagination">
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            :disabled="meta.page <= 1"
            @click="goToPage(meta.page - 1)"
          >
            {{ t('employees.pagination.previous') }}
          </button>
          <span class="page-info">
            {{ t('employees.pagination.pageInfo', { page: meta.page, totalPages }) }}
          </span>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            :disabled="meta.page >= totalPages"
            @click="goToPage(meta.page + 1)"
          >
            {{ t('employees.pagination.next') }}
          </button>
        </div>
      </template>
    </main>

    <div v-if="showInviteForm" class="drawer-backdrop" @click.self="showInviteForm = false">
      <form class="drawer" @submit.prevent="submitInvite">
        <h2 class="section-title">
          {{ t('employees.invite.title') }}
        </h2>
        <p v-if="inviteError" class="banner banner-error">
          {{ inviteError }}
        </p>

        <div class="field">
          <label for="inv-fullName">{{ t('employees.invite.fullNameLabel') }}</label>
          <input id="inv-fullName" v-model="inviteForm.fullName" class="input" required />
        </div>
        <div class="field">
          <label for="inv-email">{{ t('employees.invite.emailLabel') }}</label>
          <input id="inv-email" v-model="inviteForm.email" type="email" class="input" required />
        </div>
        <div class="field">
          <label for="inv-role">{{ t('employees.invite.roleLabel') }}</label>
          <select id="inv-role" v-model="inviteForm.role" class="input">
            <option v-for="role in MEMBERSHIP_ROLES" :key="role" :value="role">
              {{ t(`employees.roles.${role}`) }}
            </option>
          </select>
        </div>
        <div class="field">
          <label for="inv-jobTitle">{{ t('employees.invite.jobTitleLabel') }}</label>
          <input id="inv-jobTitle" v-model="inviteForm.jobTitle" class="input" />
        </div>
        <div class="field">
          <label for="inv-salary"
            >{{ t('employees.invite.salaryLabel') }} ({{
              t('employees.invite.salaryOptional')
            }})</label
          >
          <input id="inv-salary" v-model="inviteForm.salary" type="number" min="0" class="input" />
        </div>

        <div class="drawer-actions">
          <button
            type="button"
            class="btn btn-ghost"
            :disabled="isInviting"
            @click="showInviteForm = false"
          >
            {{ t('employees.invite.cancel') }}
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="isInviting || !inviteForm.fullName || !inviteForm.email"
          >
            {{ isInviting ? t('employees.invite.submitting') : t('employees.invite.submit') }}
          </button>
        </div>
      </form>
    </div>

    <div v-if="editingEmployee" class="drawer-backdrop" @click.self="editingEmployee = null">
      <form class="drawer" @submit.prevent="submitEdit">
        <h2 class="section-title">
          {{ t('employees.edit.title') }}
        </h2>
        <p v-if="editError" class="banner banner-error">
          {{ editError }}
        </p>

        <div class="field">
          <label for="edit-jobTitle">{{ t('employees.edit.jobTitleLabel') }}</label>
          <input id="edit-jobTitle" v-model="editForm.jobTitle" class="input" />
        </div>
        <div v-if="editingEmployee && 'salary' in editingEmployee" class="field">
          <label for="edit-salary">{{ t('employees.edit.salaryLabel') }}</label>
          <input id="edit-salary" v-model="editForm.salary" type="number" min="0" class="input" />
        </div>

        <div class="drawer-actions">
          <button
            type="button"
            class="btn btn-ghost"
            :disabled="isSavingEdit"
            @click="editingEmployee = null"
          >
            {{ t('employees.edit.cancel') }}
          </button>
          <button type="submit" class="btn btn-primary" :disabled="isSavingEdit">
            {{ isSavingEdit ? t('employees.edit.saving') : t('employees.edit.save') }}
          </button>
        </div>
      </form>
    </div>
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
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  box-sizing: border-box;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.filters {
  display: flex;
  gap: var(--space-2);
}

.chip {
  appearance: none;
  border: 1px solid var(--border-strong);
  background: var(--surface-1);
  color: var(--text-2);
  border-radius: var(--radius-full);
  padding: var(--space-1) var(--space-4);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
}

.chip.active {
  background: var(--ember-soft);
  border-color: var(--ember);
  color: var(--ember-soft-ink);
}

.hint {
  margin: 0;
  color: var(--text-2);
  font-size: 0.9375rem;
}

.table {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.table th,
.table td {
  text-align: left;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
  font-size: 0.875rem;
}

.table th {
  color: var(--text-2);
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.employee-cell .fullName {
  font-weight: 600;
  color: var(--text-1);
}

.employee-cell .email {
  color: var(--text-3);
  font-size: 0.8125rem;
}

.pill {
  display: inline-block;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  background: var(--surface-2);
  color: var(--text-1);
  font-size: 0.75rem;
  font-weight: 600;
}

.badge {
  display: inline-block;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 600;
}

.badge-active {
  background: var(--basil-soft);
  color: var(--basil-soft-ink);
}

.badge-inactive {
  background: var(--surface-2);
  color: var(--text-3);
}

.col-actions {
  display: flex;
  gap: var(--space-2);
}

.pagination {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.page-info {
  color: var(--text-2);
  font-size: 0.8125rem;
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

.btn {
  height: 38px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  font-weight: 600;
  font-size: 0.84375rem;
  cursor: pointer;
  padding: 0 var(--space-5);
  transition: filter var(--dur-fast) var(--ease);
}

.btn-sm {
  height: 30px;
  padding: 0 var(--space-3);
  font-size: 0.78125rem;
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

.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(28, 23, 18, 0.35);
  display: flex;
  justify-content: flex-end;
}

.drawer {
  width: 100%;
  max-width: 420px;
  background: var(--surface-1);
  height: 100%;
  padding: var(--space-6);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  overflow-y: auto;
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-top: auto;
}
</style>
