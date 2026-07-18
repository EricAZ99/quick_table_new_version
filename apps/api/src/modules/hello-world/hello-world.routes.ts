import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware.js';
import { resolveTenant } from '../../middlewares/tenant.middleware.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { HelloWorldController } from './hello-world.controller.js';
import { HelloWorldRepository } from './hello-world.repository.js';
import { HelloWorldService } from './hello-world.service.js';

const repository = new HelloWorldRepository();
const service = new HelloWorldService(repository);
const controller = new HelloWorldController(service);

export const helloWorldRouter = Router();

helloWorldRouter.post('/', requireAuth, resolveTenant, asyncHandler(controller.create));
helloWorldRouter.get('/', requireAuth, resolveTenant, asyncHandler(controller.list));
