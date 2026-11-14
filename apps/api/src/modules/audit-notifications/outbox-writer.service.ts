import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaTransactionClient } from '@arven/database';
import { PrismaService } from '../../shared/prisma/prisma.service.js';

export interface EnqueueOutboxInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  schemaVersion?: number;
}

@Injectable()
export class OutboxWriterService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async enqueue(input: EnqueueOutboxInput, tx?: PrismaTransactionClient): Promise<string> {
    const db = tx ?? this.prisma.client;
    const serializedPayload = JSON.parse(
      JSON.stringify(input.payload),
    ) as Prisma.InputJsonValue;

    const created = await db.outboxEvent.create({
      data: {
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        schemaVersion: input.schemaVersion ?? 1,
        payload: serializedPayload,
      },
      select: {
        id: true,
      },
    });

    return created.id;
  }
}
