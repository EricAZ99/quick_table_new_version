import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { ValidationError } from '../../../shared/errors/index.js';
import { HelloWorldController } from '../hello-world.controller.js';
import type { HelloWorldService } from '../hello-world.service.js';

const TENANT_ID = 'tenant-a';

function createMockRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { status, json } as unknown as Response & { status: typeof status; json: typeof json };
}

function createMockReq(body: unknown, tenantId: string | null = TENANT_ID): Request {
  return { body, context: { tenantId } } as unknown as Request;
}

describe('HelloWorldController', () => {
  it('create() valide, appelle le service avec le tenantId de req.context, répond 201', async () => {
    const service = {
      create: vi.fn().mockResolvedValue({ message: 'Hello', tenantId: TENANT_ID }),
      list: vi.fn(),
    } as unknown as HelloWorldService;
    const controller = new HelloWorldController(service);
    const req = createMockReq({ message: 'Hello' });
    const res = createMockRes();

    await controller.create(req, res);

    expect(service.create).toHaveBeenCalledWith({ message: 'Hello' }, { tenantId: TENANT_ID });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { message: 'Hello', tenantId: TENANT_ID },
    });
  });

  it('create() lève une ValidationError sur un payload invalide (jamais 500)', async () => {
    const service = { create: vi.fn(), list: vi.fn() } as unknown as HelloWorldService;
    const controller = new HelloWorldController(service);
    const req = createMockReq({ message: '' });
    const res = createMockRes();

    await expect(controller.create(req, res)).rejects.toBeInstanceOf(ValidationError);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('create() rejette en 400 TENANT_CONTEXT_REQUIRED si req.context.tenantId est null (super_admin sans restaurant actif)', async () => {
    const service = { create: vi.fn(), list: vi.fn() } as unknown as HelloWorldService;
    const controller = new HelloWorldController(service);
    const req = createMockReq({ message: 'Hello' }, null);
    const res = createMockRes();

    await expect(controller.create(req, res)).rejects.toMatchObject({
      code: 'TENANT_CONTEXT_REQUIRED',
      httpStatus: 400,
    });
    expect(service.create).not.toHaveBeenCalled();
  });

  it('list() répond 200 avec les documents du tenant de req.context', async () => {
    const service = {
      create: vi.fn(),
      list: vi.fn().mockResolvedValue([{ message: 'Hello' }]),
    } as unknown as HelloWorldService;
    const controller = new HelloWorldController(service);
    const req = createMockReq(undefined);
    const res = createMockRes();

    await controller.list(req, res);

    expect(service.list).toHaveBeenCalledWith({ tenantId: TENANT_ID });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ message: 'Hello' }] });
  });

  it('list() rejette en 400 TENANT_CONTEXT_REQUIRED si req.context.tenantId est null', async () => {
    const service = { create: vi.fn(), list: vi.fn() } as unknown as HelloWorldService;
    const controller = new HelloWorldController(service);
    const req = createMockReq(undefined, null);
    const res = createMockRes();

    await expect(controller.list(req, res)).rejects.toMatchObject({
      code: 'TENANT_CONTEXT_REQUIRED',
      httpStatus: 400,
    });
    expect(service.list).not.toHaveBeenCalled();
  });
});
