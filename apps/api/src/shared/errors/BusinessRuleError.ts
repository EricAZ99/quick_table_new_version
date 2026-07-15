import { AppError } from './AppError.js';

/** 422 — doc 09 §9.1 (règle métier violée, ex. stock insuffisant). */
export class BusinessRuleError extends AppError {
  readonly httpStatus = 422;

  constructor(code: string, message = 'Règle métier violée.', details: unknown[] = []) {
    super(code, message, details);
  }
}
