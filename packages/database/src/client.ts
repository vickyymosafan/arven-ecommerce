import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { Prisma, PrismaClient } from './generated/prisma/client.js';

export * from './generated/prisma/client.js';

export type PrismaTransactionClient = Prisma.TransactionClient;

export interface CreatePrismaPoolOptions {
  readonly connectionString: string;
  readonly maxPoolSize?: number;
  readonly idleTimeoutMillis?: number;
  readonly connectionTimeoutMillis?: number;
  readonly statementTimeoutMs?: number;
}

export interface CreatePrismaClientOptions extends CreatePrismaPoolOptions {
  readonly log?: ReadonlyArray<Prisma.LogLevel | Prisma.LogDefinition>;
  readonly onPoolError?: (error: Error) => void;
  readonly onConnectionError?: (error: Error) => void;
}

export interface TransactionOptions {
  readonly maxWait?: number;
  readonly timeout?: number;
  readonly isolationLevel?: Prisma.TransactionIsolationLevel;
}

const DEFAULT_POOL_MAX = 10;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 5_000;
const DEFAULT_STATEMENT_TIMEOUT_MS = 10_000;

export function createPrismaPool(
  connectionString: string,
  maxPoolSize = DEFAULT_POOL_MAX,
  overrides: Omit<CreatePrismaPoolOptions, 'connectionString' | 'maxPoolSize'> = {},
): Pool {
  const normalizedUrl = connectionString.trim();
  if (!normalizedUrl) {
    throw new Error('connectionString is required to initialize PostgreSQL pool');
  }
  if (!Number.isInteger(maxPoolSize) || maxPoolSize < 1) {
    throw new Error(`maxPoolSize must be a positive integer, received ${String(maxPoolSize)}`);
  }

  return new Pool({
    connectionString: normalizedUrl,
    max: maxPoolSize,
    idleTimeoutMillis: overrides.idleTimeoutMillis ?? DEFAULT_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: overrides.connectionTimeoutMillis ?? DEFAULT_CONNECTION_TIMEOUT_MS,
    statement_timeout: overrides.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS,
  });
}

export function createPrismaClientWithPool(options: CreatePrismaClientOptions): {
  readonly prisma: PrismaClient;
  readonly pool: Pool;
} {
  const pool = createPrismaPool(options.connectionString, options.maxPoolSize ?? DEFAULT_POOL_MAX, {
    ...(options.idleTimeoutMillis !== undefined
      ? { idleTimeoutMillis: options.idleTimeoutMillis }
      : {}),
    ...(options.connectionTimeoutMillis !== undefined
      ? { connectionTimeoutMillis: options.connectionTimeoutMillis }
      : {}),
    ...(options.statementTimeoutMs !== undefined
      ? { statementTimeoutMs: options.statementTimeoutMs }
      : {}),
  });

  const adapter = new PrismaPg(pool, {
    disposeExternalPool: true,
    ...(options.onPoolError ? { onPoolError: options.onPoolError } : {}),
    ...(options.onConnectionError ? { onConnectionError: options.onConnectionError } : {}),
  });

  const prisma = new PrismaClient({
    adapter,
    ...(options.log ? { log: [...options.log] } : {}),
  });

  return { prisma, pool };
}

export function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  return createPrismaClientWithPool(options).prisma;
}

export async function withTransaction<T>(
  prisma: PrismaClient,
  fn: (tx: PrismaTransactionClient) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  return prisma.$transaction((tx) => fn(tx), {
    maxWait: options.maxWait ?? 5_000,
    timeout: options.timeout ?? 15_000,
    ...(options.isolationLevel ? { isolationLevel: options.isolationLevel } : {}),
  });
}
