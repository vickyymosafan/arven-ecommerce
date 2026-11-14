import { isIP } from 'node:net';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaTransactionClient } from '@arven/database';
import { getRequestId, scrubSensitiveMetadata } from '@arven/observability';
import { PrismaService } from '../../shared/prisma/prisma.service.js';

export interface RecordAuditLogInput {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
}

function normalizeInetAddress(ipAddress: string | null | undefined): string | null {
  if (!ipAddress) {
    return null;
  }
  const trimmed = ipAddress.trim();
  const normalized = trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
  return isIP(normalized) !== 0 ? normalized : null;
}

function toScrubbedJson(
  state: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (!state) {
    return undefined;
  }
  const scrubbed = scrubSensitiveMetadata(state);
  return JSON.parse(JSON.stringify(scrubbed)) as Prisma.InputJsonValue;
}

@Injectable()
export class AuditLogService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(input: RecordAuditLogInput, tx?: PrismaTransactionClient): Promise<void> {
    const db = tx ?? this.prisma.client;
    const requestId = input.requestId ?? getRequestId() ?? null;
    const beforeState = toScrubbedJson(input.beforeState);
    const afterState = toScrubbedJson(input.afterState);

    await db.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        requestId,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId ?? 'none',
        ...(beforeState !== undefined ? { beforeState } : {}),
        ...(afterState !== undefined ? { afterState } : {}),
        ipAddress: normalizeInetAddress(input.ipAddress),
      },
    });
  }
}
