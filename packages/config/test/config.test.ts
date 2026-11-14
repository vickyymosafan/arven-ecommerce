import { describe, expect, it } from 'vitest';
import {
  BULLMQ_QUEUES,
  DOMAIN_EVENTS,
  PERMISSION_CODES,
  ROLE_CODES,
  ROLE_PERMISSION_MATRIX,
  validatePublicFrontendConfig,
  validateRuntimeConfig,
} from '../src/index.js';

const validDevEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://postgres:secret@127.0.0.1:5432/arven_dev?schema=public',
  REDIS_URL: 'redis://127.0.0.1:6379',
  SESSION_SECRET: 'a'.repeat(32),
  CSRF_SECRET: 'b'.repeat(32),
  MFA_ENCRYPTION_KEY: '1'.repeat(64),
  EMAIL_DRIVER: 'local_capture',
  STORAGE_DRIVER: 'local_fs',
  PAYMENT_DRIVER: 'local_stub',
};

const validProdEnv = {
  NODE_ENV: 'production',
  APP_URL: 'https://arven.id',
  ADMIN_URL: 'https://admin.arven.id',
  API_URL: 'https://api.arven.id',
  CORS_ALLOWED_ORIGINS: 'https://arven.id,https://admin.arven.id',
  DATABASE_URL: 'postgresql://arven_api:strong_pw@db.internal:5432/arven_prod',
  REDIS_URL: 'rediss://redis.internal:6379',
  SESSION_SECRET: 'prod_session_secret_9a8f7c6b5e4d3a2f1e0d9c8b7a6f5e4d',
  CSRF_SECRET: 'prod_csrf_secret_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
  MFA_ENCRYPTION_KEY: 'f'.repeat(64),
  COOKIE_SECURE: 'true',
  STOREFRONT_SESSION_COOKIE: '__Host-arven_sid',
  ADMIN_SESSION_COOKIE: '__Host-arven_admin_sid',
  EMAIL_DRIVER: 'smtp',
  SMTP_HOST: 'smtp.postmarkapp.com',
  STORAGE_DRIVER: 's3',
  S3_BUCKET_STAGING: 'arven-staging',
  S3_BUCKET_PUBLIC: 'arven-public',
  S3_ACCESS_KEY_ID: 'key_id',
  S3_SECRET_ACCESS_KEY: 'secret_key',
  PUBLIC_ASSET_BASE_URL: 'https://cdn.arven.id',
  PAYMENT_DRIVER: 'midtrans',
  SEED_DEV_USERS: 'false',
};

describe('@arven/config constants', () => {
  it('registers all 8 roles, 36 permission codes, 8 BullMQ queues, and 17 domain events', () => {
    expect(ROLE_CODES).toHaveLength(8);
    expect(PERMISSION_CODES).toHaveLength(36);
    expect(BULLMQ_QUEUES).toHaveLength(8);
    expect(DOMAIN_EVENTS).toHaveLength(17);
    expect(ROLE_PERMISSION_MATRIX.CUSTOMER).toEqual([]);
    expect(ROLE_PERMISSION_MATRIX.OWNER).toHaveLength(36);
    expect(ROLE_PERMISSION_MATRIX.MANAGER).not.toContain('refund.approve');
    expect(ROLE_PERMISSION_MATRIX.MANAGER).not.toContain('user.role.manage');
    expect(ROLE_PERMISSION_MATRIX.MANAGER).not.toContain('settings.provider.manage');
  });
});

describe('@arven/config env validation', () => {
  it('accepts valid non-Docker development runtime config', () => {
    const cfg = validateRuntimeConfig(validDevEnv);
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.EMAIL_DRIVER).toBe('local_capture');
    expect(cfg.STORAGE_DRIVER).toBe('local_fs');
    expect(cfg.CORS_ALLOWED_ORIGINS).toEqual(['http://localhost:3000', 'http://localhost:3001']);
  });

  it('accepts hardened production config', () => {
    const cfg = validateRuntimeConfig(validProdEnv);
    expect(cfg.NODE_ENV).toBe('production');
    expect(cfg.COOKIE_SECURE).toBe(true);
    expect(cfg.STOREFRONT_SESSION_COOKIE).toBe('__Host-arven_sid');
  });

  it('rejects wildcard CORS origins', () => {
    expect(() =>
      validateRuntimeConfig({ ...validDevEnv, CORS_ALLOWED_ORIGINS: '*' }),
    ).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  it('blocks dev-only local adapters and insecure cookies in production', () => {
    expect(() =>
      validateRuntimeConfig({ ...validProdEnv, EMAIL_DRIVER: 'local_capture' }),
    ).toThrow(/EMAIL_DRIVER=local_capture/);

    expect(() =>
      validateRuntimeConfig({ ...validProdEnv, STORAGE_DRIVER: 'local_fs' }),
    ).toThrow(/STORAGE_DRIVER=local_fs/);

    expect(() =>
      validateRuntimeConfig({ ...validProdEnv, PAYMENT_DRIVER: 'local_stub' }),
    ).toThrow(/PAYMENT_DRIVER=local_stub/);

    expect(() =>
      validateRuntimeConfig({ ...validProdEnv, COOKIE_SECURE: 'false' }),
    ).toThrow(/COOKIE_SECURE/);

    expect(() =>
      validateRuntimeConfig({ ...validProdEnv, SEED_DEV_USERS: 'true' }),
    ).toThrow(/SEED_DEV_USERS/);

    expect(() =>
      validateRuntimeConfig({ ...validProdEnv, ADMIN_SESSION_COOKIE: 'arven_admin_sid' }),
    ).toThrow(/__Host-/);
  });

  it('validates public frontend config without server DB credentials', () => {
    const fe = validatePublicFrontendConfig({
      NODE_ENV: 'development',
      APP_URL: 'http://localhost:3000',
    });
    expect(fe.API_URL).toBe('http://localhost:4000');
  });
});
