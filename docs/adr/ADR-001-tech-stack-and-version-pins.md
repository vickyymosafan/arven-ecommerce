# ADR-001: Tech Stack and Production Version Pins

Status: Accepted  
Date: 2026-11-14  
Owners: Architecture Lead / Principal Engineering  

## Context

[`ARVEN_Full_Blueprint_v1.md`](../../ARVEN_Full_Blueprint_v1.md) (Section 7.2) mandates verifying release channels and compatibility matrices at project kickoff and explicitly forbids pinning Release Candidates (RC) for production workloads.

During Phase 01 Discovery ([`DISCOVERY_REPORT.md`](../DISCOVERY_REPORT.md)) and live documentation checks via Context7:
1. Local workstation runtime is `Node.js v22.15.1` with `corepack 0.32.0` (`pnpm` must be activated via `corepack enable`).
2. **Prisma ORM 8** is currently a Release Candidate (`8.0.0-rc.29+`) introducing a new `contract.prisma` workflow; **Prisma ORM 7 (`^7`)** is the stable GA release using `prisma.config.ts` (`defineConfig`) and the `@prisma/adapter-pg` driver adapter.
3. **Next.js 16** (`16.x` GA) pairs with **React 19**, replaces `middleware.ts` with `proxy.ts`, moves `turbopack` to top-level `next.config.ts`, and replaces `experimental.ppr` / `experimental.dynamicIO` / `dynamic = "force-dynamic"` with `cacheComponents: true` (requiring `<Suspense>` around uncached dynamic trees).
4. **React Three Fiber 9 (`@react-three/fiber@^9`)** strictly pairs with `react@^19` (`@react-three/fiber@8` only supports React 18) and requires `transpilePackages: ['three']` in `next.config.ts`.
5. **NestJS 12** ships ESM-only builds (`"type": "module"`, `NodeNext`/`Node16` module resolution, `.js` relative import specifiers), upgrades `@nestjs/platform-express` to **Express 5**, adds `StandardSchemaValidationPipe` (`@Body({ schema })`, `@Query({ schema })`, `@Param(..., { schema })`), and integrates with `@nestjs/swagger@^12` (which natively converts Zod 4.2+ Standard JSON Schema definitions) and `@nestjs/bullmq@^12` (supporting `bullmq` `^3..^6`, running on **Redis 8.x**). However, third-party `@nestjs/*` ecosystem packages must ship compatible ESM exports.

## Decision

Lock the following production-safe GA technology pins across the ARVEN monorepo:

| Layer | Locked Pin / Standard | Key Technical Constraint |
|---|---|---|
| Runtime & Package Manager | `Node.js >= 22.15` (LTS), `pnpm@10.x` (Corepack `packageManager`), `turbo@^2` | `pnpm install --frozen-lockfile` in CI; no mixing `npm`/`yarn` lockfiles |
| Storefront & Admin | `next@^16`, `react@^19`, `react-dom@^19`, `tailwindcss@^4` | `cacheComponents: true`, `proxy.ts` (no `middleware.ts`), top-level `turbopack`, `<Suspense>` around dynamic trees |
| 3D Engine | `three`, `@react-three/fiber@^9`, `@react-three/drei@^10` | `transpilePackages: ['three']`; `'use client'` + `next/dynamic(..., { ssr: false })` only |
| Backend API & Worker | `nestjs@^12`, `@nestjs/platform-express@^12` (Express 5), `@nestjs/swagger@^12` | `"type": "module"`, `moduleResolution: "NodeNext"` (Node16-compatible), `.js` relative imports, `import.meta.dirname`, `StandardSchemaValidationPipe` |
| Validation & Contracts | `zod@^4.3` (`packages/validators`) -> OpenAPI 3.0 (`packages/contracts`) | Native Standard JSON Schema (`~standard.jsonSchema`), single source of truth; no `class-validator` duplication |
| Database & ORM | `PostgreSQL 18.x`, `prisma@^7`, `@prisma/client@^7`, `@prisma/adapter-pg`, `pg` | Configured via `prisma.config.ts` (`defineConfig`); Prisma 8 RC (`contract.prisma`) and legacy Prisma 5/6 `url = env(...)` strictly prohibited |
| Cache & Queues | `Redis 8.x`, `bullmq@^6` (`^6.5.3`), `@nestjs/bullmq@^12` | 8 dedicated BullMQ queues (`payment`, `inventory`, `order`, `shipping`, `notification`, `media`, `3d-assets`, `analytics`) |
| Security & Testing | `argon2` (Argon2id), `vitest`, `supertest`, `@playwright/test`, `@axe-core/playwright`, `k6`, Testcontainers | Zero hardcoded secrets; OWASP ASVS 5.0 verification baseline |

**Authorized NestJS Fallback Policy:** If Phase 02 dependency integration discovers an unresolvable third-party ESM or Express 5 incompatibility in a required package, falling back to **NestJS 11 LTS** (retaining `@arven/validators` + `@arven/contracts`) is explicitly authorized via a superseding ADR amendment prior to Phase 03, rather than introducing brittle patches or `require()` hacks.

## Alternatives considered

- **Option A — Pin Prisma ORM 8 RC (`8.0.0-rc.29+`):** Rejected because Blueprint Section 7.2 prohibits RC software in production, and RC schema syntax (`contract.prisma`) risks breaking changes before GA.
- **Option B — Pin Prisma ORM 6 legacy setup:** Rejected because Prisma 7 GA (`prisma.config.ts` + `@prisma/adapter-pg`) is stable and avoids an inevitable major migration later.
- **Option C — Downgrade frontend to Next.js 15 + React 18 + R3F 8:** Rejected because Next.js 16 + React 19 + R3F 9 is the current stable baseline in the blueprint and prevents a future React 19 + R3F 9 rewrite.
- **Option D — Split backend into microservices immediately:** Rejected in favor of a modular monolith (`apps/api` + `apps/worker`) so checkout, inventory reservation, payment state, and outbox share a single PostgreSQL ACID boundary.

## Consequences

- **Benefits:** Production-grade GA versions across every layer; zero CJS/ESM impedance mismatch if NestJS 12 ESM conventions are followed consistently; single Zod schema source driving both runtime validation and OpenAPI contracts; clean React 19 + R3F 9 compatibility.
- **Trade-offs:** Developers must adhere strictly to `.js` relative import specifiers in `apps/api`/`apps/worker`, wrap uncached Next.js Server Component slots in `<Suspense>` under `cacheComponents: true`, and install Docker / PostgreSQL 18 / Redis 8 locally (`AMB-08` prerequisite) before running Phase 02 migrations.
- **Migration Plan:** Phase 02 initializes `package.json` (`packageManager` + engines), `pnpm-workspace.yaml`, `turbo.json`, `packages/database/prisma.config.ts`, and `docker-compose.yml` matching these pins.

## Verification

- `pnpm install --frozen-lockfile` succeeds under `Node v22.x`.
- `pnpm turbo typecheck lint build` passes across `storefront`, `admin`, `api`, `worker`, and all `packages/*`.
- `prisma migrate deploy` and `prisma db seed` execute cleanly against PostgreSQL 18.x using `PrismaPg`.
- `@nestjs/bullmq` worker registers and processes test jobs across all 8 queues against Redis 8.x.
- `apps/storefront` production build passes with `cacheComponents: true`, `proxy.ts`, and `transpilePackages: ['three']`.
