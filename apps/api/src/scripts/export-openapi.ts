import 'reflect-metadata';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { PARAMTYPES_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';
import { DiscoveryService, MetadataScanner, NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { loadRuntimeConfig, validateRuntimeConfig, type RuntimeConfig } from '@arven/config';
import { AppModule } from '../app.module.js';
import { buildSwaggerDocument, configureApiApp } from '../main.js';

function resolveScriptConfig(): RuntimeConfig {
  try {
    return loadRuntimeConfig();
  } catch {
    return validateRuntimeConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://arven:offline@127.0.0.1:5432/arven_dev',
      REDIS_URL: 'redis://127.0.0.1:6379',
      SESSION_SECRET: 'offline-openapi-session-secret-0123456789abcdef',
      CSRF_SECRET: 'offline-openapi-csrf-secret-0123456789abcdef',
      MFA_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:3001',
    });
  }
}

/**
 * Populates fallback `design:paramtypes` metadata when executed under `tsx` (esbuild),
 * which strips TypeScript `emitDecoratorMetadata`, so Swagger can inspect Zod schemas on parameters.
 */
function ensureControllerParamTypesForTsx(app: INestApplication): void {
  const discoveryService = app.get(DiscoveryService);
  const metadataScanner = app.get(MetadataScanner);

  for (const wrapper of discoveryService.getControllers()) {
    const instance = wrapper.instance as object | undefined;
    const metatype = wrapper.metatype;
    if (!instance || !metatype) {
      continue;
    }

    const prototype = Object.getPrototypeOf(instance) as object;
    const methodNames = metadataScanner.getAllMethodNames(prototype);

    for (const methodName of methodNames) {
      const existing = Reflect.getMetadata(
        PARAMTYPES_METADATA,
        prototype,
        methodName,
      ) as unknown[] | undefined;
      if (existing && existing.length > 0) {
        continue;
      }

      const routeArgs = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        metatype,
        methodName,
      ) as Record<string, { index: number }> | undefined;
      if (!routeArgs) {
        continue;
      }

      const entries = Object.entries(routeArgs);
      if (entries.length === 0) {
        continue;
      }

      const maxIndex = Math.max(...entries.map(([, meta]) => meta.index));
      const inferred: unknown[] = Array.from({ length: maxIndex + 1 }, () => Object);

      for (const [key, meta] of entries) {
        const paramTypeNum = Number(key.split(':')[0]);
        if (paramTypeNum === RouteParamtypes.PARAM) {
          inferred[meta.index] = String;
        }
      }

      Reflect.defineMetadata(PARAMTYPES_METADATA, inferred, prototype, methodName);
    }
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
    ensureControllerParamTypesForTsx(app);
    const document = buildSwaggerDocument(app);

    const outputPath = path.resolve(
      import.meta.dirname,
      '../../../../packages/contracts/openapi/arven.openapi.json',
    );
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    process.stdout.write(`Exported OpenAPI schema to ${outputPath}\n`);
  } finally {
    await app.close();
  }
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`OpenAPI export failed: ${message}\n`);
  process.exitCode = 1;
});
