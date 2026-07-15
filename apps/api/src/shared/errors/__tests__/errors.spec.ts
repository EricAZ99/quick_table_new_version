import { describe, expect, it } from 'vitest';

import {
  AppError,
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../index.js';

describe('classes d’erreurs typées (doc 12 §12.3)', () => {
  it.each([
    [NotFoundError, 404, 'Ressource introuvable.'],
    [ValidationError, 400, 'Requête invalide.'],
    [ForbiddenError, 403, 'Action non autorisée.'],
    [ConflictError, 409, 'Conflit détecté.'],
    [BusinessRuleError, 422, 'Règle métier violée.'],
  ] as const)(
    '%s : httpStatus %i, message par défaut',
    (ErrorClass, httpStatus, defaultMessage) => {
      const error = new ErrorClass('SOME_CODE');

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
      expect(error.httpStatus).toBe(httpStatus);
      expect(error.code).toBe('SOME_CODE');
      expect(error.message).toBe(defaultMessage);
      expect(error.details).toEqual([]);
    },
  );

  it('accepte un message et des details personnalises', () => {
    const error = new ValidationError('INVALID_PAYLOAD', 'Le champ email est invalide.', [
      { field: 'email', issue: 'format invalide' },
    ]);

    expect(error.message).toBe('Le champ email est invalide.');
    expect(error.details).toEqual([{ field: 'email', issue: 'format invalide' }]);
  });

  it('conserve le nom de la classe concrète (utile en log)', () => {
    const error = new ConflictError('ORDER_ALREADY_PAID');

    expect(error.name).toBe('ConflictError');
  });
});
