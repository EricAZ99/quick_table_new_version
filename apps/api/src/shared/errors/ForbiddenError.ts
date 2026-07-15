import { AppError } from './AppError.js';

/** 403 — doc 09 §9.1 (authentifié mais permission insuffisante). */
export class ForbiddenError extends AppError {
  readonly httpStatus = 403;

  constructor(code: string, message = 'Action non autorisée.', details: unknown[] = []) {
    super(code, message, details);
  }
}
