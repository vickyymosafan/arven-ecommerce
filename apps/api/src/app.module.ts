import {
  Module,
  type DynamicModule,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import type { RuntimeConfig } from '@arven/config';
import { RequestContextMiddleware } from './common/http/index.js';
import { SecurityModule } from './common/security/index.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { AuditNotificationsModule } from './modules/audit-notifications/audit-notifications.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CartModule } from './modules/cart/cart.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { CheckoutModule } from './modules/checkout/checkout.module.js';
import { CmsModule } from './modules/cms/cms.module.js';
import { CouponsModule } from './modules/coupons/coupons.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { ReturnsModule } from './modules/returns/returns.module.js';
import { ShippingModule } from './modules/shipping/shipping.module.js';
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
        AnalyticsModule,
        AuthModule,
        CartModule,
        CatalogModule,
        CheckoutModule,
        CmsModule,
        CouponsModule,
        HealthModule,
        InventoryModule,
        OrdersModule,
        PaymentsModule,
        ReturnsModule,
        ShippingModule,
        UsersRolesModule,
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
