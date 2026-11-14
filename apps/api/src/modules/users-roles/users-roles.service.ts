import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ADMIN_ROLE_CODES, PERMISSION_CODES } from '@arven/config';
import type { AdminUserSummaryDto, RoleSummaryDto } from '@arven/contracts';
import type { Prisma } from '@arven/database';
import { maskIp, maskPhone } from '@arven/observability';
import {
  roleCodeSchema,
  type AddressResponse,
  type AdminUsersQuery,
  type AssignUserRolesRequest,
  type CreateAddressRequest,
  type CreateRoleRequest,
  type UpdateAddressRequest,
  type UpdateProfileRequest,
  type UpdateRoleRequest,
  type UpdateUserStatusRequest,
  type UserProfileResponse,
  type UserSessionSummary,
} from '@arven/validators';
import { DomainHttpException, type PaginatedResponse } from '../../common/http/index.js';
import {
  SessionStoreService,
  type AuthenticatedActor,
} from '../../common/security/index.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { AuditLogService } from '../audit-notifications/audit-log.service.js';

const CORE_OWNER_PERMISSIONS: ReadonlySet<string> = new Set([
  'user.read',
  'user.role.manage',
  'refund.approve',
  'settings.provider.manage',
  'audit.read',
]);

function summarizeUserAgent(userAgent: string | null): string {
  if (!userAgent) {
    return 'Unknown client';
  }
  const normalized = userAgent.replace(/\s+/g, ' ').trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function mapAddressResponse(row: {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  province: string;
  postalCode: string;
  countryCode: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AddressResponse {
  return {
    id: row.id,
    label: row.label,
    recipientName: row.recipientName,
    phone: row.phone,
    line1: row.addressLine1,
    line2: row.addressLine2,
    city: row.city,
    province: row.province,
    postalCode: row.postalCode,
    country: row.countryCode,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class UsersRolesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly auditLogService: AuditLogService,
    @Inject(SessionStoreService) private readonly sessionStore: SessionStoreService,
  ) {}

  async getMyProfile(userId: string): Promise<UserProfileResponse> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: { select: { code: true } },
          },
        },
      },
    });

    if (!user) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'User profile was not found',
      );
    }

    const roles: UserProfileResponse['roles'] = [];
    for (const userRole of user.userRoles) {
      const parsed = roleCodeSchema.safeParse(userRole.role.code);
      if (parsed.success) {
        roles.push(parsed.data);
      }
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      status: user.status,
      roles,
      mfaEnabled: user.mfaEnabled,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async updateMyProfile(
    actor: AuthenticatedActor,
    input: UpdateProfileRequest,
    ipAddress?: string | null,
  ): Promise<UserProfileResponse> {
    return this.prisma.withTransaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { id: actor.userId },
      });

      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'User profile was not found',
        );
      }

      const updated = await tx.user.update({
        where: { id: actor.userId },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
        },
        include: {
          userRoles: {
            include: {
              role: { select: { code: true } },
            },
          },
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'CUSTOMER',
          action: 'user.profile.updated',
          resource: 'User',
          resourceId: actor.userId,
          ipAddress: ipAddress ?? null,
          beforeState: {
            fullName: existing.fullName,
            hasPhone: existing.phone !== null,
          },
          afterState: {
            fullName: updated.fullName,
            hasPhone: updated.phone !== null,
          },
        },
        tx,
      );

      const roles: UserProfileResponse['roles'] = [];
      for (const userRole of updated.userRoles) {
        const parsed = roleCodeSchema.safeParse(userRole.role.code);
        if (parsed.success) {
          roles.push(parsed.data);
        }
      }

      return {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        phone: updated.phone,
        status: updated.status,
        roles,
        mfaEnabled: updated.mfaEnabled,
        createdAt: updated.createdAt.toISOString(),
      };
    });
  }

  async listMySessions(
    userId: string,
    currentSessionId: string,
  ): Promise<UserSessionSummary[]> {
    const rows = await this.prisma.client.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastSeenAt: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      scope: row.scope,
      ipMasked: row.ipAddress ? maskIp(row.ipAddress) : 'unknown',
      userAgentSummary: summarizeUserAgent(row.userAgent),
      mfaVerifiedAt: row.mfaVerifiedAt ? row.mfaVerifiedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      lastActiveAt: row.lastSeenAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      isCurrent: row.id === currentSessionId,
    }));
  }

  async revokeMySession(
    actor: AuthenticatedActor,
    sessionId: string,
    ipAddress?: string | null,
  ): Promise<void> {
    const existing = await this.prisma.client.session.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true },
    });

    if (!existing || existing.userId !== actor.userId) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'Session was not found',
      );
    }

    await this.sessionStore.revokeSessionById(sessionId, actor.userId);
    await this.auditLogService.record({
      actorId: actor.userId,
      actorRole: actor.roles[0] ?? 'CUSTOMER',
      action: 'user.session.revoked',
      resource: 'Session',
      resourceId: sessionId,
      ipAddress: ipAddress ?? null,
    });
  }

  async listMyAddresses(userId: string): Promise<AddressResponse[]> {
    const rows = await this.prisma.client.address.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });

    return rows.map(mapAddressResponse);
  }

  async createMyAddress(
    actor: AuthenticatedActor,
    input: CreateAddressRequest,
    ipAddress?: string | null,
  ): Promise<AddressResponse> {
    return this.prisma.withTransaction(async (tx) => {
      if (input.isDefault) {
        await tx.address.updateMany({
          where: {
            userId: actor.userId,
            isDefault: true,
            deletedAt: null,
          },
          data: { isDefault: false },
        });
      }

      const created = await tx.address.create({
        data: {
          userId: actor.userId,
          label: input.label,
          recipientName: input.recipientName,
          phone: input.phone,
          addressLine1: input.line1,
          addressLine2: input.line2 ?? null,
          city: input.city,
          province: input.province,
          postalCode: input.postalCode,
          countryCode: input.country,
          isDefault: input.isDefault,
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'CUSTOMER',
          action: 'user.address.created',
          resource: 'Address',
          resourceId: created.id,
          ipAddress: ipAddress ?? null,
          afterState: {
            label: created.label,
            city: created.city,
            province: created.province,
            isDefault: created.isDefault,
          },
        },
        tx,
      );

      return mapAddressResponse(created);
    });
  }

  async updateMyAddress(
    actor: AuthenticatedActor,
    addressId: string,
    input: UpdateAddressRequest,
    ipAddress?: string | null,
  ): Promise<AddressResponse> {
    return this.prisma.withTransaction(async (tx) => {
      const existing = await tx.address.findFirst({
        where: {
          id: addressId,
          userId: actor.userId,
          deletedAt: null,
        },
      });

      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'Address was not found',
        );
      }

      if (input.isDefault === true) {
        await tx.address.updateMany({
          where: {
            userId: actor.userId,
            isDefault: true,
            deletedAt: null,
            id: { not: addressId },
          },
          data: { isDefault: false },
        });
      }

      const updated = await tx.address.update({
        where: { id: addressId },
        data: {
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.recipientName !== undefined ? { recipientName: input.recipientName } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.line1 !== undefined ? { addressLine1: input.line1 } : {}),
          ...(input.line2 !== undefined ? { addressLine2: input.line2 } : {}),
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.province !== undefined ? { province: input.province } : {}),
          ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}),
          ...(input.country !== undefined ? { countryCode: input.country } : {}),
          ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'CUSTOMER',
          action: 'user.address.updated',
          resource: 'Address',
          resourceId: addressId,
          ipAddress: ipAddress ?? null,
          beforeState: {
            label: existing.label,
            city: existing.city,
            isDefault: existing.isDefault,
          },
          afterState: {
            label: updated.label,
            city: updated.city,
            isDefault: updated.isDefault,
          },
        },
        tx,
      );

      return mapAddressResponse(updated);
    });
  }

  async deleteMyAddress(
    actor: AuthenticatedActor,
    addressId: string,
    ipAddress?: string | null,
  ): Promise<void> {
    await this.prisma.withTransaction(async (tx) => {
      const existing = await tx.address.findFirst({
        where: {
          id: addressId,
          userId: actor.userId,
          deletedAt: null,
        },
      });

      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'Address was not found',
        );
      }

      await tx.address.update({
        where: { id: addressId },
        data: {
          deletedAt: new Date(),
          isDefault: false,
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'CUSTOMER',
          action: 'user.address.deleted',
          resource: 'Address',
          resourceId: addressId,
          ipAddress: ipAddress ?? null,
        },
        tx,
      );
    });
  }

  async listRoles(): Promise<RoleSummaryDto[]> {
    const roles = await this.prisma.client.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
      include: {
        rolePermissions: {
          include: {
            permission: { select: { code: true } },
          },
        },
      },
    });

    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.rolePermissions.map((rp) => rp.permission.code).sort(),
    }));
  }

  async createRole(
    actor: AuthenticatedActor,
    input: CreateRoleRequest,
    ipAddress?: string | null,
  ): Promise<RoleSummaryDto> {
    const validCodes = new Set<string>(PERMISSION_CODES);
    for (const code of input.permissions) {
      if (!validCodes.has(code)) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          `Unknown permission code: ${code}`,
        );
      }
    }

    return this.prisma.withTransaction(async (tx) => {
      const existing = await tx.role.findUnique({
        where: { code: input.code },
        select: { id: true },
      });
      if (existing) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'CONFLICT',
          `Role with code ${input.code} already exists`,
        );
      }

      const permissions =
        input.permissions.length > 0
          ? await tx.permission.findMany({
              where: { code: { in: input.permissions } },
              select: { id: true, code: true },
            })
          : [];

      if (permissions.length !== input.permissions.length) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          'One or more permission codes are not registered in the database',
        );
      }

      const created = await tx.role.create({
        data: {
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          isSystem: false,
          ...(permissions.length > 0
            ? {
                rolePermissions: {
                  create: permissions.map((permission) => ({
                    permissionId: permission.id,
                  })),
                },
              }
            : {}),
        },
      });

      const sortedPermissions = permissions.map((permission) => permission.code).sort();

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'OWNER',
          action: 'role.created',
          resource: 'Role',
          resourceId: created.id,
          ipAddress: ipAddress ?? null,
          afterState: {
            code: created.code,
            name: created.name,
            permissions: sortedPermissions,
          },
        },
        tx,
      );

      return {
        id: created.id,
        code: created.code,
        name: created.name,
        description: created.description,
        isSystem: created.isSystem,
        permissions: sortedPermissions,
      };
    });
  }

  async updateRole(
    actor: AuthenticatedActor,
    roleId: string,
    input: UpdateRoleRequest,
    ipAddress?: string | null,
  ): Promise<RoleSummaryDto> {
    return this.prisma.withTransaction(async (tx) => {
      const existing = await tx.role.findUnique({
        where: { id: roleId },
        include: {
          rolePermissions: {
            include: {
              permission: { select: { id: true, code: true } },
            },
          },
          userRoles: {
            select: { userId: true },
          },
        },
      });

      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'Role was not found',
        );
      }

      const previousPermissions = existing.rolePermissions
        .map((rp) => rp.permission.code)
        .sort();

      if (existing.code === 'OWNER' && input.permissions !== undefined) {
        const nextSet = new Set<string>(input.permissions);
        for (const requiredCode of CORE_OWNER_PERMISSIONS) {
          if (!nextSet.has(requiredCode)) {
            throw new DomainHttpException(
              HttpStatus.UNPROCESSABLE_ENTITY,
              'SYSTEM_ROLE_PROTECTED',
              `Core OWNER permission "${requiredCode}" cannot be removed`,
            );
          }
        }
      }

      let nextPermissionCodes = previousPermissions;

      if (input.permissions !== undefined) {
        const targetPermissions =
          input.permissions.length > 0
            ? await tx.permission.findMany({
                where: { code: { in: input.permissions } },
                select: { id: true, code: true },
              })
            : [];

        if (targetPermissions.length !== input.permissions.length) {
          throw new DomainHttpException(
            HttpStatus.BAD_REQUEST,
            'VALIDATION_ERROR',
            'One or more permission codes are not registered in the database',
          );
        }

        await tx.rolePermission.deleteMany({
          where: { roleId },
        });
        if (targetPermissions.length > 0) {
          await tx.rolePermission.createMany({
            data: targetPermissions.map((permission) => ({
              roleId,
              permissionId: permission.id,
            })),
          });
        }
        nextPermissionCodes = targetPermissions.map((p) => p.code).sort();
      }

      const updated = await tx.role.update({
        where: { id: roleId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'OWNER',
          action: 'role.updated',
          resource: 'Role',
          resourceId: roleId,
          ipAddress: ipAddress ?? null,
          beforeState: {
            code: existing.code,
            name: existing.name,
            permissions: previousPermissions,
          },
          afterState: {
            code: updated.code,
            name: updated.name,
            permissions: nextPermissionCodes,
          },
        },
        tx,
      );

      if (input.permissions !== undefined) {
        const affectedUserIds = existing.userRoles.map((ur) => ur.userId);
        await Promise.all(
          affectedUserIds.map((uid) => this.sessionStore.revokeAllUserSessions(uid, tx)),
        );
      }

      return {
        id: updated.id,
        code: updated.code,
        name: updated.name,
        description: updated.description,
        isSystem: updated.isSystem,
        permissions: nextPermissionCodes,
      };
    });
  }

  async deleteRole(
    actor: AuthenticatedActor,
    roleId: string,
    ipAddress?: string | null,
  ): Promise<void> {
    await this.prisma.withTransaction(async (tx) => {
      const existing = await tx.role.findUnique({
        where: { id: roleId },
        include: {
          userRoles: { select: { userId: true } },
        },
      });

      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'Role was not found',
        );
      }

      if (existing.isSystem) {
        throw new DomainHttpException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'SYSTEM_ROLE_PROTECTED',
          'System roles cannot be deleted',
        );
      }

      const userIds = existing.userRoles.map((ur) => ur.userId);
      await Promise.all(
        userIds.map((uid) => this.sessionStore.revokeAllUserSessions(uid, tx)),
      );

      await tx.role.delete({
        where: { id: roleId },
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'OWNER',
          action: 'role.deleted',
          resource: 'Role',
          resourceId: roleId,
          ipAddress: ipAddress ?? null,
          beforeState: {
            code: existing.code,
            name: existing.name,
            affectedUserCount: userIds.length,
          },
        },
        tx,
      );
    });
  }

  async listAdminUsers(
    query: AdminUsersQuery,
  ): Promise<PaginatedResponse<AdminUserSummaryDto>> {
    if (query.status === 'DELETED') {
      return {
        items: [],
        page: query.page,
        limit: query.limit,
        total: 0,
      };
    }

    const where: Prisma.UserWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { fullName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.roleCode
        ? {
            userRoles: {
              some: {
                role: { code: query.roleCode },
              },
            },
          }
        : {}),
    };

    const skip = (query.page - 1) * query.limit;

    const [users, total] = await Promise.all([
      this.prisma.client.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        include: {
          userRoles: {
            include: {
              role: { select: { code: true } },
            },
          },
        },
      }),
      this.prisma.client.user.count({ where }),
    ]);

    const items: AdminUserSummaryDto[] = users.map((user) => ({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phoneMasked: user.phone ? maskPhone(user.phone) : null,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      roles: user.userRoles.map((ur) => ur.role.code).sort(),
      createdAt: user.createdAt.toISOString(),
    }));

    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async assignUserRoles(
    actor: AuthenticatedActor,
    targetUserId: string,
    input: AssignUserRolesRequest,
    ipAddress?: string | null,
  ): Promise<AdminUserSummaryDto> {
    return this.prisma.withTransaction(async (tx) => {
      const targetUser = await tx.user.findUnique({
        where: { id: targetUserId },
        include: {
          userRoles: {
            include: {
              role: { select: { id: true, code: true } },
            },
          },
        },
      });

      if (!targetUser) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'Target user was not found',
        );
      }

      const targetRoles = await tx.role.findMany({
        where: { code: { in: input.roleCodes } },
        select: { id: true, code: true },
      });

      if (targetRoles.length !== input.roleCodes.length) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          'One or more specified role codes do not exist',
        );
      }

      const previousRoleCodes = targetUser.userRoles.map((ur) => ur.role.code).sort();
      const nextRoleCodes = targetRoles.map((role) => role.code).sort();
      const hadOwner = previousRoleCodes.includes('OWNER');
      const willHaveOwner = nextRoleCodes.includes('OWNER');

      if (actor.userId === targetUserId && hadOwner && !willHaveOwner) {
        throw new DomainHttpException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'OWNER_LOCKOUT_PREVENTED',
          'You cannot remove the OWNER role from your own account',
        );
      }

      if (hadOwner && !willHaveOwner) {
        const otherActiveOwners = await tx.userRole.count({
          where: {
            userId: { not: targetUserId },
            role: { code: 'OWNER' },
            user: { status: 'ACTIVE' },
          },
        });
        if (otherActiveOwners === 0) {
          throw new DomainHttpException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'OWNER_LOCKOUT_PREVENTED',
            'At least one active OWNER account must remain assigned',
          );
        }
      }

      await tx.userRole.deleteMany({
        where: { userId: targetUserId },
      });
      await tx.userRole.createMany({
        data: targetRoles.map((role) => ({
          userId: targetUserId,
          roleId: role.id,
          assignedBy: actor.userId,
        })),
      });

      await this.sessionStore.revokeAllUserSessions(targetUserId, tx);

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'OWNER',
          action: 'user.roles.updated',
          resource: 'User',
          resourceId: targetUserId,
          ipAddress: ipAddress ?? null,
          beforeState: {
            roles: previousRoleCodes,
          },
          afterState: {
            roles: nextRoleCodes,
            ...(input.reason ? { reason: input.reason } : {}),
          },
        },
        tx,
      );

      return {
        id: targetUser.id,
        email: targetUser.email,
        fullName: targetUser.fullName,
        phoneMasked: targetUser.phone ? maskPhone(targetUser.phone) : null,
        status: targetUser.status,
        mfaEnabled: targetUser.mfaEnabled,
        roles: nextRoleCodes,
        createdAt: targetUser.createdAt.toISOString(),
      };
    });
  }

  async updateUserStatus(
    actor: AuthenticatedActor,
    targetUserId: string,
    input: UpdateUserStatusRequest,
    ipAddress?: string | null,
  ): Promise<AdminUserSummaryDto> {
    if (actor.userId === targetUserId && input.status === 'SUSPENDED') {
      throw new DomainHttpException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'SELF_SUSPENSION_FORBIDDEN',
        'You cannot suspend your own account',
      );
    }

    return this.prisma.withTransaction(async (tx) => {
      const targetUser = await tx.user.findUnique({
        where: { id: targetUserId },
        include: {
          userRoles: {
            include: {
              role: { select: { code: true } },
            },
          },
        },
      });

      if (!targetUser) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'Target user was not found',
        );
      }

      const targetRoles = targetUser.userRoles.map((ur) => ur.role.code).sort();
      const actorHasFullRoleManage = actor.permissions.includes('user.role.manage');
      const targetIsPrivilegedAdmin = targetRoles.some((code) =>
        (ADMIN_ROLE_CODES as readonly string[]).includes(code),
      );

      if (!actorHasFullRoleManage && targetIsPrivilegedAdmin) {
        throw new DomainHttpException(
          HttpStatus.FORBIDDEN,
          'FORBIDDEN',
          'Insufficient privileges to modify an administrative account status',
        );
      }

      if (targetRoles.includes('OWNER') && input.status === 'SUSPENDED') {
        const otherActiveOwners = await tx.userRole.count({
          where: {
            userId: { not: targetUserId },
            role: { code: 'OWNER' },
            user: { status: 'ACTIVE' },
          },
        });
        if (otherActiveOwners === 0) {
          throw new DomainHttpException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'OWNER_LOCKOUT_PREVENTED',
            'Cannot suspend the last active OWNER account',
          );
        }
      }

      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: { status: input.status },
      });

      if (input.status === 'SUSPENDED') {
        await this.sessionStore.revokeAllUserSessions(targetUserId, tx);
      }

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'ADMIN',
          action: 'user.status.updated',
          resource: 'User',
          resourceId: targetUserId,
          ipAddress: ipAddress ?? null,
          beforeState: {
            status: targetUser.status,
            roles: targetRoles,
          },
          afterState: {
            status: updated.status,
            ...(input.reason ? { reason: input.reason } : {}),
          },
        },
        tx,
      );

      return {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        phoneMasked: updated.phone ? maskPhone(updated.phone) : null,
        status: updated.status,
        mfaEnabled: updated.mfaEnabled,
        roles: targetRoles,
        createdAt: updated.createdAt.toISOString(),
      };
    });
  }
}
