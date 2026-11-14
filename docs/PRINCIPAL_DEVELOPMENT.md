# ARVEN — Principal Engineering Governance & Development Standard

> **Status:** Canonical Engineering Operating Standard (Phases 02–09)  
> **Binding Harness:** `principal-agentic-harness` MCP Server + `.harness/` DAG & Checkpoint Ledger  
> **Phase 01 Reference Plan ID:** `6080ca13-f9af-47d3-9220-997659b163ad`  
> **Sources:** [`ARVEN_Full_Blueprint_v1.md`](../ARVEN_Full_Blueprint_v1.md) (Sections 7–9, 17–19; Appendices A, D, E), [`PRD_AND_BUSINESS_RULES.md`](./PRD_AND_BUSINESS_RULES.md), [`DISCOVERY_REPORT.md`](./DISCOVERY_REPORT.md), [`SECURITY_POLICY.md`](./SECURITY_POLICY.md)  
> **Governance & Quality Modules:** `1`, `5`, `8`, `9`, `10`, `14`, `19`, `21`, `23`, `24`, `25`, `26`, `31`, `33`, `35`, `38`, `39`, `42`, `43`, `45`, `48`, `50`, `53`, `54`, `57`, `58`, `59`, `62`, `63`, `64`, `66`, `67`

---

## 1. Purpose & Non-Negotiable Governance Rules

ARVEN is built incrementally across **9 sequential phases** (Phase 01 Discovery & Contracts through Phase 09 Production Readiness). Every engineer and autonomous agent working on ARVEN MUST obey five core governance laws:

1. **Contracts Before Code:** Implementation follows Phase 01 baseline contracts (`AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/API_CONTRACTS.md`, `docs/SECURITY_POLICY.md`, `DESIGN.md`, `docs/THREE_D_PIPELINE.md`, and ADRs). Breaking a contract requires an updated ADR and `harness.reopen_task` on affected downstream work—never silent code drift.
2. **One Harness Execution Plan Per Phase:** Phases 02–09 each execute under their own `harness.create_execution_plan` DAG. No phase begins until the preceding phase passes its exit gate.
3. **Never Trust Memory on Shifting Versions:** Always verify Next.js 16, NestJS 12, Prisma 7, and React Three Fiber 9 APIs via Context7 before coding.
4. **Disjoint Ownership & Serialized Shared Files:** Parallel agents hold mutually exclusive `ownedPaths` locks via `harness.acquire_file_locks`; shared integration files have one designated owner per batch.
5. **Independent Verification & Honest Evidence:** No implementation agent may self-attest its own patch or mark a quality checkpoint `PASS`. Every `PASS` points to real, fresh workspace evidence; missing prerequisites are recorded honestly as `BLOCKED`.

---

## 2. Phase-by-Phase Harness Governance (Phases 01–09)

### 2.1 Execution Plan Cadence
- **Phase 01 (`6080ca13-f9af-47d3-9220-997659b163ad`):** Discovery, contracts, ADRs, security baseline, design contract, and 3D specification.
- **Phases 02–09:** At the start of each phase, the orchestrator calls `harness.create_execution_plan` scoped strictly to that phase's deliverables, dependencies, and risk-relevant quality checkpoints.

