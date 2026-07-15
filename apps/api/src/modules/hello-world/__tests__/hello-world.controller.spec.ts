import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { ValidationError } from '../../../shared/errors/index.js';
import { DEMO_TENANT_ID, HelloWorldController } from '../hello-world.controller.js';
import type { HelloWorldService } from '../hello-world.service.js';

function createMockRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { status, json } as unknown as Response & { status: typeof status; json: typeof json };
}

describe('HelloWorldController', () => {
  it('create() valide, appelle le service avec le tenant de démonstration, répond 201', async () => {
    const service = {
      create: vi.fn().mockResolvedValue({ message: 'Hello', tenantId: DEMO_TENANT_ID }),
      list: vi.fn(),
    } as unknown as HelloWorldService;
    const controller = new HelloWorldController(service);
    const req = { body: { message: 'Hello' } } as Request;
    const res = createMockRes();

    await controller.create(req, res);

    expect(service.create).toHaveBeenCalledWith({ message: 'Hello' }, { tenantId: DEMO_TENANT_ID });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { message: 'Hello', tenantId: DEMO_TENANT_ID },
    });
  });

  it('create() lève une ValidationError sur un payload invalide (jamais 500)', async () => {
    const service = { create: vi.fn(), list: vi.fn() } as unknown as HelloWorldService;
    const controller = new HelloWorldController(service);
    const req = { body: { message: '' } } as Request;
    const res = createMockRes();

    await expect(controller.create(req, res)).rejects.toBeInstanceOf(ValidationError);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('list() répond 200 avec les documents du tenant de démonstration', async () => {
    const service = {
      create: vi.fn(),
      list: vi.fn().mockResolvedValue([{ message: 'Hello' }]),
    } as unknown as HelloWorldService;
    const controller = new HelloWorldController(service);
    const res = createMockRes();

    await controller.list({} as Request, res);

    expect(service.list).toHaveBeenCalledWith({ tenantId: DEMO_TENANT_ID });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ message: 'Hello' }] });
  });
});
