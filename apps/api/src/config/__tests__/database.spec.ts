import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('mongoose', () => ({
  default: {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../database.js';

describe('connectDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("appelle mongoose.connect avec l'URI fournie", async () => {
    const uri = 'mongodb://localhost:27017/quicktable?replicaSet=rs0';

    await connectDatabase(uri);

    expect(mongoose.connect).toHaveBeenCalledTimes(1);
    expect(mongoose.connect).toHaveBeenCalledWith(uri);
  });

  it('propage une erreur de connexion (fail-fast, doc 12 §12.9)', async () => {
    vi.mocked(mongoose.connect).mockRejectedValueOnce(new Error('connexion refusée'));

    await expect(connectDatabase('mongodb://unreachable:27017')).rejects.toThrow(
      'connexion refusée',
    );
  });
});

describe('disconnectDatabase', () => {
  it('appelle mongoose.disconnect', async () => {
    await disconnectDatabase();

    expect(mongoose.disconnect).toHaveBeenCalledOnce();
  });
});