| Phase | Scope & Deliverables | Hard Prerequisites (Entry Gate) | Mandatory Exit Gate (Before Unlocking Next Phase) |
|---|---|---|---|
| **01** | Discovery & Contracts (`PRD`, `DISCOVERY_REPORT`, `AGENTS.md`, `ARCHITECTURE`, `DATA_MODEL`, `API_CONTRACTS`, `SECURITY_POLICY`, `DESIGN`, `THREE_D_PIPELINE`, `ADR-001..003`) | `ARVEN_Full_Blueprint_v1.md` | All Phase 01 docs consistent, zero unresolved `AMB-*` ambiguities, contracts verified against Context7. |
| **02** | Monorepo (`pnpm` + Turborepo), `docker-compose.yml`, `packages/database` (Prisma 7 + initial schema + seed), `packages/contracts`, `packages/validators`, `packages/observability`, Auth (`Argon2id`, cookie session, admin MFA), RBAC guards | Phase 01 PASS + **`AMB-08` Resolved** (`pnpm` enabled via `corepack`; Docker Desktop or native PostgreSQL 18 + Redis 8 + MinIO available) | Frozen install, lint, typecheck, build, Prisma migration + seed reproducible on clean DB, unit + auth/MFA/RBAC tests `PASS`. |
| **03** | Catalog API (products, variants, categories, collections, search/filters) + Storefront P0 (Home, Shop, Category, Search, PDP 2D gallery, size guide) | Phase 02 Gate `PASS` | Catalog CRUD + publish-gate tests `PASS`; `responsive`, `layout`, `interaction`, `typography-color`, `accessibility` Playwright QA `PASS` on storefront routes (`3d-rendering` marked `NOT_APPLICABLE` with rationale for Phase 03). |
| **04** | Inventory Ledger (`warehouses`, `inventory_levels` + SQL `CHECK`, append-only `inventory_movements`), Guest & Authenticated Cart + Merge rules | Phase 03 Gate `PASS` | Transaction integration tests verify zero direct stock edits without ledger row + deterministic cart merge + guest token security `PASS`. |
| **05** | Server-authoritative Checkout Quote, Atomic Stock Reservation + Expiry Worker, `Idempotency-Key`, Midtrans Sandbox Adapter & Webhook/Reconciliation, Customer Order History | Phase 04 Gate `PASS` + Midtrans sandbox/deterministic test adapter configured | 20-way concurrency oversell test `PASS`, duplicate/forged webhook & redirect tests `PASS`, order ownership IDOR tests `PASS`, Customer E2E purchase flow `PASS`. |
| **06** | Admin Dashboard (`apps/admin`), Order Fulfillment & Shipments, Inventory Ops, Returns & Dual-Step Refunds, Coupons, CMS (Lookbook/Journal), `audit_logs` | Phase 05 Gate `PASS` | Full 7-role RBAC permission matrix integration tests `PASS`, refund approval separation-of-duties `PASS`, Admin & Customer E2E + responsive/a11y QA `PASS`. |
| **07** | `packages/three-engine`, Presigned Quarantine Upload + BullMQ `3d-assets` Validator Worker, R3F 9 Product Viewer, Color/Material Presets, Poster & Non-WebGL Fallback | Phase 06 Gate `PASS` + S3/MinIO local/staging bucket | Malformed GLB rejection test `PASS`, WebGL-disabled checkout E2E `PASS`, GPU resource disposal/leak check + `3d-rendering` QA `PASS`, catalog routes free of eager 3D JS bloat. |
| **08** | Virtual Showroom (lazy zones, hotspots, mobile navigation) & Outfit Studio (fixed mannequin rig, slot/rig compatibility validation, saved outfit configs) | Phase 07 Gate `PASS` | Rig/slot incompatibility rejection `PASS`, saved outfits omit authoritative prices, mobile WebGL FPS/memory budget & `3d-rendering`/`responsive` QA `PASS`. |
| **09** | Production Hardening: OWASP ASVS 5.0 full security audit, `axe-core` full-site WCAG 2.2 AA audit, `k6` load testing, observability/alerts, backup & restore drill, Release Packet | Phase 08 Gate `PASS` | **All 9 Harness Quality Checkpoints `PASS`** with fresh evidence + Production Cutover Runbook & Release Checklist verified (`harness.evaluate_quality_gate` -> `PASS`). |

### 2.2 Strict Phase-Gate Rule
- An agent MUST NOT begin writing Phase `N+1` production code inside Phase `N`'s workspace while Phase `N` has `FAIL` or `PENDING` required tasks/checkpoints.
- **Exception (Environment Blockers):** If a host prerequisite blocks execution (e.g., `AMB-08` missing Docker/Postgres/Redis), record `BLOCKED` honestly on the blocked task/checkpoint with exact missing dependencies; never fabricate green integration checks using mocks in place of real PostgreSQL/Redis verification.

---

## 3. Anti-Hallucination & Truth-in-Context Guardrails

