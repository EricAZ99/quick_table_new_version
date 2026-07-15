import { Router } from 'express';

import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { HelloWorldController } from './hello-world.controller.js';
import { HelloWorldRepository } from './hello-world.repository.js';
import { HelloWorldService } from './hello-world.service.js';

const repository = new HelloWorldRepository();
const service = new HelloWorldService(repository);
const controller = new HelloWorldController(service);

export const helloWorldRouter = Router();

helloWorldRouter.post('/', asyncHandler(controller.create));
helloWorldRouter.get('/', asyncHandler(controller.list));
