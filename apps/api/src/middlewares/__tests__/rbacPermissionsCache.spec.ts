import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/redis.js', () => ({
  getRedisClient: vi.fn(),
}));
vi.mock('../../logger/logger.js', () => ({
  logger: { warn: vi.fn() },
}));

import { getRedisClient } from '../../config/redis.js';
import { logger } from '../../logger/logger.js';
import { getCachedPermissions, setCachedPermissions } from '../rbacPermissionsCache.js';

describe('rbacPermissionsCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCachedPermissions', () => {
    it('retourne les permissions désérialisées quand la clé existe', async () => {
      const get = vi.fn().mockResolvedValue(JSON.stringify(['orders:read', 'orders:create']));
      vi.mocked(getRedisClient).mockReturnValue({ get } as never);

      const result = await getCachedPermissions('membership-a');

      expect(get).toHaveBeenCalledWith('rbac:resolved:membership-a');
      expect(result).toEqual(['orders:read', 'orders:create']);
    });

    it("retourne null (cache miss) quand la clé n'existe pas", async () => {
      const get = vi.fn().mockResolvedValue(null);
      vi.mocked(getRedisClient).mockReturnValue({ get } as never);

      const result = await getCachedPermissions('membership-a');

      expect(result).toBeNull();
    });

    it('retourne null et journalise un warning si Redis échoue (jamais une exception propagée)', async () => {
      const get = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
      vi.mocked(getRedisClient).mockReturnValue({ get } as never);

      const result = await getCachedPermissions('membership-a');

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ membershipId: 'membership-a' }),
        expect.stringContaining('lecture'),
      );
    });

    it('retourne null si getRedisClient() lui-même lève (client non initialisé)', async () => {
      vi.mocked(getRedisClient).mockImplementation(() => {
        throw new Error('Client Redis non initialisé');
      });

      const result = await getCachedPermissions('membership-a');

      expect(result).toBeNull();
    });
  });

  describe('setCachedPermissions', () => {
    it('sérialise et écrit avec un TTL de 10 minutes (doc 26 §26.2)', async () => {
      const set = vi.fn().mockResolvedValue('OK');
      vi.mocked(getRedisClient).mockReturnValue({ set } as never);

      await setCachedPermissions('membership-a', ['orders:read']);

      expect(set).toHaveBeenCalledWith(
        'rbac:resolved:membership-a',
        JSON.stringify(['orders:read']),
        {
          EX: 600,
        },
      );
    });

    it('avale silencieusement une erreur Redis et journalise un warning (best-effort, doc 26 §26.6)', async () => {
      const set = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
      vi.mocked(getRedisClient).mockReturnValue({ set } as never);

      await expect(setCachedPermissions('membership-a', ['orders:read'])).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ membershipId: 'membership-a' }),
        expect.stringContaining('écriture'),
      );
    });
  });
});
