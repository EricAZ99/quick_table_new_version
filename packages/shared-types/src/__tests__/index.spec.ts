import { describe, expect, it } from 'vitest';
import { SHARED_TYPES_PACKAGE_VERSION } from '../index';

describe('@quicktable/shared-types — bootstrap', () => {
  it("expose un point d'entrée résolvable par le reste du monorepo", () => {
    expect(SHARED_TYPES_PACKAGE_VERSION).toBe('0.0.0');
  });
});
