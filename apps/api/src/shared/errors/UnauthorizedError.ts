import { AppError } from './AppError.js';

/** 401 — doc 09 §9.1 (non authentifié : credentials invalides, token absent/expiré). */
export class UnauthorizedError extends AppError {
  readonly httpStatus = 401;

  constructor(code: string, message = 'Authentification requise.', details: unknown[] = []) {
    super(code, message, details);
  }
}
