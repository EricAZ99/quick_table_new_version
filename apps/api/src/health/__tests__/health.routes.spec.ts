import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/redis.js', () => ({
  getRedisClient: vi.fn(),
}));

vi.mock('mongoose', () => ({
  default: {
    connection: {
      db: undefined,
    },
  },
}));

import mongoose from 'mongoose';

import { getRedisClient } from '../../config/redis.js';
import { checkReadiness, pingMongo, pingRedis } from '../health.routes.js';

// `mongoose.connection.db` est typé readonly côté vrais types Mongoose ;
// le module est mocké (vi.mock ci-dessus) mais TypeScript type-check quand
// même contre les déclarations réelles — cast local pour pouvoir réassigner
// `db` entre les tests sans `any` non justifié.
function setMockDb(db: unknown): void {
  (mongoose.connection as unknown as { db: unknown }).db = db;
}

describe('pingMongo', () => {
  beforeEach(() => {
    setMockDb(undefined);
  });

  it('retourne false si aucune connexion mongoose établie (db undefined)', async () => {
    expect(await pingMongo()).toBe(false);
  });

  it('retourne true si le ping admin réussit', async () => {
    setMockDb({ admin: () => ({ ping: vi.fn().mockResolvedValue({ ok: 1 }) }) });

    expect(await pingMongo()).toBe(true);
  });

  it('retourne false si le ping admin rejette', async () => {
    setMockDb({ admin: () => ({ ping: vi.fn().mockRejectedValue(new Error('timeout')) }) });

    expect(await pingMongo()).toBe(false);
  });
});

describe('pingRedis', () => {
  it('retourne true si le ping réussit', async () => {
    vi.mocked(getRedisClient).mockReturnValue({ ping: vi.fn().mockResolvedValue('PONG') } as never);

    expect(await pingRedis()).toBe(true);
  });

  it('retourne false si le client n’est pas initialisé (getRedisClient lève)', async () => {
    vi.mocked(getRedisClient).mockImplementation(() => {
      throw new Error('Client Redis non initialisé');
    });

    expect(await pingRedis()).toBe(false);
  });

  it('retourne false si le ping rejette', async () => {
    vi.mocked(getRedisClient).mockReturnValue({
      ping: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as never);

    expect(await pingRedis()).toBe(false);
  });
});

describe('checkReadiness', () => {
  it('agrège les deux checks', async () => {
    setMockDb({ admin: () => ({ ping: vi.fn().mockResolvedValue({ ok: 1 }) }) });
    vi.mocked(getRedisClient).mockReturnValue({ ping: vi.fn().mockResolvedValue('PONG') } as never);

    expect(await checkReadiness()).toEqual({ mongodb: true, redis: true });
  });
});
