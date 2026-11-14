import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuditLogEntryDto } from '@arven/contracts';
import type { Prisma } from '@arven/database';
import { maskIp, scrubSensitiveMetadata } from '@arven/observability';
import { auditLogsQuerySchema, type AuditLogsQuery } from '@arven/validators';
import type { PaginatedResponse } from '../../common/http/index.js';
import {
  AdminAuth,
  CurrentActor,
  RequireAnyPermission,
  type AuthenticatedActor,
} from '../../common/security/index.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';

function scrubStateRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const scrubbed = scrubSensitiveMetadata(value as Record<string, unknown>);
  if (typeof scrubbed === 'object' && scrubbed !== null && !Array.isArray(scrubbed)) {
    return scrubbed as Record<string, unknown>;
  }
  return null;
}

@ApiTags('Admin Audit')
@Controller('admin/audit-logs')
@AdminAuth()
export class AuditNotificationsAdminController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @RequireAnyPermission('audit.read', 'audit.read.scoped')
  async listAuditLogs(
    @Query({ schema: auditLogsQuerySchema }) query: AuditLogsQuery,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<PaginatedResponse<AuditLogEntryDto>> {
    const hasGlobalAuditRead = actor.permissions.includes('audit.read');

    const where: Prisma.AuditLogWhereInput = {};
    if (!hasGlobalAuditRead) {
      where.actorId = actor.userId;
    } else if (query.actorId) {
      where.actorId = query.actorId;
    }

    if (query.action) {
      where.action = query.action;
    }
    if (query.resourceType) {
      where.resource = query.resourceType;
    }
    if (query.resourceId) {
      where.resourceId = query.resourceId;
    }
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);

    const items: AuditLogEntryDto[] = rows.map((row) => ({
      id: row.id,
      actorId: row.actorId,
      actorRole: row.actorRole,
      action: row.action,
      resourceType: row.resource,
      resourceId: row.resourceId,
      ipMasked: row.ipAddress ? maskIp(row.ipAddress) : null,
      requestId: row.requestId,
      beforeState: scrubStateRecord(row.beforeState),
      afterState: scrubStateRecord(row.afterState),
      createdAt: row.createdAt.toISOString(),
    }));

    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
    };
  }
}