### 3.1 Mandatory Context Reading Sequence (Module 64 & 67)
Before proposing changes, writing schemas, or editing code in any task, agents MUST read:
1. `AGENTS.md` (monorepo commands, package manager, test/lint scripts, critical invariants)
2. `docs/ARCHITECTURE.md` & `docs/adr/ADR-001..003`
3. `docs/DATA_MODEL.md` (exact Prisma model names, physical column names such as `quantity_on_hand` / `quantity_reserved` per `AMB-02`, canonical enums such as `READY_TO_PUBLISH` / `SALE` per `AMB-01` & `AMB-03`, nullable `Order.user_id` per `AMB-04`)
4. `docs/API_CONTRACTS.md` (exact `/api/v1` endpoints, Zod/contracts schemas, response envelope, error codes, `Idempotency-Key` rules)
5. `docs/SECURITY_POLICY.md` (exact RBAC permission codes, cookie/CSRF rules, logging redaction)
6. `DESIGN.md` & `docs/THREE_D_PIPELINE.md` (for UI/3D work)

### 3.2 Mandatory Context7 Verification Before Library Usage
Per workspace rules and `DISCOVERY_REPORT.md` §3, agents MUST verify live official documentation via **Context7 MCP** (`resolve-library-id` -> `query-docs`) before writing or modifying framework/ORM integration code—especially for these four version-sensitive packages:

| Package / Stack | Verified Baseline (Phase 01) | Explicitly Forbidden Hallucinations |
|---|---|---|
| **Next.js 16** (`/vercel/next.js`) | Use `proxy.ts` (`export function proxy(request: NextRequest)`) for request interception, CSP nonces, and `/api/v1/*` proxy rules; top-level `turbopack` in `next.config.ts`; `cacheComponents: true` (wrap dynamic trees in `<Suspense>`); `transpilePackages: ['three']`. | **DO NOT** create `middleware.ts`, `experimental.ppr`, `experimental.dynamicIO`, or `export const dynamic = 'force-dynamic'` under `cacheComponents` without verifying Next.js 16 docs. |
| **NestJS 12** (`/nestjs/nest`) | **ESM-only** (`"type": "module"`, `moduleResolution: "Node16"` / explicit `.js` relative import specifiers); built on `express@5.3.0` (`path-to-regexp@8.4.2`); prefer built-in `StandardSchemaValidationPipe` + `StandardSchemaSerializerInterceptor` with Zod (`@standard-schema/spec`). | **DO NOT** mix CJS `require()` third-party `@nestjs/*` libraries without checking ESM compatibility, **DO NOT** use legacy Express 4 wildcard syntax (`*` vs Express 5 named wildcard), and avoid duplicating `class-validator` if contracts standardize on Zod. |
| **Prisma ORM 7** (`/prisma/orm`) | Stable GA `prisma@^7` + `@prisma/client@^7`; configure CLI via **`prisma.config.ts`** (`import 'dotenv/config'`, `defineConfig`, `env('DATABASE_URL')`); connect runtime client via **`@prisma/adapter-pg`** (`PrismaPg`) + `pg`. | **DO NOT** install Prisma 8 RC (`8.0.0-rc.*`), **DO NOT** generate `contract.prisma` or `@prisma/orm-postgres/config`, and **DO NOT** rely on Prisma 5/6 schema `url = env(...)` inside `schema.prisma` without `prisma.config.ts`. |
| **React Three Fiber 9** (`/pmndrs/react-three-fiber`) | `@react-three/fiber@^9` paired strictly with **React 19**; `'use client'` + `next/dynamic(..., { ssr: false })` boundary; explicit disposal of geometries, materials, textures, and render targets (`dispose={null}` reserved strictly for intentionally shared cached assets). | **DO NOT** install `@react-three/fiber@8` (React 18 only) or render `<Canvas>` in React Server Components or SSR. |

