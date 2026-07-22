import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

import type { MembershipDocument, MembershipRole } from '../../database/models/membership.model.js';
import type { UserDocument } from '../../database/models/user.model.js';
import { ConflictError, NotFoundError } from '../../shared/errors/index.js';
import type { UsersRepository } from '../users/users.repository.js';
import type {
  InviteEmployeeDto,
  ListEmployeesQuery,
  UpdateEmployeeDto,
} from './employees.validators.js';
import type { MembershipsRepository } from './memberships.repository.js';

type MembershipWithUser = Omit<MembershipDocument, 'userId'> & {
  _id: string;
  userId: UserDocument & { _id: string };
};

export interface EmployeeDto {
  id: string;
  role: MembershipRole;
  jobTitle: string | null;
  salary: number | null | undefined;
  employmentStatus: 'active' | 'inactive';
  hiredAt: Date | null;
  user: {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    avatarUrl: string | null;
  };
}

const USER_POPULATE_FIELDS = 'email fullName phone avatarUrl';

/**
 * `POST/GET/PATCH/DELETE /employees` (doc 09 §9.5, Feature 2.2). Un
 * "employé" est un `membership` (doc 05) enrichi de l'identité `users`
 * correspondante — `.populate('userId', ...)` (1ère utilisation du projet,
 * `userId` porte déjà `ref: 'User'` au schéma) plutôt que deux requêtes
 * manuelles séparées.
 *
 * La limite `maxEmployees` (409 `EMPLOYEE_LIMIT_REACHED`, doc 09 §9.5) et
 * le véritable envoi d'email d'invitation + activation sont les deux
 * tickets suivants de cette Feature — volontairement pas anticipés ici
 * (doc 14 §14.5 KISS, un ticket à la fois).
 */
export class EmployeesService {
  constructor(
    private readonly membershipsRepository: MembershipsRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  async listEmployees(
    tenantId: string,
    query: ListEmployeesQuery,
    canViewSalary: boolean,
  ): Promise<{ employees: EmployeeDto[]; meta: { page: number; limit: number; total: number } }> {
    const filter: Record<string, unknown> = {};
    if (query.role) filter.role = query.role;
    if (query.status) filter.employmentStatus = query.status;

    const skip = (query.page - 1) * query.limit;
    const [memberships, total] = await Promise.all([
      this.membershipsRepository
        .find(filter, { tenantId })
        .populate('userId', USER_POPULATE_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit),
      this.membershipsRepository.count(filter, { tenantId }),
    ]);

    return {
      employees: (memberships as unknown as MembershipWithUser[]).map((membership) =>
        toEmployeeDto(membership, canViewSalary),
      ),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  async getEmployee(tenantId: string, id: string, canViewSalary: boolean): Promise<EmployeeDto> {
    const membership = await this.membershipsRepository
      .findOne({ _id: id }, { tenantId })
      .populate('userId', USER_POPULATE_FIELDS);
    if (!membership) {
      throw new NotFoundError('EMPLOYEE_NOT_FOUND', 'Employé introuvable.');
    }
    return toEmployeeDto(membership as unknown as MembershipWithUser, canViewSalary);
  }

  /**
   * Crée le compte `users` si l'email est inconnu (mot de passe aléatoire
   * inutilisable — aucun moyen de le récupérer tant que le flux
   * d'activation, ticket suivant, n'existe pas) ou réutilise le compte
   * existant. `memberships` a un index unique `{tenantId, userId}` — une
   * tentative d'inviter un email déjà membre de ce restaurant remonte en
   * 409 `EMPLOYEE_ALREADY_MEMBER` plutôt qu'une erreur Mongo brute.
   */
  async inviteEmployee(tenantId: string, dto: InviteEmployeeDto): Promise<EmployeeDto> {
    let user = await this.usersRepository.findByEmail(dto.email);
    if (!user) {
      const passwordHash = await argon2.hash(randomUUID(), { type: argon2.argon2id });
      user = await this.usersRepository.create({
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
      });
    }

    try {
      const membership = await this.membershipsRepository.create(
        {
          userId: user._id.toString(),
          role: dto.role,
          jobTitle: dto.jobTitle,
          salary: dto.salary,
          hiredAt: dto.hiredAt,
        },
        { tenantId },
      );
      return toEmployeeDto(
        { ...membership.toObject(), userId: user } as unknown as MembershipWithUser,
        true,
      );
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError(
          'EMPLOYEE_ALREADY_MEMBER',
          'Cet email est déjà membre de ce restaurant.',
        );
      }
      throw error;
    }
  }

  async updateEmployee(tenantId: string, id: string, dto: UpdateEmployeeDto): Promise<EmployeeDto> {
    const result = await this.membershipsRepository.updateOne({ _id: id }, dto, { tenantId });
    if (result.matchedCount === 0) {
      throw new NotFoundError('EMPLOYEE_NOT_FOUND', 'Employé introuvable.');
    }
    return this.getEmployee(tenantId, id, true);
  }

  /** `DELETE /employees/:id` (doc 09 §9.5) : "désactive (soft delete du membership)" — jamais une suppression réelle. */
  async deactivateEmployee(tenantId: string, id: string): Promise<void> {
    const result = await this.membershipsRepository.updateOne(
      { _id: id },
      { employmentStatus: 'inactive' },
      { tenantId },
    );
    if (result.matchedCount === 0) {
      throw new NotFoundError('EMPLOYEE_NOT_FOUND', 'Employé introuvable.');
    }
  }
}

function toEmployeeDto(membership: MembershipWithUser, canViewSalary: boolean): EmployeeDto {
  const user = membership.userId;
  return {
    id: membership._id.toString(),
    role: membership.role,
    jobTitle: membership.jobTitle ?? null,
    salary: canViewSalary ? (membership.salary ?? null) : undefined,
    employmentStatus: membership.employmentStatus,
    hiredAt: membership.hiredAt ?? null,
    user: {
      id: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      phone: user.phone ?? null,
      avatarUrl: user.avatarUrl ?? null,
    },
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}
