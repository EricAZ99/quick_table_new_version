import type { Schema } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import {
  assertTenantIdInFilter,
  assertTenantIdInPipeline,
  MISSING_TENANT_ID_MESSAGE,
  tenantScope,
} from '../tenantScope.js';

describe('assertTenantIdInFilter (find/findOne/updateMany)', () => {
  it('ne lève rien si tenantId est présent', () => {
    expect(() => assertTenantIdInFilter({ tenantId: 'tenant-a', status: 'active' })).not.toThrow();
  });

  it('lève une exception si tenantId est absent', () => {
    expect(() => assertTenantIdInFilter({ status: 'active' })).toThrow(MISSING_TENANT_ID_MESSAGE);
  });

  it('lève une exception si le filtre est undefined', () => {
    expect(() => assertTenantIdInFilter(undefined)).toThrow(MISSING_TENANT_ID_MESSAGE);
  });

  it("lève une exception si tenantId est une chaîne vide (valeur falsy, pas d'isolation réelle)", () => {
    expect(() => assertTenantIdInFilter({ tenantId: '' })).toThrow(MISSING_TENANT_ID_MESSAGE);
  });
});

describe('assertTenantIdInPipeline (aggregate)', () => {
  it('ne lève rien si un $match avec tenantId est présent (même pas en premier)', () => {
    expect(() =>
      assertTenantIdInPipeline([
        { $sort: { createdAt: -1 } },
        { $match: { tenantId: 'tenant-a' } },
      ]),
    ).not.toThrow();
  });

  it('lève une exception si aucun stage $match ne contient tenantId', () => {
    expect(() => assertTenantIdInPipeline([{ $group: { _id: '$status' } }])).toThrow(
      MISSING_TENANT_ID_MESSAGE,
    );
  });

  it('lève une exception pour un pipeline vide', () => {
    expect(() => assertTenantIdInPipeline([])).toThrow(MISSING_TENANT_ID_MESSAGE);
  });
});

describe('tenantScope(schema) (doc 03 — déclare le champ + garde les requêtes)', () => {
  it('déclare le champ tenantId requis et son index sur le schéma', () => {
    const schema = { add: vi.fn(), index: vi.fn(), pre: vi.fn() } as unknown as Schema;

    tenantScope(schema);

    expect(schema.add).toHaveBeenCalledWith({ tenantId: { type: String, required: true } });
    expect(schema.index).toHaveBeenCalledWith({ tenantId: 1 });
  });

  it('enregistre les hooks pre() sur les 5 méthodes de BaseRepository + updateMany', () => {
    const schema = { add: vi.fn(), index: vi.fn(), pre: vi.fn() } as unknown as Schema;

    tenantScope(schema);

    expect(schema.pre).toHaveBeenCalledWith(
      ['find', 'findOne', 'updateOne', 'updateMany', 'deleteOne'],
      expect.any(Function),
    );
    expect(schema.pre).toHaveBeenCalledWith('aggregate', expect.any(Function));
  });
});