### 3.3 Evidence Honesty & Zero Fabrication (Module 48 & 54)
- Only cite file paths, symbol names, database columns, endpoints, and command outputs directly observed in the current workspace or tool outputs.
- Never extrapolate unprinted test counts, timings, or coverage percentages.
- If a check ran with mocked providers or without PostgreSQL/Redis, state the exact mocked/filtered scope explicitly and never report it as a full integration pass.

---

## 4. Parallel Agent Coordination & Harness Workflow

### 4.1 Canonical Orchestration Lifecycle (Modules 24, 25, 66)
1. **Plan & Ready Discovery:** Orchestrator calls `harness.get_ready_tasks` to retrieve `pending` tasks whose `dependsOn` ancestors are `completed`.
2. **Claim & Lock:** Before delegating a task to a subagent, orchestrator calls `harness.claim_task` (with explicit `ownedPaths` or followed immediately by `harness.acquire_file_locks`). If any lock overlaps an active task, stop and serialize via `dependsOn` instead of racing.
3. **Bounded Context Packet:** Pass each subagent:
   - `planId`, `taskId`, `role`, relevant `skills` & `moduleIds`
   - Explicit `ownedPaths` (exact files/globs the subagent is allowed to write)
   - Required input docs to read first + concrete acceptance criteria
   - Explicit prohibition against touching `.harness/*`, calling `harness.complete_task` / `harness.release_file_locks`, or editing outside `ownedPaths`.
4. **Structured Handoff:** Subagent returns a concise summary containing `taskId`, `status`, `changedFiles`, `decisions`, `testsRun`, `risks`, and `nextDependencies`.
5. **Evidence & Completion:** Orchestrator independently checks the diff/outputs, records real artifacts/commands via `harness.record_evidence`, transitions the task via `harness.complete_task`, and releases locks via `harness.release_file_locks`.

### 4.2 Non-Overlapping File Ownership & Shared Integration Owners
- **Disjoint Parallel Batches:** Two concurrent implementation subagents MUST NEVER share write access to the same directory or file. Example clean splits:
  - `data-engineer`: `packages/database/**`
  - `backend-developer`: `apps/api/**`, `apps/worker/**`
  - `frontend-developer`: `apps/storefront/**`, `apps/admin/**`, `packages/ui/**`
  - `threejs-developer`: `packages/three-engine/**` (with clear boundary against `apps/storefront/src/components/three/**` if split)
- **Single Integration Owner for Shared Files:** Shared root or cross-cutting files (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `pnpm-lock.yaml`, `packages/contracts/**`, `packages/validators/**`, `packages/config/**`, `apps/api/src/app.module.ts`, `DESIGN.md`) MUST be owned by **one** dedicated integration/foundation task that completes **before** downstream parallel consumers unlock.
- **No Direct `.harness/*` Edits:** Neither orchestrator nor subagents may manually edit `.harness/state.json` or `.harness/checklists/*`. All state transitions flow exclusively through `principal-agentic-harness` MCP tools.

### 4.3 Independent Verification (Anti-Self-Attestation, Modules 14 & 54)
- **Strict Separation of Author and Verifier:** An agent that implemented code (`frontend-developer`, `backend-developer`, `threejs-developer`, `data-engineer`, `security-engineer`) MUST NEVER be assigned the QA/gate verification task for its own work.
- **Required Independent Roles:**
  - `responsive-qa-agent` — Viewport matrix & overflow/reflow verification (`localhost.inspect_responsive` / Playwright)
  - `visual-qa-agent` — Screenshot & layout hierarchy inspection
  - `functional-qa-agent` — Interactive flows & state verification (`localhost.run_interaction_scenario` / Playwright)
  - `design-qa-agent` — Typography, color contrast, tokens, reduced motion
  - `threejs-qa-agent` — WebGL/R3F canvas, shader compilation, disposal, fallback, FPS/memory stability
  - `accessibility-qa-agent` — `axe-core`, keyboard tab order, focus visibility, ARIA, zoom
  - `security-qa-agent` — OWASP ASVS controls, RBAC/IDOR, webhook/concurrency tests, SAST/SCA/secret scan
  - `performance-qa-agent` — Bundle separation (no 3D in catalog bundle), Lighthouse/`k6`/runtime errors
  - `independent-assurance-lead` — Cross-checks evidence freshness, deduplicates findings, evaluates `harness.evaluate_quality_gate`
  - `release-lead` — Assembles Decision Packet & handover documentation (never deploys without explicit user authorization).

