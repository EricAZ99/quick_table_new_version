import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { ConflictError } from '../../shared/errors/index.js';
import { errorHandlerMiddleware } from '../error-handler.middleware.js';

function createMockReqRes() {
  const log = { error: vi.fn() };
  const req = { log } as unknown as Request;
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status } as unknown as Response;
  const next = vi.fn();

  return { req, res, next, log, status, json };
}

describe('errorHandlerMiddleware', () => {
  it('traduit une AppError typée en enveloppe JSON standard (doc 09 §9.1)', () => {
    const { req, res, status, json } = createMockReqRes();
    const error = new ConflictError('ORDER_ALREADY_PAID', 'Cette commande est déjà payée.');

    errorHandlerMiddleware(error, req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'ORDER_ALREADY_PAID', message: 'Cette commande est déjà payée.', details: [] },
    });
  });

  it('journalise toujours en error, y compris pour une erreur typée', () => {
    const { req, res, log } = createMockReqRes();
    const error = new ConflictError('ORDER_ALREADY_PAID');

    errorHandlerMiddleware(error, req, res, vi.fn());

    expect(log.error).toHaveBeenCalledWith({ err: error }, expect.any(String));
  });

  it('sanitise une erreur non typée en 500 générique (aucun détail technique exposé)', () => {
    const { req, res, status, json, log } = createMockReqRes();
    const error = new Error('détail interne sensible : requête SQL, stacktrace...');

    errorHandlerMiddleware(error, req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Une erreur inattendue est survenue.',
        details: [],
      },
    });
    // le detail sensible est bien journalisé cote serveur...
    expect(log.error).toHaveBeenCalledWith({ err: error }, expect.any(String));
    // ...mais jamais renvoye au client
    expect(JSON.stringify(json.mock.calls[0])).not.toContain('sensible');
  });
});
