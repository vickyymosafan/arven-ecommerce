import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { RuntimeConfig } from '@arven/config';
import {
  createPrismaClientWithPool,
  withTransaction as executeWithTransaction,
  type PrismaClient,
  type PrismaTransactionClient,
} from '@arven/database';
import { RUNTIME_CONFIG } from '../config/config.module.js';

type PgPool = ReturnType<typeof createPrismaClientWithPool>['pool'];

@Injectable()
export class PrismaService implements OnModuleDestroy {
  public readonly client: PrismaClient;
  private readonly pool: PgPool;

  constructor(@Inject(RUNTIME_CONFIG) config: RuntimeConfig) {
    const bundle = createPrismaClientWithPool({
      connectionString: config.DATABASE_URL,
      maxPoolSize: config.DATABASE_POOL_MAX_API,
    });
    this.client = bundle.prisma;
    this.pool = bundle.pool;
  }

  async ping(): Promise<void> {
    await this.client.$queryRaw`SELECT 1`;
  }

  async withTransaction<T>(fn: (tx: PrismaTransactionClient) => Promise<T>): Promise<T> {
    return executeWithTransaction(this.client, fn);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
    if (!this.pool.ended && !this.pool.ending) {
      await this.pool.end().catch(() => undefined);
    }
  }
}