### 4.4 Repair Loop Budget & Escalation (`maxRepairIterations = 5`, Modules 42, 50, 58)
- Every Harness Execution Plan enforces **`maxRepairIterations = 5`**.
- When an independent QA agent finds a defect (`FAIL`):
  1. Orchestrator calls `harness.increment_repair_iteration`.
  2. Orchestrator calls `harness.invalidate_checkpoints` for every quality dimension invalidated by the upcoming fix.
  3. Orchestrator applies causal attribution (Module 50) and dispatches a narrowly scoped repair task (or reopens the owning implementation task via `harness.reopen_task`), followed by **fresh** independent re-verification.
- **Hard Escalation at 5/5:** If `repairIterations` reaches `5` and any required checkpoint or task still fails, **STOP automated retries immediately**. Present a human Decision Packet containing: failed checkpoint(s), root-cause summary of all 5 iterations, exact failing commands/screenshots/evidence IDs, architectural trade-offs, and concrete options for user direction.

---

## 5. Definition of Done, Evidence & Quality Checkpoint Integrity

### 5.1 Definition of Done (Task & Phase Level)
Aligned with Blueprint §18.3, a task or phase is **Done** only when ALL applicable criteria hold:
1. Acceptance criteria in PRD / API / Data / Design / Security contracts are satisfied and verified.
2. Backend endpoints pass Zod/`StandardSchemaValidationPipe` validation, deny-by-default RBAC, ownership checks, and `Idempotency-Key` rules where applicable.
3. Frontend UI implements all required interactive states (`loading`, `empty`, `error`, `disabled`, `focus`, `hover`, `success`) and passes mobile, tablet, desktop, keyboard, and `prefers-reduced-motion` checks.
4. Automated tests (unit, integration, API E2E, browser E2E, concurrency/replay where applicable) pass without skipped (`it.skip`) or weakened assertions.
5. Zero unresolved Critical/High security findings without a formal unexpired Policy Exception.
6. Structured observability logs/telemetry emit `requestId` and pseudonymous `actorId` without leaking PII or secrets.
7. Documentation and ADRs remain synchronized with implementation.

### 5.2 Checkpoint Status Semantics (Modules 1, 10, 39, 43)
When calling `harness.update_quality_checkpoint`:

