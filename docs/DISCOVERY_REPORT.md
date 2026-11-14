# ARVEN — Phase 01 Discovery Report

> **Plan ID:** `6080ca13-f9af-47d3-9220-997659b163ad`  
> **Task ID:** `7d7a103f-f826-4120-88fd-ac109bb2aef5` (`discovery-lead`)  
> **Date:** 2026-11-14

---

## 1. Repository Source-of-Truth Inventory

At the start of Phase 01, workspace `d:\portfolio-project-2026\arven e-commerce` contains only:
- [`ARVEN_Full_Blueprint_v1.md`](../ARVEN_Full_Blueprint_v1.md) (1,618 lines) — Master business, UX, architecture, database, API, security, 3D, and roadmap baseline.
- [`.harness/state.json`](../.harness/state.json) & [`.harness/checklists/6080ca13-f9af-47d3-9220-997659b163ad.md`](../.harness/checklists/6080ca13-f9af-47d3-9220-997659b163ad.md) — MCP Harness persisted DAG and quality checkpoints.

No `package.json`, `.git`, `apps/`, `packages/`, `docker-compose.yml`, or `AGENTS.md` exists yet.

---

## 2. Local Toolchain & Runtime Audit (Observed on Host)

Commands executed on Windows PowerShell in workspace:

| Tool | Observed Status | Impact & Phase Requirement |
|---|---|---|
| `node` | **Installed:** `v22.15.1` | Meets NestJS 12 (`>= 20`) and Next.js 16 runtime requirements. |
| `npm` | **Installed:** `11.4.0` | Available for bootstrapping or running `npx`/`corepack`. |
| `corepack` | **Installed:** `0.32.0` | Can activate `pnpm` without global npm install. |
| `git` | **Installed:** `2.49.0.windows.1` | Repo not yet initialized (`git init` needed in Phase 02). |
| `python` | **Installed:** `3.13.3` | Available for tooling/scripts if needed. |
| `pnpm` | **Missing from PATH** | Must be enabled (`corepack enable` + `packageManager` pin) at Phase 02 start. |
| `docker` | **Missing from PATH** | **Phase 02 Blocker** unless Docker Desktop is installed OR native PostgreSQL 18 + Redis 8 + MinIO are installed locally. |
| `psql` | **Missing from PATH** | No local PostgreSQL CLI detected on PATH. |
| `redis-server` | **Missing from PATH** | No local Redis server detected on PATH. |

---

## 3. Verified Library & Compatibility Findings (Context7 Official Docs)

Blueprint Section 7.2 explicitly prohibits pinning Release Candidates in production and requires release verification at kickoff. Verified findings from Context7:

1. **Prisma ORM 7 (GA) vs Prisma ORM 8 (RC):**
   - **Finding:** Official Prisma release-status documentation states **Prisma ORM 8 is currently a Release Candidate (`8.0.0-rc.29+`)** introducing a new `contract.prisma` and `@prisma/orm-postgres/config` workflow. **Prisma ORM 7 (`^7`) is the stable GA release.**
   - **Action:** Lock **`prisma@^7`** and **`@prisma/client@^7`** with **`prisma.config.ts` (`defineConfig`)** and the PostgreSQL driver adapter **`@prisma/adapter-pg` + `pg`**. Explicitly forbid Prisma 8 RC syntax (`contract.prisma`) and legacy Prisma 5/6 schema-only `url = env(...)` assumptions.

2. **Next.js 16 + React 19 + React Three Fiber 9:**
   - **Finding:** Next.js `16.x` (up to `v16.4.5` in official repo docs) replaces `middleware.ts` with **`proxy.ts`** (`export function proxy(request)`), moves `turbopack` to top-level `next.config.ts`, and replaces `experimental.ppr` / `experimental.dynamicIO` / `dynamic = "force-dynamic"` with **`cacheComponents: true`** (requiring uncached dynamic trees to be wrapped in `<Suspense>`).
   - **Finding:** `@react-three/fiber@9` (`v9.8.2`) **strictly pairs with `react@19`** (`@react-three/fiber@8` is React 18 only). Next.js requires **`transpilePackages: ['three']`** in `next.config.ts`, plus `'use client'` and `ssr: false` dynamic boundaries for WebGL canvases.

