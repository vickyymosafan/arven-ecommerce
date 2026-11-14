import {
  Module,
  type DynamicModule,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import type { RuntimeConfig } from '@arven/config';
import { RequestContextMiddleware } from './common/http/index.js';
import { SecurityModule } from './common/security/index.js';
import { AuditNotificationsModule } from './modules/audit-notifications/audit-notifications.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { UsersRolesModule } from './modules/users-roles/users-roles.module.js';
import { AdaptersModule } from './shared/adapters/adapters.module.js';
import { ConfigModule } from './shared/config/config.module.js';
import { PrismaModule } from './shared/prisma/prisma.module.js';
import { RedisModule } from './shared/redis/redis.module.js';

@Module({})
export class AppModule implements NestModule {
  static forRoot(configOverride?: RuntimeConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(configOverride),
        PrismaModule,
        RedisModule,
        AdaptersModule,
        AuditNotificationsModule,
        SecurityModule,
        AuthModule,
        HealthModule,
        UsersRolesModule,
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
