import { Inject, Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../shared/redis/redis.module.js';

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

const INCREMENT_LUA_SCRIPT = `
local hitKey = KEYS[1]
local blockKey = KEYS[2]
local ttlMs = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDurationMs = tonumber(ARGV[3])

local blockPttl = redis.call('PTTL', blockKey)
if blockPttl > 0 then
  local hitPttl = redis.call('PTTL', hitKey)
  if hitPttl < 0 then
    hitPttl = ttlMs
  end
  return { limit + 1, math.ceil(hitPttl / 1000), 1, math.ceil(blockPttl / 1000) }
end

local hits = redis.call('INCR', hitKey)
if hits == 1 then
  redis.call('PEXPIRE', hitKey, ttlMs)
end

local hitPttl = redis.call('PTTL', hitKey)
if hitPttl < 0 then
  redis.call('PEXPIRE', hitKey, ttlMs)
  hitPttl = ttlMs
end

if hits > limit then
  local effectiveBlockMs = blockDurationMs
  if effectiveBlockMs <= 0 then
    effectiveBlockMs = hitPttl
  end
  redis.call('SET', blockKey, '1', 'PX', effectiveBlockMs)
  return { hits, math.ceil(hitPttl / 1000), 1, math.ceil(effectiveBlockMs / 1000) }
end

return { hits, math.ceil(hitPttl / 1000), 0, 0 }
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const safeTtlMs = Math.max(1000, Math.floor(ttl));
    const safeBlockDurationMs = Math.max(0, Math.floor(blockDuration));
    const hitKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle:block:${throttlerName}:${key}`;

    const rawResult = (await this.redis.eval(
      INCREMENT_LUA_SCRIPT,
      2,
      hitKey,
      blockKey,
      String(safeTtlMs),
      String(limit),
      String(safeBlockDurationMs),
    )) as [number, number, number, number];

    const totalHits = Number(rawResult[0] ?? 1);
    const timeToExpire = Math.max(1, Number(rawResult[1] ?? Math.ceil(safeTtlMs / 1000)));
    const isBlocked = Number(rawResult[2] ?? 0) === 1;
    const timeToBlockExpire = Number(rawResult[3] ?? 0);

    return {
      totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire,
    };
  }
}
