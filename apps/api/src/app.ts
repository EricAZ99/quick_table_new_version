import express, { type Express } from 'express';

/**
 * Construit l'instance Express de l'API QuickTable.
 *
 * Volontairement sans middleware ni route à ce stade : la chaîne complète
 * (helmet, cors, sanitize, rate-limit, correlationId, auth, tenant, rbac,
 * validate — doc 12 §12.4) est introduite module par module à partir de la
 * Feature 0.3 (socle applicatif), pas dans ce ticket d'initialisation du
 * monorepo (doc 34, Epic 0, Feature 0.1).
 */
export function createApp(): Express {
  const app = express();
  return app;
}
