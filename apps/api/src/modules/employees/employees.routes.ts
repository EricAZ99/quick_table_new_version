import { Router } from 'express';

import { enqueueEmailJob } from '../../jobs/queues.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import { resolveTenant } from '../../middlewares/tenant.middleware.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { AuthRepository } from '../auth/index.js';
import { UsersRepository } from '../users/index.js';
import { EmployeesController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';
import { MembershipsRepository } from './memberships.repository.js';

const service = new EmployeesService(
  new MembershipsRepository(),
  new UsersRepository(),
  new AuthRepository(),
  enqueueEmailJob,
);
const controller = new EmployeesController(service);

export const employeesRouter = Router();

employeesRouter.get(
  '/',
  requireAuth,
  resolveTenant,
  requirePermission('employees:read'),
  asyncHandler(controller.list),
);

employeesRouter.post(
  '/',
  requireAuth,
  resolveTenant,
  requirePermission('employees:create'),
  asyncHandler(controller.create),
);

employeesRouter.get(
  '/:id',
  requireAuth,
  resolveTenant,
  requirePermission('employees:read'),
  asyncHandler(controller.getOne),
);

employeesRouter.patch(
  '/:id',
  requireAuth,
  resolveTenant,
  requirePermission('employees:update'),
  asyncHandler(controller.update),
);

employeesRouter.delete(
  '/:id',
  requireAuth,
  resolveTenant,
  requirePermission('employees:delete'),
  asyncHandler(controller.remove),
);
