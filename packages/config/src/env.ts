import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const booleanStringSchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

function isValidUrlOrigin(value: string): boolean {
  if (value === '*' || value.includes('*')) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.origin === value && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
  } catch {
    return false;
  }
}

const originListSchema = z
  .string()
  .min(1)
  .transform((raw) =>
    raw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  )
  .refine((origins) => origins.length > 0 && origins.every(isValidUrlOrigin), {
    message: 'CORS_ALLOWED_ORIGINS must be a comma-separated list of explicit http/https origins without wildcards',
  });

export const publicFrontendEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url().default('http://localhost:3000'),
  ADMIN_URL: z.url().default('http://localhost:3001'),
  API_URL: z.url().default('http://localhost:4000'),
  PUBLIC_ASSET_BASE_URL: z.url().default('http://localhost:4000/local-assets'),
});

export type PublicFrontendConfig = Readonly<z.infer<typeof publicFrontendEnvSchema>>;

export const runtimeEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    APP_URL: z.url().default('http://localhost:3000'),
    ADMIN_URL: z.url().default('http://localhost:3001'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    API_URL: z.url().default('http://localhost:4000'),
    CORS_ALLOWED_ORIGINS: originListSchema.default(['http://localhost:3000', 'http://localhost:3001']),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_POOL_MAX_API: z.coerce.number().int().min(1).max(100).default(10),
    DATABASE_POOL_MAX_WORKER: z.coerce.number().int().min(1).max(100).default(10),

    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    CSRF_SECRET: z.string().min(32, 'CSRF_SECRET must be at least 32 characters'),
    MFA_ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, 'MFA_ENCRYPTION_KEY must be a 64-char hex encoded 32-byte key'),

    COOKIE_SECURE: booleanStringSchema.default(false),
    STOREFRONT_SESSION_COOKIE: z.string().min(3).default('arven_sid'),
    ADMIN_SESSION_COOKIE: z.string().min(3).default('arven_admin_sid'),

    EMAIL_DRIVER: z.enum(['local_capture', 'smtp']).default('local_capture'),
    EMAIL_LOCAL_DIR: z.string().min(1).default('.local/emails'),
    EMAIL_FROM: z.string().min(3).default('ARVEN Atelier <no-reply@arven.id>'),
    SMTP_HOST: z.string().optional().default('127.0.0.1'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_SECURE: booleanStringSchema.default(false),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASS: z.string().optional().default(''),

    STORAGE_DRIVER: z.enum(['local_fs', 's3']).default('local_fs'),
    STORAGE_LOCAL_DIR: z.string().min(1).default('.local/storage'),
    S3_ENDPOINT: z.string().optional().default(''),
    S3_REGION: z.string().default('ap-southeast-1'),
    S3_BUCKET_STAGING: z.string().optional().default(''),
    S3_BUCKET_PUBLIC: z.string().optional().default(''),
    S3_ACCESS_KEY_ID: z.string().optional().default(''),
    S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
    PUBLIC_ASSET_BASE_URL: z.url().default('http://localhost:4000/local-assets'),

    PAYMENT_DRIVER: z.enum(['local_stub', 'midtrans']).default('local_stub'),
    SEED_DEV_USERS: booleanStringSchema.default(false),
  })
  .superRefine((cfg, ctx) => {
    // Enforce fail-closed production safety invariants across adapters, cookies, and placeholder secrets.
    if (cfg.NODE_ENV === 'production') {
      if (cfg.EMAIL_DRIVER === 'local_capture') {
        ctx.addIssue({
          code: 'custom',
          path: ['EMAIL_DRIVER'],
          message: 'EMAIL_DRIVER=local_capture is strictly forbidden in production',
        });
      }
      if (cfg.STORAGE_DRIVER === 'local_fs') {
        ctx.addIssue({
          code: 'custom',
          path: ['STORAGE_DRIVER'],
          message: 'STORAGE_DRIVER=local_fs is strictly forbidden in production',
        });
      }
      if (cfg.PAYMENT_DRIVER === 'local_stub') {
        ctx.addIssue({
          code: 'custom',
          path: ['PAYMENT_DRIVER'],
          message: 'PAYMENT_DRIVER=local_stub is strictly forbidden in production',
        });
      }
      if (!cfg.COOKIE_SECURE) {
        ctx.addIssue({
          code: 'custom',
          path: ['COOKIE_SECURE'],
          message: 'COOKIE_SECURE must be true in production',
        });
      }
      if (cfg.SEED_DEV_USERS) {
        ctx.addIssue({
          code: 'custom',
          path: ['SEED_DEV_USERS'],
          message: 'SEED_DEV_USERS must be false in production',
        });
      }
      if (!cfg.STOREFRONT_SESSION_COOKIE.startsWith('__Host-')) {
        ctx.addIssue({
          code: 'custom',
          path: ['STOREFRONT_SESSION_COOKIE'],
          message: 'STOREFRONT_SESSION_COOKIE must use __Host- prefix in production',
        });
      }
      if (!cfg.ADMIN_SESSION_COOKIE.startsWith('__Host-')) {
        ctx.addIssue({
          code: 'custom',
          path: ['ADMIN_SESSION_COOKIE'],
          message: 'ADMIN_SESSION_COOKIE must use __Host- prefix in production',
        });
      }
      if (
        !cfg.APP_URL.startsWith('https://') ||
        !cfg.ADMIN_URL.startsWith('https://') ||
        !cfg.API_URL.startsWith('https://')
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['APP_URL'],
          message: 'APP_URL, ADMIN_URL, and API_URL must use https:// in production',
        });
      }
      if (
        cfg.SESSION_SECRET.includes('dev-only') ||
        cfg.CSRF_SECRET.includes('dev-only') ||
        /^0+$/.test(cfg.MFA_ENCRYPTION_KEY)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['SESSION_SECRET'],
          message: 'Default placeholder cryptographic secrets are forbidden in production',
        });
      }
      if (cfg.STORAGE_DRIVER === 's3') {
        if (!cfg.S3_BUCKET_STAGING || !cfg.S3_BUCKET_PUBLIC || !cfg.S3_ACCESS_KEY_ID || !cfg.S3_SECRET_ACCESS_KEY) {
          ctx.addIssue({
            code: 'custom',
            path: ['S3_BUCKET_PUBLIC'],
            message: 'S3_BUCKET_STAGING, S3_BUCKET_PUBLIC, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY are required when STORAGE_DRIVER=s3 in production',
          });
        }
      }
    }

    if (cfg.EMAIL_DRIVER === 'smtp' && !cfg.SMTP_HOST) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when EMAIL_DRIVER=smtp',
      });
    }
  });

