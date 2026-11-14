import { Global, Module, type DynamicModule } from '@nestjs/common';
import { loadRuntimeConfig, type RuntimeConfig } from '@arven/config';

export const WORKER_CONFIG = Symbol('ARVEN_WORKER_CONFIG');

@Global()
@Module({})
export class WorkerConfigModule {
  static forRoot(override?: RuntimeConfig): DynamicModule {
    return {
      module: WorkerConfigModule,
      global: true,
      providers: [
        {
          provide: WORKER_CONFIG,
          useFactory: (): RuntimeConfig => override ?? loadRuntimeConfig(),
        },
      ],
      exports: [WORKER_CONFIG],
    };
  }
}
