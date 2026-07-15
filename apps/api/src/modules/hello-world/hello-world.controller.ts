import type { Request, Response } from 'express';

import { ValidationError } from '../../shared/errors/index.js';
import { HelloWorldService } from './hello-world.service.js';
import { createHelloWorldSchema } from './hello-world.validators.js';

/**
 * `tenant.middleware.ts` (résolution `req.context.tenantId` depuis le JWT,
 * doc 06 §6.3) n'existe pas encore (Epic 1) — ce module de référence utilise
 * un tenant de démonstration fixé côté serveur, jamais lu depuis la requête
 * cliente (respecte la règle absolue doc 06 §6.2 : le tenantId ne vient
 * jamais du body/query/URL). À remplacer par `req.context.tenantId` dès que
 * `tenant.middleware.ts` existe — seule ligne à changer dans ce fichier.
 */
export const DEMO_TENANT_ID = 'demo-tenant';

/** Controller (doc 12 §12.2) : HTTP <-> DTO, un seul service appelé, réponse standard (doc 09 §9.1). */
export class HelloWorldController {
  constructor(private readonly service: HelloWorldService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const parsed = createHelloWorldSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        'HELLO_WORLD_INVALID_PAYLOAD',
        'Payload invalide.',
        parsed.error.issues,
      );
    }

    const doc = await this.service.create(parsed.data, { tenantId: DEMO_TENANT_ID });
    res.status(201).json({ success: true, data: doc });
  };

  list = async (_req: Request, res: Response): Promise<void> => {
    const docs = await this.service.list({ tenantId: DEMO_TENANT_ID });
    res.status(200).json({ success: true, data: docs });
  };
}
