import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../shared/redis/redis.module.js';
import { ArvenThrottlerGuard } from './guards/arven-throttler.guard.js';
import { CsrfGuard } from './guards/csrf.guard.js';
import { MfaEnforcementGuard } from './guards/mfa-enforcement.guard.js';
import { PermissionGuard } from './guards/permission.guard.js';
import { SessionAuthGuard } from './guards/session-auth.guard.js';
import { AuditActionInterceptor } from './interceptors/audit-action.interceptor.js';
import { PasswordHasherService } from './password-hasher.service.js';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';
import { SessionStoreService } from './session-store.service.js';
import { TokenCryptoService } from './token-crypto.service.js';

@Global()
@Module({
  imports: [
    DiscoveryModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: 100,
          },
        ],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
  ],
  providers: [
    PasswordHasherService,
    TokenCryptoService,
    SessionStoreService,
    RedisThrottlerStorage,
    ArvenThrottlerGuard,
    CsrfGuard,
    SessionAuthGuard,
    MfaEnforcementGuard,
    PermissionGuard,
    AuditActionInterceptor,
    {
      provide: APP_GUARD,
      useClass: ArvenThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: MfaEnforcementGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditActionInterceptor,
    },
  ],
  exports: [
    PasswordHasherService,
    TokenCryptoService,
    SessionStoreService,
    RedisThrottlerStorage,
    ArvenThrottlerGuard,
    CsrfGuard,
    SessionAuthGuard,
    MfaEnforcementGuard,
    PermissionGuard,
    AuditActionInterceptor,
    ThrottlerModule,
  ],
})
export class SecurityModule {}
