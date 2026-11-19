import { Controller, Get, HttpStatus, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { HealthLiveResponse, HealthReadyResponse } from '@arven/validators';
import type { Redis } from 'ioredis';
import { DomainHttpException } from '../../common/http/index.js';
import { Public } from '../../common/security/index.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../shared/redis/redis.module.js';

const READINESS_TIMEOUT_MS = 3000;

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Readiness probe timed out'));
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  @Get('live')
  @Public()
  getLive(): HealthLiveResponse {
    return {
      status: 'ok',
      service: '@arven/api',
      timestampUtc: new Date().toISOString(),
    };
  }

  @Get('ready')
  @Public()
  async getReady(): Promise<HealthReadyResponse> {
    const [pgResult, redisResult] = await Promise.allSettled([
      withTimeout(this.prisma.ping(), READINESS_TIMEOUT_MS),
      withTimeout(this.redis.ping(), READINESS_TIMEOUT_MS),
    ]);

    const postgresUp = pgResult.status === 'fulfilled';
    const redisUp = redisResult.status === 'fulfilled' && redisResult.value === 'PONG';

    if (!postgresUp || !redisUp) {
      throw new DomainHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'SERVICE_UNAVAILABLE',
        'Service dependencies are not ready',
      );
    }

    return {
      status: 'ready',
      checks: {
        postgres: 'up',
        redis: 'up',
      },
      timestampUtc: new Date().toISOString(),
    };
  }
}
