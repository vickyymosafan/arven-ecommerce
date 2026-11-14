# ARVEN Engineering Agents Guide (`AGENTS.md`)

> **Project:** ARVEN Luxury Contemporary Fashion E-Commerce (*"Beyond Trends. Beyond Time."*)  
> **Operating Mode:** Strict Phase-by-Phase Execution governed by `principal-agentic-harness` MCP  
> **Phase 01 Master Plan ID:** `6080ca13-f9af-47d3-9220-997659b163ad`

---

## 1. Mandatory Reading Before Any Work

Before proposing plans, creating schemas, or editing code in any phase, read the authoritative Phase 01 baseline documents in this exact order:

1. **This file (`AGENTS.md`)** — Hard stack pins, anti-hallucination rules, and phase gates.
2. **[`docs/PRINCIPAL_DEVELOPMENT.md`](./docs/PRINCIPAL_DEVELOPMENT.md)** — Harness DAG workflow, parallel file locking, independent QA separation, `maxRepairIterations = 5` escalation, and checkpoint rules.
3. **[`docs/PRD_AND_BUSINESS_RULES.md`](./docs/PRD_AND_BUSINESS_RULES.md)** — Requirements (`FR-001`..`FR-020`), NFRs, 5 state machines, lifecycles, and seed spec.
4. **[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)** & **[ADRs](./docs/adr/)** ([`ADR-001`](./docs/adr/ADR-001-tech-stack-and-version-pins.md), [`ADR-002`](./docs/adr/ADR-002-session-proxy-and-same-site-auth.md), [`ADR-003`](./docs/adr/ADR-003-atomic-inventory-outbox-and-payment-idempotency.md)) — Monorepo topology, Clean Architecture rules, 8 BullMQ queues, Outbox, and provider adapters.
5. **[`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md)** — Canonical 11-domain PostgreSQL 18 + Prisma 7 schema, enums, SQL `CHECK` constraints, and atomic stock reservation SQL.
6. **[`docs/API_CONTRACTS.md`](./docs/API_CONTRACTS.md)** — `/api/v1` endpoints, envelopes, Zod-first Standard Schema + OpenAPI workflow, `Idempotency-Key`, and Midtrans webhook contract.
7. **[`docs/SECURITY_POLICY.md`](./docs/SECURITY_POLICY.md)** — OWASP ASVS 5.0 baseline, 6 trust boundaries, 34 granular RBAC permissions, threat model tests, and PII redaction.
8. **[`DESIGN.md`](./DESIGN.md)** & **[`docs/THREE_D_PIPELINE.md`](./docs/THREE_D_PIPELINE.md)** — Light/Dark semantic tokens, WCAG 2.2 verified pairings, typography/IDR rules, 13-profile responsive QA, and R3F 9 / GLB pipeline.

*(Master business reference: [`ARVEN_Full_Blueprint_v1.md`](./ARVEN_Full_Blueprint_v1.md).)*

---

## 2. Strict Phase-by-Phase Execution Protocol

1. **One Phase at a Time:** Build strictly sequentially from **Phase 02 -> Phase 09** (see [`docs/PRD_AND_BUSINESS_RULES.md`](./docs/PRD_AND_BUSINESS_RULES.md) §5 & [`docs/PRINCIPAL_DEVELOPMENT.md`](./docs/PRINCIPAL_DEVELOPMENT.md) §2). Never implement Phase `N+1` features inside Phase `N`.
2. **One Harness Plan per Phase:** At the start of each phase (02–09), create a phase-scoped plan via `harness.create_execution_plan` (or verify against Phase 01 baseline plan `6080ca13-f9af-47d3-9220-997659b163ad`), then follow:
   - `harness.get_ready_tasks` -> `harness.claim_task` -> `harness.acquire_file_locks`
   - Execute only within assigned `ownedPaths`
   - Record real workspace artifacts/outputs via `harness.record_evidence`
   - Complete via `harness.complete_task` and release locks via `harness.release_file_locks`
   - Run **independent** QA verification (`responsive`, `layout`, `interaction`, `typography-color`, `3d-rendering`, `accessibility`, `performance`, `security`, `final-regression`) and evaluate via `harness.evaluate_quality_gate` before starting the next phase.
3. **Never Edit `.harness/*` Manually:** Only MCP `principal-agentic-harness` tools may mutate `.harness/state.json` or `.harness/checklists/*`.
4. **Honest `BLOCKED` Reporting (`AMB-08`):** On the current host, `node v22.15.1`, `npm 11.4.0`, `corepack 0.32.0`, `git 2.49.0`, and `Python 3.13.3` exist, while `pnpm`, `docker`, `psql`, and `redis-server` are missing from PATH. Phase 02 DB migrations/integration suites MUST report `BLOCKED` if PostgreSQL 18 + Redis 8 are not running—never fake DB passes with mocks.

---

## 3. Hard Stack Pins & Anti-Hallucination Rules

Always verify framework/ORM syntax via **Context7 MCP** before coding. Do NOT guess or mix outdated major-version patterns:

| Area | Locked Pin | Mandatory Pattern | Strictly Forbidden |
|---|---|---|---|
| **Package Manager / Build** | `Node >= 22.15`, `pnpm@10.x` (Corepack), `turbo@^2` | `pnpm install --frozen-lockfile`, workspace protocol | Mixing `npm`/`yarn` lockfiles |
| **Database & ORM** | `PostgreSQL 18.x`, `prisma@^7`, `@prisma/client@^7`, `@prisma/adapter-pg`, `pg` | `prisma.config.ts` (`defineConfig`), `new PrismaClient({ adapter: new PrismaPg(...) })`, manual SQL `CHECK` constraints in migrations | **Prisma 8 RC** (`contract.prisma`, `@prisma/orm-postgres/config`), legacy Prisma 5/6 `url = env(...)` in `schema.prisma`, `prisma db push` on staging/prod |
| **Backend API & Worker** | `nestjs@^12` (ESM), `@nestjs/platform-express@^12` (Express 5), `@nestjs/swagger@^12`, `bullmq@^6`, `@nestjs/bullmq@^12`, `Redis 8.x` | `"type": "module"`, `moduleResolution: "NodeNext"`, explicit `.js` relative imports, `import.meta.dirname`, `StandardSchemaValidationPipe` + Zod (`packages/validators`) -> OpenAPI (`packages/contracts`) | Mixing CJS `require()` `@nestjs/*` packages without ESM verification; `class-validator` duplication; Express 4 `*` wildcards; frontend importing `@prisma/client` |
| **Frontend Apps** | `next@^16`, `react@^19`, `react-dom@^19`, `tailwindcss@^4` | `proxy.ts` (`export function proxy`), `cacheComponents: true` (wrap dynamic data in `<Suspense>`), top-level `turbopack`, same-origin `/api/v1/*` proxy | Creating `middleware.ts`, `experimental.ppr`, `experimental.dynamicIO`, or `export const dynamic = 'force-dynamic'` |
| **3D Engine** | `three`, `@react-three/fiber@^9.8`, `@react-three/drei@^10.7` | `transpilePackages: ['three']`, `'use client'` + `next/dynamic(..., { ssr: false })`, `frameloop="demand"`, `ResourceTracker` disposal, self-hosted `/decoders/` WASM, `poster.webp` + 2D fallback | `@react-three/fiber@8` (React 18 only), SSR `<Canvas>`, bundling `three` onto `/`, `/shop`, `/cart`, `/checkout`, fetching decoders from third-party CDNs |

---

## 4. Non-Negotiable Domain, Security & Design Invariants

- **Canonical Naming Resolutions (`AMB-01`..`AMB-06`):**
  - `ProductStatus` includes `READY_TO_PUBLISH` (`DRAFT`, `REVIEW`, `READY_TO_PUBLISH`, `PUBLISHED`, `ARCHIVED`).
  - `inventory_levels` columns are `quantity_on_hand` and `quantity_reserved` (with SQL `CHECK (quantity_on_hand >= 0 AND quantity_reserved >= 0 AND quantity_reserved <= quantity_on_hand)`).
  - `InventoryMovementType` uses `SALE` (not `COMMIT`); every stock change appends an `inventory_movements` row in the same DB transaction.
  - `orders.user_id` is nullable (`user_id IS NOT NULL OR (guest_email IS NOT NULL AND guest_token_hash IS NOT NULL)`).
- **Money & Time:** All IDR amounts are integer `BIGINT` Rupiah (no floats); format in UI via deterministic `formatIDR()` with `tabular-nums`. Store all timestamps strictly UTC (`TIMESTAMPTZ(3)`); display in `Asia/Jakarta` (`WIB`).
- **Server Authority & Transactions:** Never trust client prices, discounts, stock flags, or browser checkout return redirects. Multi-item reservations sort by `variant_id ASC`, enforce `Idempotency-Key` payload hashing, persist `outbox_events` inside the DB transaction, and verify Midtrans webhooks via `SHA512` + `payment_events` deduplication + `getStatus()`.
- **Auth & RBAC:** Separate cookie namespaces (`__Host-arven_sid`/`arven_sid` for `CUSTOMER`, `__Host-arven_admin_sid`/`arven_admin_sid` + mandatory TOTP MFA for `ADMIN`), `X-CSRF-Token` + `Origin` validation, deny-by-default guards, 34 granular permission codes (`user.role.manage`, `refund.approve`, `settings.provider.manage` restricted strictly to `OWNER`), and zero PAN/CVV storage.
- **Design & Contrast Discipline:** Storefront (`Ivory #F8F7F3` / `Cream #E9E4DA`) and Dark Showcase/Admin (`Charcoal #17191B` / `Graphite #35383A`) consume semantic `--arven-*` CSS tokens only. **Never use `#8B897F` (Stone) for normal text on light surfaces** (`#F8F7F3` `3.27:1` / `#E9E4DA` `2.77:1` FAIL); use Deep Stone `#5E5C54` (`--arven-text-muted`) on light and `#B2B0A6` on dark. **Zero pink anywhere**, zero em dashes in UI copy, all 8 interactive component states implemented, and `prefers-reduced-motion` honored.

---

## 5. Planned Monorepo Command Surface (Implemented in Phase 02)

*(Commands below become executable once Phase 02 initializes `package.json`, `pnpm-workspace.yaml`, and `turbo.json`.)*

- Install: `pnpm install --frozen-lockfile`
- Local infra: `docker compose up -d` (`postgres:18`, `redis:8`, `minio`, `mailpit`)
- Dev: `pnpm dev --filter storefront --filter admin --filter api --filter worker`
- Checks: `pnpm turbo lint typecheck test build`
- Contracts sync: `pnpm contracts:generate` (syncs `packages/validators` + `apps/api` Swagger -> `packages/contracts`)
- DB migrations/seed: `pnpm --filter @arven/database prisma migrate dev` / `prisma db seed`
