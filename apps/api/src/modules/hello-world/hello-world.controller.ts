import type { Request, Response } from 'express';

import { ValidationError } from '../../shared/errors/index.js';
import { requireTenantContext } from '../../shared/utils/requireTenantContext.js';
import { HelloWorldService } from './hello-world.service.js';
import { createHelloWorldSchema } from './hello-world.validators.js';

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
