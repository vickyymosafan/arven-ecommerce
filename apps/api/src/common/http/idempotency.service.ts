import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { HTTP_HEADERS, IDEMPOTENCY_POLICY } from '@arven/config';
import {
  IdempotencyStatus,
  type Prisma,
  type PrismaTransactionClient,
} from '@arven/database';
import { idempotencyKeySchema } from '@arven/validators';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { DomainHttpException } from './domain-http.exception.js';

export interface IdempotencyResponseLike {
  statusCode?: number;
  setHeader(name: string, value: string): unknown;
  status?: (code: number) => unknown;
}

export interface IdempotencyExecuteParams<T> {
  idempotencyKey: string | undefined;
  actorScope: string;
  route: string;
  requestPayload: unknown;
  res: IdempotencyResponseLike;
  successStatus?: number;
  run: (tx: PrismaTransactionClient) => Promise<T>;
}

/**
 * Produces deterministic JSON with recursively sorted object keys so equivalent
 * payloads produce identical SHA-256 hashes regardless of property insertion order.
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  }
  if (typeof value === 'bigint') {
    return JSON.stringify(value.toString());
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    const items = value.map((item) =>
      item === undefined ? 'null' : canonicalJsonStringify(item),
    );
    return `[${items.join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const toJsonFn = record['toJSON'];
    if (typeof toJsonFn === 'function') {
      return canonicalJsonStringify((toJsonFn as () => unknown).call(value));
    }
    const keys = Object.keys(record).sort();
    const entries: string[] = [];
    for (const key of keys) {
      const prop = record[key];
      if (prop === undefined || typeof prop === 'function' || typeof prop === 'symbol') {
        continue;
      }
      entries.push(`${JSON.stringify(key)}:${canonicalJsonStringify(prop)}`);
    }
    return `{${entries.join(',')}}`;
  }
  return 'null';
}

export function sha256CanonicalPayload(payload: unknown): string {
  const canonical = canonicalJsonStringify(payload);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function isUniqueConstraintViolation(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;

  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth += 1) {
    if (visited.has(current)) {
      break;
    }
    visited.add(current);

    const record = current as Record<string, unknown>;
    if (
      record['code'] === 'P2002' ||
      record['code'] === '23505' ||
      record['originalCode'] === '23505'
    ) {
      return true;
    }

    const meta = record['meta'];
    if (meta && typeof meta === 'object') {
      const driverError = (meta as Record<string, unknown>)['driverAdapterError'];
      if (driverError && typeof driverError === 'object') {
        const driverRecord = driverError as Record<string, unknown>;
        if (
          driverRecord['code'] === '23505' ||
          driverRecord['originalCode'] === '23505'
        ) {
          return true;
        }
        const driverCause = driverRecord['cause'];
        if (driverCause && typeof driverCause === 'object') {
          const causeRecord = driverCause as Record<string, unknown>;
          if (
            causeRecord['code'] === '23505' ||
            causeRecord['originalCode'] === '23505'
          ) {
            return true;
          }
        }
      }
    }

    current = record['cause'];
  }

  return false;
}

@Injectable()
export class IdempotencyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute<T>(params: IdempotencyExecuteParams<T>): Promise<T> {
    const parsedKey = idempotencyKeySchema.safeParse(params.idempotencyKey);
    if (!parsedKey.success) {
      const issueMessage =
        parsedKey.error.issues[0]?.message ??
        'Valid Idempotency-Key header is required';
      throw new DomainHttpException(
        HttpStatus.BAD_REQUEST,
        'INVALID_IDEMPOTENCY_KEY',
        issueMessage,
        [{ field: HTTP_HEADERS.IDEMPOTENCY_KEY, issue: issueMessage }],
      );
    }

    const key = parsedKey.data;
    const successStatus = params.successStatus ?? HttpStatus.OK;
    const requestHash = sha256CanonicalPayload(params.requestPayload);
    const expiresAt = new Date(
      Date.now() + IDEMPOTENCY_POLICY.TTL_HOURS * 3_600_000,
    );

    let createdRecordId: string | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const created = await this.prisma.client.idempotencyRecord.create({
          data: {
            idempotencyKey: key,
            actorScope: params.actorScope,
            route: params.route,
            requestHash,
            status: IdempotencyStatus.IN_PROGRESS,
            expiresAt,
          },
          select: { id: true },
        });
        createdRecordId = created.id;
        break;
      } catch (error) {
        if (!isUniqueConstraintViolation(error)) {
          throw error;
        }

        const existing = await this.prisma.client.idempotencyRecord.findUnique({
          where: {
            idempotencyKey_actorScope_route: {
              idempotencyKey: key,
              actorScope: params.actorScope,
              route: params.route,
            },
          },
        });

        if (!existing) {
          if (attempt === 0) {
            continue;
          }
          params.res.setHeader(
            'Retry-After',
            String(IDEMPOTENCY_POLICY.IN_PROGRESS_RETRY_AFTER_SECONDS),
          );
          throw new DomainHttpException(
            HttpStatus.CONFLICT,
            'IDEMPOTENCY_IN_PROGRESS',
            'Request with this Idempotency-Key is currently in progress',
          );
        }

        if (existing.expiresAt.getTime() <= Date.now()) {
          await this.prisma.client.idempotencyRecord.deleteMany({
            where: {
              id: existing.id,
              expiresAt: { lte: new Date() },
            },
          });
          if (attempt === 0) {
            continue;
          }
        }

        if (existing.requestHash !== requestHash) {
          throw new DomainHttpException(
            HttpStatus.CONFLICT,
            'IDEMPOTENCY_CONFLICT',
            'Idempotency-Key was already used with a different request payload',
          );
        }

        if (existing.status === IdempotencyStatus.IN_PROGRESS) {
          params.res.setHeader(
            'Retry-After',
            String(IDEMPOTENCY_POLICY.IN_PROGRESS_RETRY_AFTER_SECONDS),
          );
          throw new DomainHttpException(
            HttpStatus.CONFLICT,
            'IDEMPOTENCY_IN_PROGRESS',
            'Request with this Idempotency-Key is currently in progress',
          );
        }

        if (existing.status === IdempotencyStatus.FAILED) {
          await this.prisma.client.idempotencyRecord.deleteMany({
            where: {
              id: existing.id,
              status: IdempotencyStatus.FAILED,
            },
          });
          if (attempt === 0) {
            continue;
          }
          params.res.setHeader(
            'Retry-After',
            String(IDEMPOTENCY_POLICY.IN_PROGRESS_RETRY_AFTER_SECONDS),
          );
          throw new DomainHttpException(
            HttpStatus.CONFLICT,
            'IDEMPOTENCY_IN_PROGRESS',
            'Request with this Idempotency-Key is currently in progress',
          );
        }

        params.res.setHeader(HTTP_HEADERS.IDEMPOTENT_REPLAYED, 'true');
        const replayStatus = existing.responseStatus ?? successStatus;
        if (typeof params.res.status === 'function') {
          params.res.status(replayStatus);
        } else {
          params.res.statusCode = replayStatus;
        }
        return existing.responseBody as T;
      }
    }

    if (!createdRecordId) {
      params.res.setHeader(
        'Retry-After',
        String(IDEMPOTENCY_POLICY.IN_PROGRESS_RETRY_AFTER_SECONDS),
      );
      throw new DomainHttpException(
        HttpStatus.CONFLICT,
        'IDEMPOTENCY_IN_PROGRESS',
        'Request with this Idempotency-Key is currently in progress',
      );
    }

    try {
      return await this.prisma.withTransaction(async (tx) => {
        const data = await params.run(tx);
        const serializedBody = JSON.parse(
          JSON.stringify(data ?? null),
        ) as Prisma.InputJsonValue;

        await tx.idempotencyRecord.update({
          where: { id: createdRecordId },
          data: {
            status: IdempotencyStatus.COMPLETED,
            responseStatus: successStatus,
            responseBody: serializedBody,
          },
        });

        return data;
      });
    } catch (error) {
      await this.prisma.client.idempotencyRecord
        .deleteMany({
          where: {
            id: createdRecordId,
            idempotencyKey: key,
            actorScope: params.actorScope,
            route: params.route,
            status: IdempotencyStatus.IN_PROGRESS,
          },
        })
        .catch(() => undefined);
      throw error;
    }
  }
}