export type RuntimeConfig = Readonly<z.infer<typeof runtimeEnvSchema>>;

/**
 * Validates server runtime configuration purely from a provided environment dictionary.
 */
export function validateRuntimeConfig(rawEnv: Record<string, string | undefined>): RuntimeConfig {
  const normalizedInput: Record<string, string | undefined> = { ...rawEnv };
  // Allow omitted CORS_ALLOWED_ORIGINS in Zod default without overriding valid strings.
  if (normalizedInput.CORS_ALLOWED_ORIGINS === undefined) {
    delete normalizedInput.CORS_ALLOWED_ORIGINS;
  }
  const result = runtimeEnvSchema.safeParse(normalizedInput);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid ARVEN runtime configuration: ${formatted}`);
  }
  return Object.freeze(result.data);
}

/**
 * Validates public frontend runtime environment variables without requiring DB/secret server vars.
 */
export function validatePublicFrontendConfig(
  rawEnv: Record<string, string | undefined>,
): PublicFrontendConfig {
  const result = publicFrontendEnvSchema.safeParse(rawEnv);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid ARVEN frontend configuration: ${formatted}`);
  }
  return Object.freeze(result.data);
}

/**
 * Finds the workspace root `.env` file walking upward from `startDir` (up to 5 levels).
 */
export function findWorkspaceEnvFile(startDir: string = process.cwd()): string | undefined {
  let current = resolve(startDir);
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = resolve(current, '.env');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return undefined;
}

/**
 * Loads workspace `.env` (if present and not skipped) and validates the full server runtime configuration.
 */
export function loadRuntimeConfig(options?: { envFilePath?: string; skipDotenv?: boolean }): RuntimeConfig {
  if (!options?.skipDotenv) {
    const envPath = options?.envFilePath ?? findWorkspaceEnvFile();
    if (envPath && existsSync(envPath)) {
      loadDotenv({ path: envPath, quiet: true });
    }
  }
  return validateRuntimeConfig(process.env);
}
