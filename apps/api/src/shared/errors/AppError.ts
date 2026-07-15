/**
 * Classe de base des erreurs métier typées (doc 12 §12.3). Les services
 * lancent ces erreurs (`throw new ConflictError('ORDER_ALREADY_PAID')`),
 * jamais de tuple `{ error, data }` ni de `null` ambigu — `error-handler.
 * middleware.ts` est le seul endroit qui les traduit en réponse HTTP
 * (doc 09 §9.1).
 */
export abstract class AppError extends Error {
  abstract readonly httpStatus: number;
  readonly code: string;
  readonly details: unknown[];

  constructor(code: string, message: string, details: unknown[] = []) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
