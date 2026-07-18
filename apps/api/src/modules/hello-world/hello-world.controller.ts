import type { Request, Response } from 'express';

import { ValidationError } from '../../shared/errors/index.js';
import { HelloWorldService } from './hello-world.service.js';
import { createHelloWorldSchema } from './hello-world.validators.js';

/**
 * `hello-world` est un endpoint métier tenant-scoped, pas une route
 * platform-admin (doc 06 §6.3) : `req.context.tenantId` ne peut être
 * `null` ici que si un super_admin sans restaurant actif l'appelle
 * directement — cas rejeté explicitement en 400 plutôt que de laisser
 * `null` remonter jusqu'à `BaseRepository` (qui exige une `string`,
 * doc 06 §6.4). Réutilise le même code `TENANT_CONTEXT_REQUIRED` que
 * `tenant.middleware.ts` (même situation : aucun tenant actif résolu).
 */
function requireTenantContext(req: Request): string {
  const tenantId = req.context?.tenantId;
  if (!tenantId) {
    throw new ValidationError(
      'TENANT_CONTEXT_REQUIRED',
      'Aucun restaurant actif sélectionné — veuillez en choisir un.',
    );
  }
  return tenantId;
}

/** Controller (doc 12 §12.2) : HTTP <-> DTO, un seul service appelé, réponse standard (doc 09 §9.1). */
export class HelloWorldController {
  constructor(private readonly service: HelloWorldService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const tenantId = requireTenantContext(req);
    const parsed = createHelloWorldSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        'HELLO_WORLD_INVALID_PAYLOAD',
        'Payload invalide.',
        parsed.error.issues,
      );
    }

    const doc = await this.service.create(parsed.data, { tenantId });
    res.status(201).json({ success: true, data: doc });
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const tenantId = requireTenantContext(req);
    const docs = await this.service.list({ tenantId });
    res.status(200).json({ success: true, data: docs });
  };
}
