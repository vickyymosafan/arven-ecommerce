import { describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../src/modules/audit-notifications/audit-log.service.js';
import { UsersRolesService } from '../../src/modules/users-roles/users-roles.service.js';
import type { SessionStoreService, AuthenticatedActor } from '../../src/common/security/index.js';
import type { PrismaService } from '../../src/shared/prisma/prisma.service.js';

function makeActor(overrides: Partial<AuthenticatedActor> = {}): AuthenticatedActor {
  return {
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'owner@arven.test',
    fullName: 'ARVEN Owner',
    sessionId: '22222222-2222-4222-8222-222222222222',
    sessionTokenHash: 'a'.repeat(64),
    scope: 'ADMIN',
    roles: ['OWNER'],
    permissions: ['user.read', 'user.role.manage', 'audit.read'],
    mfaEnabled: true,
    mfaVerifiedAt: new Date(),
    ...overrides,
  };
}

describe('AuditLogService & UsersRolesService domain guards', () => {
  it('scrubs sensitive metadata and normalizes IPv4-mapped IPv6 addresses in AuditLogService', async () => {
    const createMock = vi.fn(async () => ({ id: 'audit-1' }));
    const prismaMock = {
      client: {
        auditLog: { create: createMock },
      },
    } as unknown as PrismaService;

    const service = new AuditLogService(prismaMock);
    await service.record({
      actorId: '11111111-1111-4111-8111-111111111111',
      action: 'role.updated',
      resource: 'Role',
      resourceId: '33333333-3333-4333-8333-333333333333',
      ipAddress: '::ffff:192.168.10.25',
      beforeState: {
        password: 'plain-secret-password',
        email: 'user@example.com',
        roleCode: 'MANAGER',
      },
      afterState: {
        csrfToken: 'secret-csrf-token',
        roleCode: 'ORDER',
      },
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const callArg = (createMock.mock.calls as unknown[][])[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(callArg.data['ipAddress']).toBe('192.168.10.25');
    expect(JSON.stringify(callArg.data['beforeState'])).not.toContain('plain-secret-password');
    expect(JSON.stringify(callArg.data['beforeState'])).not.toContain('user@example.com');
    expect(JSON.stringify(callArg.data['afterState'])).not.toContain('secret-csrf-token');
  });

  it('drops malformed non-IP strings so PostgreSQL inet column never rejects writes', async () => {
    const createMock = vi.fn(async () => ({ id: 'audit-2' }));
    const prismaMock = {
      client: {
        auditLog: { create: createMock },
      },
    } as unknown as PrismaService;

    const service = new AuditLogService(prismaMock);
    await service.record({
      action: 'user.profile.updated',
      resource: 'User',
      ipAddress: 'not-an-ip-address',
    });

    const callArg = (createMock.mock.calls as unknown[][])[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(callArg.data['ipAddress']).toBeNull();
  });

  it('blocks deleting system roles with 422 SYSTEM_ROLE_PROTECTED', async () => {
    const tx = {
      role: {
        findUnique: vi.fn(async () => ({
          id: 'role-1',
          code: 'OWNER',
          name: 'Owner',
          isSystem: true,
          userRoles: [],
        })),
      },
    };
    const prismaMock = {
      withTransaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
    } as unknown as PrismaService;
    const service = new UsersRolesService(
      prismaMock,
      {} as AuditLogService,
      {} as SessionStoreService,
    );

    await expect(service.deleteRole(makeActor(), 'role-1')).rejects.toMatchObject({
      code: 'SYSTEM_ROLE_PROTECTED',
    });
  });

  it('blocks removing core OWNER permissions with 422 SYSTEM_ROLE_PROTECTED', async () => {
    const tx = {
      role: {
        findUnique: vi.fn(async () => ({
          id: 'role-owner',
          code: 'OWNER',
          name: 'Owner',
          isSystem: true,
          rolePermissions: [
            { permission: { id: 'p1', code: 'user.role.manage' } },
            { permission: { id: 'p2', code: 'user.read' } },
          ],
          userRoles: [],
        })),
      },
    };
    const prismaMock = {
      withTransaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
    } as unknown as PrismaService;
    const service = new UsersRolesService(
      prismaMock,
      {} as AuditLogService,
      {} as SessionStoreService,
    );

    await expect(
      service.updateRole(makeActor(), 'role-owner', {
        permissions: ['user.read'],
      }),
    ).rejects.toMatchObject({
      code: 'SYSTEM_ROLE_PROTECTED',
    });
  });

  it('blocks MANAGER from suspending another admin account (403 FORBIDDEN)', async () => {
    const targetId = '99999999-9999-4999-8999-999999999999';
    const tx = {
      user: {
        findUnique: vi.fn(async () => ({
          id: targetId,
          status: 'ACTIVE',
          userRoles: [{ role: { code: 'MANAGER' } }],
        })),
      },
    };
    const prismaMock = {
      withTransaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
    } as unknown as PrismaService;
    const service = new UsersRolesService(
      prismaMock,
      {} as AuditLogService,
      {} as SessionStoreService,
    );

    const managerActor = makeActor({
      roles: ['MANAGER'],
      permissions: ['user.read', 'user.manage.limited'],
    });

    await expect(
      service.updateUserStatus(managerActor, targetId, { status: 'SUSPENDED' }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('blocks self-suspension and removing own OWNER role', async () => {
    const actor = makeActor();
    const tx = {
      user: {
        findUnique: vi.fn(async () => ({
          id: actor.userId,
          status: 'ACTIVE',
          userRoles: [{ role: { id: 'r1', code: 'OWNER' } }],
        })),
      },
      role: {
        findMany: vi.fn(async () => [{ id: 'r2', code: 'CUSTOMER' }]),
      },
    };
    const prismaMock = {
      withTransaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
    } as unknown as PrismaService;
    const service = new UsersRolesService(
      prismaMock,
      {} as AuditLogService,
      {} as SessionStoreService,
    );

    await expect(
      service.updateUserStatus(actor, actor.userId, { status: 'SUSPENDED' }),
    ).rejects.toMatchObject({
      code: 'SELF_SUSPENSION_FORBIDDEN',
    });

    await expect(
      service.assignUserRoles(actor, actor.userId, { roleCodes: ['CUSTOMER'] }),
    ).rejects.toMatchObject({
      code: 'OWNER_LOCKOUT_PREVENTED',
    });
  });
});