3. **NestJS 12 ESM-Only & Express 5 vs Ecosystem Compatibility:**
   - **Finding:** NestJS `12.x` (`@nestjs/platform-express@12.4.0`) requires Node `>= 20`, ships **ESM-only builds** (`"type": "module"`, `moduleResolution: "Node16"` in tsconfig, `.js` relative import specifiers), upgrades Express to **`express@5.3.0`** (`path-to-regexp@8.4.2`), and adds **`StandardSchemaValidationPipe`** (`@Body({ schema: zodSchema })`) integrated with `@nestjs/swagger`.
   - **Finding:** `@nestjs/bullmq@12.0.1` supports `@nestjs/core` `^10 || ^11 || ^12` and `bullmq` `^3..^6`. However, NestJS 12's own repository notes (`tools/gulp/tasks/samples.ts`) warn that third-party `@nestjs/*` packages must ship ESM builds to avoid breaking `require()` chains.
   - **Action:** Lock ESM-only (`Node16`) across `apps/api` and `apps/worker` if using NestJS 12 (see ADR-001) and prefer Standard Schema (Zod) + `StandardSchemaValidationPipe` instead of mixing `class-validator` CJS patterns.

---

## 4. Blueprint Ambiguities & Open Decisions Ledger

Cross-reading all 21 sections and Appendices A–E of `ARVEN_Full_Blueprint_v1.md` surfaced these inconsistencies and undecided items that MUST be pinned in Phase 01 docs to prevent downstream agent hallucinations:

| ID | Blueprint Discrepancy / Gap | Resolution Locked for Phase 01 Contracts |
|---|---|---|
| `AMB-01` | Section 5.1 lists `ProductStatus` as `DRAFT → REVIEW → READY_TO_PUBLISH → PUBLISHED → ARCHIVED`, whereas Section 10.6 omits `READY_TO_PUBLISH`. | Include `READY_TO_PUBLISH` in canonical `ProductStatus` enum (`DATA_MODEL.md`) so workflow gates match database enum. |
| `AMB-02` | Section 10.2 uses `on_hand, reserved` on `InventoryLevel`; Section 12.1 SQL snippet uses `quantity_on_hand, quantity_reserved`. | Standardize physical column names as `quantity_on_hand` and `quantity_reserved` (or lock one spelling in `DATA_MODEL.md` and mirror in Prisma `@map`). |
| `AMB-03` | Section 5.2 writes movement type `COMMIT/SALE`, while Section 10.6 enum uses `SALE`. | Canonical enum value is `SALE` (representing committed stock deduction on paid order). |
| `AMB-04` | Section 20.3 recommends supporting Guest Checkout, while Section 10.2 lists `Order.user_id` without explicitly marking it nullable. | `Order.user_id` MUST be nullable (`guest_email` + signed/hashed guest order lookup token stored on `Order`). |
| `AMB-05` | Section 11.1 mandates `HttpOnly, Secure, SameSite` session cookies across Storefront, Admin, and API without specifying topology. | Adopt same-site Next.js `/api/v1/*` proxy/rewrite (or shared root domain) + CSRF token defense (`ADR-002`) so cookies never require insecure cross-site workarounds. |
| `AMB-06` | `RefundStatus` and `CouponType` are referenced in workflows (5.3, 5.5, 11.4) but missing from Section 10.6 enum table. | Define explicit `RefundStatus`, `DiscountType`, `CartStatus`, and `StockReservationStatus` enums in `DATA_MODEL.md`. |
| `AMB-07` | External provider credentials (Midtrans sandbox, shipping carrier, Cloudflare R2, SMTP) are not yet provisioned. | Define strict interface adapters (`PaymentProvider`, `ShippingProvider`, `ObjectStorageProvider`, `EmailProvider`) with deterministic local dev adapters (MinIO, Mailpit, Midtrans sandbox/local test adapter guarded out of production). |
| `AMB-08` | Local Docker, PostgreSQL 18, and Redis 8 are not installed on current host PATH. | Documented as Phase 02 Infrastructure Prerequisite before DB migrations or integration tests can execute. |
