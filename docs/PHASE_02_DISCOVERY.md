# ARVEN — Phase 02 Discovery & Non-Docker Environment Verification

> **Plan ID:** `34ede88d-3a68-4410-8a37-9d1fd18ee2f3`  
> **Task ID:** `1ae0deb8-cd95-43cb-b8a4-5a03c693d1b7` (`discovery-lead`)  
> **Date:** 2026-11-14  
> **Runtime Constraint:** User mandated **no Docker** for local execution.

---

## 1. Native Windows Host Runtime Audit (No Docker)

| Component | Verified Status on Host | Notes & Action |
|---|---|---|
| **Node.js** | `v22.15.1` (`C:\Program Files\nodejs\node.exe`) | Meets NestJS 12 (`>= 20`) and Next.js 16 requirements |
| **pnpm** | `10.34.9` active via Corepack (`%LOCALAPPDATA%\corepack`) | Enabled cleanly without admin rights; root `package.json` locks `"packageManager": "pnpm@10.34.9"` |
| **PostgreSQL 18** | Service `postgresql-x64-18` **Running** on `127.0.0.1:5432` (`psql (PostgreSQL) 18.1` in `C:\Program Files\PostgreSQL\18\bin`) | `pg_isready` returns `accepting connections`. Password auth enforced (`fe_sendauth: no password supplied`); requires local `DATABASE_URL` in `.env` before `prisma migrate dev` / `prisma db seed` |
| **Redis / BullMQ Broker** | Service `Memurai` **Running** on `127.0.0.1:6379` (`Memurai Developer 4.2.2`, `redis_version: 7.4.7`) | `PING` -> `PONG`; `maxmemory-policy` = `noeviction` (meets BullMQ durability/eviction requirement) |
| **Local Email & Object Storage (No Docker)** | No Docker Mailpit/MinIO containers | Phase 02 defines dev-only local adapters (`EMAIL_DRIVER=local_capture`, `STORAGE_DRIVER=local_fs`) strictly blocked on startup if `NODE_ENV === 'production'`, while preserving SMTP & S3/R2 driver paths |
| **Git** | `2.49.0.windows.1` | Workspace repo initialization (`git init`) and `.gitignore` included in Phase 02 foundation |

---

## 2. Context7-Verified Package Pins & Exact APIs

Checked against npm registry availability and Context7 official documentation:

| Package | Pinned Range (NPM Resolved) | Verified API / Config Detail |
|---|---|---|
| **Prisma 7** | `prisma@^7.10.1`, `@prisma/client@^7.10.1`, `@prisma/adapter-pg@^7.10.1`, `pg@^8.23.1` | `prisma.config.ts` imports `'dotenv/config'`, uses `defineConfig({ schema, migrations: { path, seed }, datasource: { url: env('DATABASE_URL') } })`. `schema.prisma` omits datasource `url`; uses `generator client { provider = "prisma-client", output = "../generated/prisma", runtime = "nodejs", moduleFormat = "esm", generatedFileExtension = "ts", importFileExtension = "ts" }` |
| **NestJS 12 ESM** | `@nestjs/core@^12.5.0`, `@nestjs/common@^12.5.0`, `@nestjs/platform-express@^12.5.0`, `@nestjs/swagger@^12.1.2` | Native ESM `"type": "module"`, `"module": "nodenext"`, `"moduleResolution": "nodenext"`, `.js` relative import specifiers, `StandardSchemaValidationPipe` globally registered, `@Body({ schema })` / `@Query({ schema })` / `@Param(..., { schema })`, native Zod 4 `~standard.jsonSchema` OpenAPI 3.0 conversion |
| **Queues & Throttling** | `@nestjs/bullmq@^12.0.2`, `bullmq@^6.7.6`, `ioredis@^6.0.0`, `@nestjs/throttler@^6.7.1` | `BullModule.forRoot({ connection })`, `@Processor(...)` extending `WorkerHost` with `async process(job)` |
| **Validation** | `zod@^4.6.7` | Uses `z.strictObject(...)`, `z.uuid()`, `z.email()`, `.safeParse().error.issues`, built-in Standard JSON Schema |
| **Security & Auth** | `argon2@^0.45.2`, `otplib@^13.6.0` | `otplib@13` functional API (`generateSecret`, `generateURI`, `verify` with `epochTolerance: 30` and `afterTimeStep` TOTP replay protection returning `{ valid, delta, epoch, timeStep }`) |
| **Frontend (UI held for Antislop prompt)** | `next@^16.4.6`, `react@^19.1.10`, `react-dom@^19.1.10`, `tailwindcss@^4.3.5` | `proxy.ts` (`export function proxy`), `cacheComponents: true` with `<Suspense>`, Tailwind v4 `@import "tailwindcss"` + `@theme inline` referencing `--arven-*` CSS variables |

---

## 3. Phase 02 Scope Boundary & Blockers

1. **In Scope (Phase 02 Only):**
   - Root monorepo (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `.env.example`), `.github/workflows/ci.yml`, `packages/config`, `packages/observability`, `packages/validators`, `packages/contracts`.
   - `packages/database`: Full 11-domain Prisma 7 schema (`DATA_MODEL.md`), initial migration SQL + manual `CHECK` constraints & partial unique indexes, `PrismaPg` factory, idempotent deterministic seed (`8` RBAC roles, `34` permissions, default warehouse `JKT-MAIN-01`, `4` collections, `5` categories, `6` ARVEN SKUs `ARV-TOP-001`..`ARV-ACC-001`, dev/test user accounts gated to non-production).
   - `apps/api`: Health (`live`/`ready`), CSRF (`/csrf-token`), Auth (`/auth/register`, `/auth/login`, `/auth/admin/login`, `/auth/mfa/setup`, `/auth/mfa/verify`, `/auth/logout`, `/auth/logout-all`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`, `/auth/me`), Users (`/users/me`, sessions, addresses), Global Deny-by-Default Guard Chain (`SessionAuthGuard` -> `MfaEnforcementGuard` -> `PermissionGuard`) + Route Auth Metadata reflection check + Redis/Memurai throttler + `audit_logs` writer.
   - `apps/worker`: Memurai connection, all 8 BullMQ queues registered, `OutboxRelayService` (`FOR UPDATE SKIP LOCKED`), `notification` worker with local non-Docker dev capture adapter + SMTP adapter.
   - `packages/ui`, `apps/storefront`, `apps/admin`: Design tokens (`DESIGN.md`), `proxy.ts` (`/api/v1/*` BFF rewrite + CSP headers), Auth UI screens & minimal Phase 02 protected shells **(held until user confirms `antislop` timing per skill rule)**.
2. **Host Blocker Pending User Input:**
   - Local `.env` `DATABASE_URL` credentials for native `PostgreSQL 18` (`127.0.0.1:5432`) must be supplied/configured by user before live `prisma migrate dev`, `prisma db seed`, and DB integration tests execute.
