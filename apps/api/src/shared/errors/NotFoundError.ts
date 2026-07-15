import { AppError } from './AppError.js';

/** 404 — doc 09 §9.1 (ressource introuvable ou hors du tenant courant, jamais de distinction — anti-IDOR, doc 06). */
export class NotFoundError extends AppError {
  readonly httpStatus = 404;

  constructor(code: string, message = 'Ressource introuvable.', details: unknown[] = []) {
    super(code, message, details);
  }
}
