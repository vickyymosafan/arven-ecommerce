import { Global, Module } from '@nestjs/common';
import type { RuntimeConfig } from '@arven/config';
import { RUNTIME_CONFIG } from '../config/config.module.js';
import { createEmailProvider, EMAIL_PROVIDER, type EmailProvider } from './email.provider.js';
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
  ],
  exports: [EMAIL_PROVIDER, STORAGE_PROVIDER],
})
export class AdaptersModule {}
