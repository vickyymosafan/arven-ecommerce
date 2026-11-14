import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import type { RuntimeConfig } from '@arven/config';
import { createLogger } from '@arven/observability';
import { Redis, type RedisOptions } from 'ioredis';
import { RUNTIME_CONFIG } from '../config/config.module.js';

export const REDIS_CLIENT = Symbol('ARVEN_REDIS_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [RUNTIME_CONFIG],
      useFactory: (config: RuntimeConfig): Redis => {
        const logger = createLogger({
          service: '@arven/api:redis',
          level: config.LOG_LEVEL,
          env: config.NODE_ENV,
        });
        const options: RedisOptions = {
          maxRetriesPerRequest: 2,
          lazyConnect: true,
        };
        const client = new Redis(config.REDIS_URL, options);
        client.on('error', (error: Error) => {
          logger.error(
            {
              errorName: error.name,
              message: error.message,
            },
            'Redis client error',
          );
        });
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status === 'wait' || this.redis.status === 'end') {
      this.redis.disconnect();
      return;
    }
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
