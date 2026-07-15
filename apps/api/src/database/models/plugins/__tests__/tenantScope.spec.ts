import { describe, expect, it } from 'vitest';

import {
  assertTenantIdInFilter,
  assertTenantIdInPipeline,
  MISSING_TENANT_ID_MESSAGE,
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
