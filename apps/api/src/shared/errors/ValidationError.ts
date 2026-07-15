import { AppError } from './AppError.js';

/** 400 — doc 09 §9.1 (validation Zod échouée, `details[]` liste les champs). */
export class ValidationError extends AppError {
  readonly httpStatus = 400;

  constructor(code: string, message = 'Requête invalide.', details: unknown[] = []) {
    super(code, message, details);
  }
}
