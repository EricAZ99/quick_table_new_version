import type { Request, Response } from 'express';

import { resolvePermissions } from '../../middlewares/rbac.middleware.js';
import { ValidationError } from '../../shared/errors/index.js';
import { requireTenantContext } from '../../shared/utils/requireTenantContext.js';
import type { EmployeesService } from './employees.service.js';
import {
  inviteEmployeeSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
} from './employees.validators.js';

/**
 * Controller (doc 12 §12.2). `salary` (doc 05 : "visible uniquement par
 * restaurant_owner/manager habilité", doc 08 §8.4 `employees:view_salary`)
 * n'est pas géré par `requirePermission` (qui bloquerait toute la requête,
 * pas juste un champ) — `resolvePermissions` (extrait de
 * `rbac.middleware.ts`) est rappelé ici pour décider, sans jamais refaire
 * la vérification "a-t-il employees:read" déjà garantie par la route.
 */
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const tenantId = requireTenantContext(req);
    const parsed = listEmployeesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(
        'EMPLOYEE_INVALID_PAYLOAD',
        'Paramètres invalides.',
        parsed.error.issues,
      );
    }

    const canViewSalary = await this.resolveCanViewSalary(req);
    const result = await this.service.listEmployees(tenantId, parsed.data, canViewSalary);
    res.status(200).json({ success: true, data: result.employees, meta: result.meta });
  };

  getOne = async (req: Request, res: Response): Promise<void> => {
    const tenantId = requireTenantContext(req);
    const canViewSalary = await this.resolveCanViewSalary(req);
    const employee = await this.service.getEmployee(tenantId, req.params.id ?? '', canViewSalary);
    res.status(200).json({ success: true, data: employee });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const tenantId = requireTenantContext(req);
    const parsed = inviteEmployeeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        'EMPLOYEE_INVALID_PAYLOAD',
        'Payload invalide.',
        parsed.error.issues,
      );
    }

    const employee = await this.service.inviteEmployee(tenantId, parsed.data);
    res.status(201).json({ success: true, data: employee });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const tenantId = requireTenantContext(req);
    const parsed = updateEmployeeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        'EMPLOYEE_INVALID_PAYLOAD',
        'Payload invalide.',
        parsed.error.issues,
      );
    }

    const employee = await this.service.updateEmployee(tenantId, req.params.id ?? '', parsed.data);
    res.status(200).json({ success: true, data: employee });
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const tenantId = requireTenantContext(req);
    await this.service.deactivateEmployee(tenantId, req.params.id ?? '');
    res.status(204).send();
  };

  private async resolveCanViewSalary(req: Request): Promise<boolean> {
    // `requireTenantContext` (déjà appelé avant celle-ci dans chaque
    // handler) a déjà validé qu'un `tenantId` non-null existe — `resolveTenant`
    // ne le pose ainsi que lorsqu'un membership réel a été trouvé, donc
    // `role`/`membershipId` sont garantis non-null au même moment.
    const context = req.context;
    if (!context?.role || !context.membershipId) {
      return false;
    }
    const resolvedPermissions = await resolvePermissions(
      context.role,
      context.membershipId,
      context.permissionsOverrides,
    );
    return resolvedPermissions.includes('employees:view_salary');
  }
}
