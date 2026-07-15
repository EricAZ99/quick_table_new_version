import type { Model } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { BaseRepository, type RepositoryContext } from '../BaseRepository.js';

interface FakeDoc {
  _id: string;
  tenantId: string;
  name: string;
  status: string;
}

class FakeRepository extends BaseRepository<FakeDoc> {}

function createMockModel() {
  return {
    find: vi.fn(),
    findOne: vi.fn(),
    updateOne: vi.fn(),
    deleteOne: vi.fn(),
    aggregate: vi.fn(),
  } as unknown as Model<FakeDoc>;
}

const context: RepositoryContext = { tenantId: 'tenant-a' };

describe('BaseRepository (doc 06 §6.4 — ligne de défense n°2)', () => {
  it('fusionne tenantId dans le filtre de find()', () => {
    const model = createMockModel();
    const repo = new FakeRepository(model);

    repo.find({ name: 'x' }, context);

    expect(model.find).toHaveBeenCalledWith({ name: 'x', tenantId: 'tenant-a' });
  });

  it('fusionne tenantId dans findOne()', () => {
    const model = createMockModel();
    const repo = new FakeRepository(model);

    repo.findOne({ status: 'active' }, context);

    expect(model.findOne).toHaveBeenCalledWith({ status: 'active', tenantId: 'tenant-a' });
  });

  it('fusionne tenantId dans le filtre de updateOne() sans altérer le document de mise à jour', () => {
    const model = createMockModel();
    const repo = new FakeRepository(model);

    repo.updateOne({ name: 'x' }, { $set: { status: 'inactive' } }, context);

    expect(model.updateOne).toHaveBeenCalledWith(
      { name: 'x', tenantId: 'tenant-a' },
      { $set: { status: 'inactive' } },
    );
  });

  it('fusionne tenantId dans deleteOne()', () => {
    const model = createMockModel();
    const repo = new FakeRepository(model);

    repo.deleteOne({ name: 'x' }, context);

    expect(model.deleteOne).toHaveBeenCalledWith({ name: 'x', tenantId: 'tenant-a' });
  });

  it('préfixe le pipeline aggregate() par un $match tenantId', () => {
    const model = createMockModel();
    const repo = new FakeRepository(model);

    repo.aggregate([{ $group: { _id: '$status' } }], context);

    expect(model.aggregate).toHaveBeenCalledWith([
      { $match: { tenantId: 'tenant-a' } },
      { $group: { _id: '$status' } },
    ]);
  });

  it("impose toujours le tenantId du contexte, même si l'appelant tente de le surcharger dans son filtre", () => {
    const model = createMockModel();
    const repo = new FakeRepository(model);

    repo.find({ tenantId: 'tenant-malveillant' }, context);

    expect(model.find).toHaveBeenCalledWith({ tenantId: 'tenant-a' });
  });
});
