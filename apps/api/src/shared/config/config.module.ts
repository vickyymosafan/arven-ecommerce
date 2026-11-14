import { Global, Module, type DynamicModule } from '@nestjs/common';
import { loadRuntimeConfig, type RuntimeConfig } from '@arven/config';

export const RUNTIME_CONFIG = Symbol('ARVEN_RUNTIME_CONFIG');

@Global()
@Module({})
export class ConfigModule {
  static forRoot(override?: RuntimeConfig): DynamicModule {
    return {
      module: ConfigModule,
      global: true,
      providers: [
        {
          provide: RUNTIME_CONFIG,
          useFactory: (): RuntimeConfig => override ?? loadRuntimeConfig(),
        },
      ],
      exports: [RUNTIME_CONFIG],
    };
  }
}
