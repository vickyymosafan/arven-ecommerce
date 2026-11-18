import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  HttpStatus,
  StandardSchemaValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { loadRuntimeConfig, type RuntimeConfig } from '@arven/config';
import { createLogger } from '@arven/observability';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { z } from 'zod';
import { AppModule } from './app.module.js';
import {
  DomainHttpException,
  EnvelopeInterceptor,
  GlobalExceptionFilter,
} from './common/http/index.js';
import { checkRouteAuthMetadata } from './common/security/index.js';

function formatIssueField(
  pathSegments: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined,
): string {
  if (!pathSegments || pathSegments.length === 0) {
    return 'request';
  }
  return pathSegments
    .map((segment) => {
      if (typeof segment === 'object' && segment !== null && 'key' in segment) {
        return String(segment.key);
      }
      return String(segment);
    })
    .join('.');
}

export function configureApiApp(
  app: NestExpressApplication,
  config: RuntimeConfig,
): NestExpressApplication {
  app.set('trust proxy', 1);
  app.enableShutdownHooks();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(cookieParser());

  app.enableCors({
    origin: config.CORS_ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-CSRF-Token',
      'X-Request-Id',
      'Idempotency-Key',
      'X-Arven-Portal',
      'X-Guest-Order-Token',
    ],
    exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed'],
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new StandardSchemaValidationPipe({
      transform: true,
      exceptionFactory: (issues) => {
        const details = issues.map((issue) => ({
          field: formatIssueField(issue.path),
          issue: issue.message,
        }));
        return new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Request validation failed',
          details,
        );
      },
    }),
  );

  const httpLogger = createLogger({
    service: '@arven/api:http',
    level: config.LOG_LEVEL,
    env: config.NODE_ENV,
  });
  app.useGlobalFilters(new GlobalExceptionFilter(httpLogger));
  app.useGlobalInterceptors(new EnvelopeInterceptor(app.get(Reflector)));

  return app;
}

export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  const documentConfig = new DocumentBuilder()
    .setTitle('ARVEN Commerce API')
    .setDescription('ARVEN Luxury Contemporary Fashion Platform REST API (v1)')
    .setVersion('0.1.0')
    .addCookieAuth('arven_sid', {
      type: 'apiKey',
      in: 'cookie',
      name: 'arven_sid',
    })
    .addCookieAuth('arven_admin_sid', {
      type: 'apiKey',
      in: 'cookie',
      name: 'arven_admin_sid',
    })
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'X-CSRF-Token',
      },
      'csrf',
    )
    .build();

  return SwaggerModule.createDocument(app, documentConfig, {
    standardSchemaConverter: (schema) => {
      if (schema instanceof z.ZodType) {
        return {
          schema: z.toJSONSchema(schema, {
            target: 'openapi-3.0',
            unrepresentable: 'any',
          }),
        };
      }
      return undefined;
    },
  });
}

export async function createApp(configOverride?: RuntimeConfig): Promise<{
  app: NestExpressApplication;
  config: RuntimeConfig;
}> {
  const config = configOverride ?? loadRuntimeConfig();
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(config),
    { bufferLogs: true },
  );
  configureApiApp(app, config);
  return { app, config };
}

async function bootstrap(): Promise<void> {
  const { app, config } = await createApp();
  const logger = createLogger({
    service: '@arven/api',
    level: config.LOG_LEVEL,
    env: config.NODE_ENV,
  });

  await app.init();
  checkRouteAuthMetadata(app);

  if (config.NODE_ENV === 'development') {
    const doc = buildSwaggerDocument(app);
    SwaggerModule.setup('api/docs', app, doc);
  }

  await app.listen(config.API_PORT, '0.0.0.0');
  logger.info(
    {
      port: config.API_PORT,
      env: config.NODE_ENV,
    },
    'ARVEN API server listening',
  );
}

const entryHref = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';
if (import.meta.url === entryHref) {
  void bootstrap().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Fatal API startup error';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