| Status | Mandatory Condition | Strictly Forbidden |
|---|---|---|
| **`PASS`** | Must attach valid `evidenceIds` created via `harness.record_evidence` referencing workspace-relative artifacts (test logs, Playwright reports, screenshots, `k6`/`axe-core` JSON, security scan reports) with exact command, timestamp, actor, and target scope. | Marking `PASS` from verbal claims, mocked DB/payment passes reported as full integration, or stale evidence predating code edits. |
| **`FAIL`** | Used whenever a test, visual/a11y check, security probe, or budget threshold fails. Must include failing evidence/reason and trigger bounded repair (`<= 5`). | Hiding failures inside task prose while leaving checkpoint `PENDING` or `PASS`. |
| **`BLOCKED`** | Used when an external or environment dependency prevents execution (e.g., `AMB-08` missing Docker/PostgreSQL 18/Redis 8, missing Midtrans sandbox credentials, missing GPU WebGL in headless CI without SwiftShader). Must state exact blocker and recovery action. | Marking `BLOCKED` items as `PASS` or `NOT_APPLICABLE`. |
| **`NOT_APPLICABLE`** | Used **only** when the phase scope genuinely excludes that dimension (e.g., `3d-rendering` in Phase 02 Foundation/Auth, `responsive` for pure backend Phase 04 if no UI changes exist in that phase's plan). Must provide an explicit written rationale in `reason`. | Using `NOT_APPLICABLE` to skip required QA on existing UI, 3D, or security surfaces. |

### 5.3 Evidence Freshness & Invalidation Rules (Module 39)
- Every `harness.record_evidence` record MUST use workspace-relative paths and include metadata identifying `planId`, `taskId`, `actor`, `command`, `commit`/build state, and (for browser checks) route, viewport, and browser engine.
- Whenever source code, Prisma schema, `package.json`/lockfile, Next.js/NestJS config, or environment variables change after a checkpoint was marked `PASS`, the orchestrator MUST call `harness.invalidate_checkpoints` on affected dimensions before running `harness.evaluate_quality_gate`.

### 5.4 The 9 Canonical Harness Quality Checkpoints Mapped to ARVEN

| Checkpoint ID | Title | Required Verification & Evidence | Primary Phase Applicability |
|---|---|---|---|
| `responsive` | Responsive | Playwright / `localhost.inspect_responsive` across mobile, tablet, desktop viewports; zero horizontal overflow, clean reflow, >= 44px tap targets | Phases 03, 05, 06, 07, 08, 09 |
| `layout` | Layout & Structure | Visual hierarchy, spacing, editorial grid, header/nav/footer integrity, zero overlapping/clipped elements | Phases 03, 05, 06, 07, 08, 09 |
| `interaction` | Functional Interaction | Interactive E2E flows (`localhost.run_interaction_scenario` / Playwright): filters, cart merge, checkout, admin actions, all UI states | Phases 03, 04, 05, 06, 07, 08, 09 |
| `typography-color` | Typography & Color | Design tokens (`DESIGN.md`: Charcoal `#17191B`, Ivory `#F8F7F3`, Cream `#E9E4DA`, etc.), serif/sans pairing, WCAG AA contrast check | Phases 03, 06, 07, 08, 09 |
| `3d-rendering` | 3D Rendering & Shader Stability | `threejs-qa-agent` verification: GLB load, presets, showroom zones, Outfit Studio slots, zero console/WebGL errors, disposal/memory leak check, poster/non-WebGL fallback | Phases 07, 08, 09 (`NOT_APPLICABLE` with rationale in Phases 02–06) |
| `accessibility` | Accessibility | `axe-core` audit (0 critical/serious violations), full keyboard navigation, visible focus rings, `alt_text`, `200%` zoom, `prefers-reduced-motion` | Phases 03, 05, 06, 07, 08, 09 |
| `performance` | Performance | Next.js bundle audit (catalog free of 3D bundle), Core Web Vitals/Lighthouse, GLB 2–8 MB budget, API P95 & `k6` load benchmarks | Phases 03, 07, 08, 09 (baseline) |
| `security` | Security & Reliability | OWASP ASVS 5.0 checks, Argon2id/MFA/cookie/CSRF tests, 7-role RBAC + IDOR matrix, concurrency oversell + webhook replay tests, GLB malware/validation tests, SAST/SCA/secret scan, PII log redaction | Phases 02, 04, 05, 06, 07, 09 |
| `final-regression` | Final Regression | Cross-phase full regression re-run on current build (`lint`, `typecheck`, unit, integration, API E2E, Playwright E2E, DB backup/restore drill in Phase 09) + `harness.evaluate_quality_gate` | End of every Phase (full cutover gate in Phase 09) |

---

## 6. Release Decision Packet & Human Approval Boundaries (Module 53)

Before any staging promotion or production cutover (Blueprint Appendices A & D), `release-lead` MUST compile a **Release Decision Packet** containing:
1. Plan & Task completion summary (`harness.evaluate_quality_gate` -> `PASS`).
2. Complete list of changed files, database migrations (verified backward-compatible / expand-migrate-contract), and ADR updates.
3. Fresh evidence index covering all 9 quality checkpoints (tests, screenshots, `axe-core`, `k6`, SAST/SCA, restore drill).
4. Open low/medium known issues, residual risks, and any approved unexpired Policy Exceptions.
5. Tested rollback procedure & Production Cutover Runbook checklist (Blueprint Appendix D).
6. **Explicit Human Approval Gate:** Agents MUST NEVER deploy to production, execute destructive production migrations, rotate live payment keys, or trigger external customer side effects without explicit human user authorization.
