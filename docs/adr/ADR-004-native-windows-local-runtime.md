# ADR-004: Native Windows Local Runtime Without Docker

- **Status:** Accepted (Phase 02 Execution Amendment)
- **Date:** 2026-11-14
- **Related ADRs:** [ADR-001](./ADR-001-tech-stack-and-version-pins.md), [ADR-002](./ADR-002-session-proxy-and-same-site-auth.md), [ADR-003](./ADR-003-atomic-inventory-outbox-and-payment-idempotency.md)

---

## 1. Context

Phase 01 planned local development infrastructure (`PostgreSQL 18`, `Redis 8`, `MinIO`, `Mailpit`) around Docker Compose. On the target Windows development workstation, Docker is intentionally not used (`don't using docker`), while native local database and broker services are installed and running directly on Windows:

- **PostgreSQL 18.1:** Windows service `postgresql-x64-18` running on `127.0.0.1:5432` (`C:\Program Files\PostgreSQL\18\bin`).
- **Redis-Compatible Broker (Memurai):** Windows service `Memurai` (`Memurai Developer 4.2.2`, `redis_version: 7.4.7`, `maxmemory-policy: noeviction`) running on `127.0.0.1:6379`.
- **Node & pnpm:** `Node v22.15.1` + Corepack `pnpm@10.34.9`.

`Mailpit` (local SMTP) and `MinIO` (local S3-compatible object storage) are not present without Docker.

---

## 2. Decision

1. **Primary Data Stores (`PostgreSQL 18` & `Memurai`):**
   - Local development and integration tests connect directly to native `127.0.0.1:5432` (`PostgreSQL 18.1`) via `DATABASE_URL` and `127.0.0.1:6379` (`Memurai`) via `REDIS_URL`.
   - Memurai preserves `noeviction`, satisfying BullMQ 6 job durability and rate-limiting requirements.

2. **Explicit Dev-Only Local Adapters (`EMAIL_DRIVER` & `STORAGE_DRIVER`):**
   - Preserve clean Clean Architecture ports (`EmailProvider` and `ObjectStorageProvider`) with driver selection configured through `@arven/config`:
     - `EMAIL_DRIVER`: `'smtp' | 'local_capture'` (default `'local_capture'` in local development/test without Docker Mailpit; writes structured email payloads to `.local/emails/` without emitting raw verification/reset tokens to structured logs).
     - `STORAGE_DRIVER`: `'s3' | 'local_fs'` (default `'local_fs'` in local development/test without Docker MinIO; stores staging and public assets under `.local/storage/`).
   - **Fail-Closed Production Guardrail:** `@arven/config` `validateRuntimeConfig()` MUST throw a fatal startup error if `NODE_ENV === 'production'` while `EMAIL_DRIVER === 'local_capture'`, `STORAGE_DRIVER === 'local_fs'`, `PAYMENT_DRIVER === 'local_stub'`, `COOKIE_SECURE === false`, or `SEED_DEV_USERS === true`.

3. **CI & Staging/Production Parity:**
   - Staging and production continue to use managed PostgreSQL 18, Redis 8 (`AOF`), S3/R2 object storage, and transactional SMTP/API email providers (`EMAIL_DRIVER=smtp`, `STORAGE_DRIVER=s3`).
   - `.gitignore` excludes `.env`, `.env.local`, `.local/`, and generated Prisma output directories so local secrets and captured artifacts are never committed.

---

## 3. Consequences

- Developers run `apps/api`, `apps/worker`, `apps/storefront`, and `apps/admin` natively via `pnpm` + Turborepo against native PostgreSQL 18 and Memurai with zero Docker dependency.
- All downstream phases (03–09) gain deterministic local email and local storage testing paths that cannot accidentally ship to production due to startup config validation.
