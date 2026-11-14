import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { loadRuntimeConfig, validateRuntimeConfig, type RuntimeConfig } from '@arven/config';
import { AppModule } from '../app.module.js';
import { checkRouteAuthMetadata } from '../common/security/index.js';
import { configureApiApp } from '../main.js';

function resolveScriptConfig(): RuntimeConfig {
  try {
    return loadRuntimeConfig();
  } catch {
    return validateRuntimeConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://arven:offline@127.0.0.1:5432/arven_dev',
      REDIS_URL: 'redis://127.0.0.1:6379',
      SESSION_SECRET: 'offline-metadata-session-secret-0123456789abcdef',
      CSRF_SECRET: 'offline-metadata-csrf-secret-0123456789abcdef',
      MFA_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:3001',
    });
  }
}

async function run(): Promise<void> {
  const config = resolveScriptConfig();
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(config),
    { logger: false },
  );

  try {
    configureApiApp(app, config);
    await app.init();
    checkRouteAuthMetadata(app);
    process.stdout.write('Route auth metadata check passed with zero violations.\n');
  } finally {
    await app.close();
  }
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`Auth metadata check failed: ${message}\n`);
  process.exitCode = 1;
});
