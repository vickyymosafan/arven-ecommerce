import { Global, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { RuntimeConfig } from '@arven/config';
import { RUNTIME_CONFIG } from '../config/config.module.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { createEmailProvider, EMAIL_PROVIDER, type EmailProvider } from './email.provider.js';
import {
  createPaymentProvider,
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from './payment.provider.js';
import {
  createShippingProvider,
  SHIPPING_PROVIDER,
  type ShippingProvider,
} from './shipping.provider.js';
import {
  createStorageProvider,
  STORAGE_PROVIDER,
  type ObjectStorageProvider,
} from './storage.provider.js';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_PROVIDER,
      inject: [RUNTIME_CONFIG],
      useFactory: (config: RuntimeConfig): EmailProvider => createEmailProvider(config),
    },
    {
      provide: STORAGE_PROVIDER,
      inject: [RUNTIME_CONFIG],
      useFactory: (config: RuntimeConfig): ObjectStorageProvider => createStorageProvider(config),
    },
    {
      provide: SHIPPING_PROVIDER,
      inject: [RUNTIME_CONFIG],
      useFactory: (config: RuntimeConfig): ShippingProvider => createShippingProvider(config),
    },
    {
      provide: PAYMENT_PROVIDER,
      inject: [RUNTIME_CONFIG, REDIS_CLIENT],
      useFactory: (config: RuntimeConfig, redis: Redis): PaymentProvider =>
        createPaymentProvider(config, redis),
    },
  ],
  exports: [EMAIL_PROVIDER, STORAGE_PROVIDER, SHIPPING_PROVIDER, PAYMENT_PROVIDER],
})
export class AdaptersModule {}
