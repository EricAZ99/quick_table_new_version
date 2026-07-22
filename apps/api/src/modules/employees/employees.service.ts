import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

import type { MembershipDocument, MembershipRole } from '../../database/models/membership.model.js';
import type { UserDocument } from '../../database/models/user.model.js';
import type { EmailJobData } from '../../jobs/queues.js';
import { DEFAULT_LOCALE, type SupportedLocale } from '../../middlewares/i18n.middleware.js';
import { ConflictError, NotFoundError } from '../../shared/errors/index.js';
import type { AuthRepository } from '../auth/index.js';
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from '../auth/index.js';
import { employeeInvitationEmailTemplate } from '../notifications/email-templates/employeeInvitation.template.js';
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
 * La limite `maxEmployees` (409 `EMPLOYEE_LIMIT_REACHED`, doc 09 §9.5)
 * reste hors périmètre : nécessite de vrais `subscriptionPlans` (Feature
 * 9.1, pas commencée), aucune limite par défaut n'étant documentée nulle
 * part pour en improviser une (décision validée avec toi — reportée, pas
 * juste réduite).
 */
export class EmployeesService {
  constructor(
    private readonly membershipsRepository: MembershipsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly authRepository: AuthRepository,
    // Enfilage injecté, pas un import direct de `jobs/queues.ts` — même
    // raison que `AuthService` (testable sans BullMQ/Redis réel).
    private readonly enqueueEmailJob: (data: EmailJobData) => Promise<void>,
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
   * inutilisable) ou réutilise le compte existant. Pour un compte
   * fraîchement créé, enfile un email d'invitation dont le lien
   * d'activation réutilise le mécanisme "mot de passe oublié" (doc 07
   * §7.5, même token opaque à usage unique, même `POST
   * /auth/reset-password` pour le consommer) — pas de second mécanisme de
   * token dupliqué pour la même chose. Un compte déjà existant n'a pas
   * besoin d'activation (il a déjà un vrai mot de passe utilisable) — pas
   * d'email dans ce cas. `memberships` a un index unique
   * `{tenantId, userId}` — une tentative d'inviter un email déjà membre
   * de ce restaurant remonte en 409 `EMPLOYEE_ALREADY_MEMBER` plutôt
   * qu'une erreur Mongo brute.
   */
  async inviteEmployee(tenantId: string, dto: InviteEmployeeDto): Promise<EmployeeDto> {
    let user = await this.usersRepository.findByEmail(dto.email);
    let isNewAccount = false;
    if (!user) {
      isNewAccount = true;
      const passwordHash = await argon2.hash(randomUUID(), { type: argon2.argon2id });
      user = await this.usersRepository.create({
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
      });
    }

    let membership;
    try {
      membership = await this.membershipsRepository.create(
        {
          userId: user._id.toString(),
          role: dto.role,
          jobTitle: dto.jobTitle,
          salary: dto.salary,
          hiredAt: dto.hiredAt,
        },
        { tenantId },
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

    // Après coup, jamais avant : envoyer l'invitation avant que le
    // membership existe réellement enverrait un lien d'activation pour un
    // rattachement qui pourrait ensuite échouer (ex. doublon détecté par
    // l'index unique ci-dessus).
    if (isNewAccount) {
      await this.sendActivationEmail(user);
    }

    return toEmployeeDto(
      { ...membership.toObject(), userId: user } as unknown as MembershipWithUser,
      true,
    );
  }

  /** Même flux que `AuthService#forgotPassword` (doc 07 §7.5) — token opaque haute entropie, hashé en base, lien à usage unique valable 30 min. */
  private async sendActivationEmail(user: {
    _id: unknown;
    email: string;
    preferredLocale: SupportedLocale | null;
  }): Promise<void> {
    const rawToken = generatePasswordResetToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
    await this.authRepository.createPasswordResetToken({
      userId: String(user._id),
      tokenHash: hashPasswordResetToken(rawToken),
      expiresAt,
    });

    const activationLink = `https://app.quicktable.io/activate-account?token=${rawToken}`;
    const locale = user.preferredLocale ?? DEFAULT_LOCALE;
    const { subject, html, text } = employeeInvitationEmailTemplate(locale, activationLink);
    await this.enqueueEmailJob({ to: user.email, subject, html, text });
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
