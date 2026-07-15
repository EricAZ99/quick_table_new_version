import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../database/models/helloWorld.model.js', () => ({
  HelloWorldModel: { create: vi.fn(), find: vi.fn() },
}));

import { HelloWorldModel } from '../../../database/models/helloWorld.model.js';
import { HelloWorldRepository } from '../hello-world.repository.js';

describe('HelloWorldRepository', () => {
  it("create() injecte tenantId depuis le contexte, jamais depuis l'appelant", async () => {
    const repository = new HelloWorldRepository();

    await repository.create({ message: 'Hello' }, { tenantId: 'tenant-a' });

    expect(HelloWorldModel.create).toHaveBeenCalledWith({ message: 'Hello', tenantId: 'tenant-a' });
  });
});
