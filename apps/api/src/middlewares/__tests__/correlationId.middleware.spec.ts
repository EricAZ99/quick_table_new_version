import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { CORRELATION_ID_HEADER, correlationIdMiddleware } from '../correlationId.middleware.js';

function createMockReqRes() {
  const req = {} as Request;
  const setHeader = vi.fn();
  const res = { setHeader } as unknown as Response;
  const next = vi.fn();

  return { req, res, next, setHeader };
}

describe('correlationIdMiddleware', () => {
  it('attache un correlationId (UUID) à req et au header de réponse', () => {
    const { req, res, next, setHeader } = createMockReqRes();

    correlationIdMiddleware(req, res, next);

    expect(req.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, req.correlationId);
    expect(next).toHaveBeenCalledOnce();
  });

  it('attache un req.log fonctionnel', () => {
    const { req, res, next } = createMockReqRes();

    correlationIdMiddleware(req, res, next);

    expect(req.log).toBeDefined();
    expect(typeof req.log.info).toBe('function');
  });

  it('génère un correlationId différent à chaque appel', () => {
    const first = createMockReqRes();
    const second = createMockReqRes();

    correlationIdMiddleware(first.req, first.res, first.next);
    correlationIdMiddleware(second.req, second.res, second.next);

    expect(first.req.correlationId).not.toBe(second.req.correlationId);
  });
});
