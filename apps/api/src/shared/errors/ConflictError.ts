import { AppError } from './AppError.js';

/** 409 — doc 09 §9.1 (conflit : transition de statut invalide, ressource déjà verrouillée). */
export class ConflictError extends AppError {
  readonly httpStatus = 409;

  constructor(code: string, message = 'Conflit détecté.', details: unknown[] = []) {
    super(code, message, details);
  }
}
