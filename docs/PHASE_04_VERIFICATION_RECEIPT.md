# ARVEN Phase 04 Verification Receipt & Release Decision Packet

> **Phase:** Phase 04: Inventory Ledger, Idempotency & Guest/User Cart + Merge (No Docker)  
> **Phase 04 Plan ID:** `1a47de03-ee06-469d-936b-8d01ef5b28cc`  
> **Release Task ID:** `836ca420-b064-406a-957d-568fa4890e72` (`release-lead`)  
> **Master Blueprint Plan ID:** `6080ca13-f9af-47d3-9220-997659b163ad`  
> **Git Baseline:** `6af6ef2` (`main` branch, local Phase 04 working tree verified)  
> **Compiled Frontend Build IDs:** `@arven/storefront` (`lJQHYFxQQVOiWYCXR9gVV`), `@arven/admin` (`lyQuUOwrQ4_JG8hwO55xw`)  
> **Runtime Topology:** Native Windows Non-Docker (`PostgreSQL 18` on `127.0.0.1:5432`, `Memurai Developer` / Redis API on `127.0.0.1:6379`)  
> **Repair Iterations Used:** `1 / 5` (`maxRepairIterations = 5`, resolved and re-verified across all impacted QA dimensions)  
> **Release Verdict:** **`RELEASE_READY`** (Phase 04 scope complete; strictly zero Phase 05+ checkout/order/payment scope creep; do not deploy without explicit authorization)

---

## 1. Phase 04 Scope Implemented & Verified

All Phase 04 deliverables were implemented within baseline Phase 01 contracts (`AGENTS.md`, `docs/PRD_AND_BUSINESS_RULES.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/API_CONTRACTS.md`, `docs/SECURITY_POLICY.md`, and `DESIGN.md`) and verified against live native PostgreSQL 18 and Memurai without mocks:

1. **Shared Contracts & Validators (`packages/config`, `packages/validators`, `packages/contracts`):**
   - Added inventory, cart, and idempotency policy constants in `packages/config/src/constants.ts` (`CART_POLICY` max quantity `99`, `32`-byte CSPRNG guest token, `IDEMPOTENCY_POLICY` `Retry-After: 2`).
   - Added strict Zod v4 schemas in `packages/validators/src/inventory.ts` (`createAdminStockMovementSchema`, query/response schemas) and `packages/validators/src/cart.ts` (`addCartItemRequestSchema`, `updateCartItemRequestSchema`, `cartResponseSchema`, `uuidSchema`), exported via `packages/validators/src/index.ts`.
   - Regenerated OpenAPI specifications and TypeScript contracts in `packages/contracts/` (`openapi.json`, `openapi/arven.openapi.json`, `src/generated/openapi-paths.ts`, `src/index.ts`).

2. **Backend (`apps/api` — `IdempotencyService`, `InventoryModule`, `CartModule`):**
   - **`IdempotencyService` (`apps/api/src/common/http/idempotency.service.ts`):** Validates `Idempotency-Key` (`16-128` chars matching `[a-zA-Z0-9._:-]+`, else `400 INVALID_IDEMPOTENCY_KEY`), hashes canonical sorted JSON payloads via `sha256CanonicalPayload`, keys records on `(idempotencyKey, actorScope, route)`, enforces `409 IDEMPOTENCY_CONFLICT` on payload mismatch, returns `409 IDEMPOTENCY_IN_PROGRESS` with `Retry-After: 2`, replays completed responses with `Idempotent-Replayed: true`, and cleans up `IN_PROGRESS` rows on thrown errors.
   - **`InventoryModule` (`apps/api/src/modules/inventory/` — `AdminInventoryController`, `InventoryService`):** Exposes `GET /api/v1/admin/inventory/levels`, `GET /api/v1/admin/inventory/movements`, `GET /api/v1/admin/inventory/reservations` (`@RequirePermissions('inventory.read')`), and `POST /api/v1/admin/stock-movements` (`@RequireAnyPermission('inventory.receive', 'inventory.adjust')` with runtime `RECEIPT -> inventory.receive` and `ADJUSTMENT -> inventory.adjust` split). Enforces class-wide `@AdminAuth()` + mandatory TOTP MFA, `SELECT ... FOR UPDATE` row locking inside `prisma.withTransaction`, SQL `CHECK` constraints (`chk_inventory_on_hand_nonneg`, `chk_inventory_reserved_nonneg`, `chk_inventory_reserved_lte_on_hand`), append-only `inventory_movements`, transactional `audit_logs`, and `inventory.received` `outbox_events` emission on `RECEIPT`.
   - **`CartModule` (`apps/api/src/modules/cart/` — `CartController`, `CartService`):** Exposes `GET /api/v1/cart`, `POST /api/v1/cart/items`, `PATCH /api/v1/cart/items/:id`, `DELETE /api/v1/cart/items/:id`, and `@CustomerAuth()` `POST /api/v1/cart/merge`. Isolates customer (`SessionScope.CUSTOMER`) and guest (`arven_guest_cart` / `__Host-arven_guest_cart` `HttpOnly` cookie, SHA-256 `guestTokenHash`) carts, enforces `CsrfGuard` + `Origin` checks, computes authoritative IDR prices and active-warehouse availability server-side, prevents cross-cart IDOR (`404 CART_ITEM_NOT_FOUND`), and locks/merges guest carts cleanly on customer login (`status = 'MERGED'`, `mergedIntoCartId`, audit log, cookie cleanup).

3. **Storefront (`apps/storefront`):**
   - Updated `apps/storefront/src/components/storefront-shell.tsx` with live `Bag` header and mobile drawer counter (`BagCountPill`), `apps/storefront/src/components/catalog/product-detail-view.tsx` with PDP quantity stepper + `Add to Bag`, `apps/storefront/src/app/cart/` & `apps/storefront/src/components/cart/cart-view.tsx` for `/cart` item quantity/removal/authoritative IDR subtotal display, and `apps/storefront/src/app/auth/login/page.tsx` for automatic guest-cart merge upon customer sign-in.

4. **Admin (`apps/admin`):**
   - Added `/inventory` route (`apps/admin/src/app/inventory/`), `apps/admin/src/components/inventory/inventory-workspace.tsx`, `apps/admin/src/lib/inventory-helpers.ts`, `apps/admin/src/components/admin-shell.tsx` navigation entry, and `apps/admin/src/lib/api-client.ts` inventory methods covering `Levels`, `Movements Ledger`, `Reservations` read view, and the `Record Stock Movement` modal (`RECEIPT` / `ADJUSTMENT`, permission gating, `Idempotency-Key` support, and `WIB` timestamps).

5. **Post-Repair UI Accessibility & Performance Fixes (`1 / 5` Repair Iterations):**
   - Resolved all 4 accessibility defects and mobile `/cart` CLS regression in a single repair iteration (`storefront-shell.tsx` `sr-only` `" item"` / `" items"` label and removal of mismatched `aria-label`; `cart-view.tsx` moving `<Divider />` outside `<dl>` + `whitespace-nowrap` on `Authoritative Server Subtotal` + `min-h-[38rem] sm:min-h-[34rem]` skeleton reservation; `cart/page.tsx` reserved loading height; `inventory-workspace.tsx` `aria-describedby` hint/error association + `tablist` roving keyboard focus), reducing mobile populated `/cart` CLS from `0.244055` to `0.059804` (`<= 0.10`) and achieving `0` `axe-core` WCAG 2.2 AA violations.

### Changed & Added File Scope (`git status --short`)

- **Modified:** `.gitignore`, `apps/admin/src/components/admin-shell.tsx`, `apps/admin/src/lib/api-client.ts`, `apps/api/src/app.module.ts`, `apps/api/src/common/http/index.ts`, `apps/api/src/modules/audit-notifications/audit-notifications.module.ts`, `apps/storefront/src/app/auth/login/page.tsx`, `apps/storefront/src/components/catalog/product-detail-view.tsx`, `apps/storefront/src/components/storefront-shell.tsx`, `apps/storefront/src/lib/api-client.ts`, `packages/config/src/constants.ts`, `packages/contracts/openapi.json`, `packages/contracts/openapi/arven.openapi.json`, `packages/contracts/src/generated/openapi-paths.ts`, `packages/contracts/src/index.ts`, `packages/validators/src/index.ts`.
- **Added:** `apps/admin/src/app/inventory/`, `apps/admin/src/components/inventory/`, `apps/admin/src/lib/inventory-helpers.ts`, `apps/admin/test/inventory-api.test.ts`, `apps/api/src/common/http/idempotency.service.ts`, `apps/api/src/modules/cart/`, `apps/api/src/modules/inventory/`, `apps/api/test/security/inventory-cart-integration.test.ts`, `apps/api/test/unit/idempotency-helper.test.ts`, `apps/storefront/src/app/cart/`, `apps/storefront/src/components/cart/`, `apps/storefront/test/cart-api.test.ts`, `docs/qa/phase-04/`, `packages/validators/src/cart.ts`, `packages/validators/src/inventory.ts`.

---

## 2. Full Monorepo Verification Results (`final-regression-report.md`)

Executed uncached (`--force`) after the final UI repair with local dev ports (`3000`, `3001`, `4000`, `4001`) stopped:

- **Route Auth Metadata Audit:** `pnpm --filter @arven/api check:auth-metadata` exited `0` (`Route auth metadata check passed with zero violations.`).
- **Full Monorepo Pipeline:** `pnpm turbo lint typecheck test build --concurrency=4 --force` exited `0` (`Tasks: 41 successful, 41 total`, `Cached: 0 cached, 41 total`, `Time: 52.792s`).
- **Vitest Summary:** `33` test files, `125 / 125` tests passing across `9` packages against live PostgreSQL 18 and Memurai (`@arven/api` `10` files / `47` tests, `@arven/worker` `1` file / `5` tests across all 8 BullMQ queues, `@arven/ui` `7` / `17`, `@arven/database` `2` / `11`, `@arven/admin` `5` / `14`, `@arven/storefront` `4` / `13`, `@arven/validators` `2` / `9`, `@arven/config` `1` / `6`, `@arven/observability` `1` / `3`), plus `@arven/contracts` lint/typecheck/build verification (`exit 0`).
- **Three.js / WebGL Isolation:** `0` Three.js, `@react-three/*`, `.glb`, `.gltf`, or `.wasm` assets in rebuilt `apps/storefront/.next/static` (`26` JS files) and `apps/admin/.next/static` (`27` JS files); `0` Three.js imports in source.

---

## 3. Independent QA Matrix & Evidence IDs (`docs/qa/phase-04/*`)

All 8 Phase 04 quality checkpoints passed independently after the UI repair iteration (`repairIterations: 1 / 5`):

| Checkpoint | Post-Repair Status | Harness Evidence ID | Report Artifact | Observed Key Verification Metrics |
|---|---|---|---|---|
| `responsive` | `pass` | `9e3740b1-e0af-42c3-88aa-0f29b86dd6aa` | [`responsive-report.md`](./qa/phase-04/responsive-report.md) | Storefront `52/52` (`4` routes x `13` viewports) + Admin `/login` `13/13` = `65/65` MCP checks + `16` Playwright Storefront/Admin `/inventory` captures (`320x740`..`1440x900`); `0px` horizontal overflow, `0` OOB elements, `0` broken images. |
| `layout` | `pass` | `18c6c3e0-0cad-4b1a-a97d-bde839cc189e` | [`layout-report.md`](./qa/phase-04/layout-report.md) | `0px` horizontal overflow; single-line `Rp 1.598.000` subtotal (`nowrap`, `144x28px`); `<Divider />` strictly outside `<dl>`; loading skeleton `min-height: 544px`; `Bag` pill aligned (`0px` delta); `0` clipped text, `0` overlaps, `0` broken images. |
| `interaction` | `pass` | `3a02b41d-4320-4bcb-a96f-f20a330e3478` | [`interaction-report.md`](./qa/phase-04/interaction-report.md) | Live Storefront guest PDP `Add to Bag` (`200`), `/cart` `+1` (`PATCH` `200`), reload persistence (`arven_guest_cart`), customer login + `POST /api/v1/cart/merge` (`200`, `ownerType: "USER"`), `-1` & `Remove` (`204`); Admin `/inventory` MFA, roving tabs, blank-reason Zod block, `RECEIPT +2` (`201`), compensating `ADJUSTMENT -2` (`201`) rollback. |
| `typography-color` | `pass` | `2c0e1f42-eaa0-4588-8025-da0509606eb4` | [`typography-color-report.md`](./qa/phase-04/typography-color-report.md) | All pairings `4.5:1+` normal text / `3.0:1+` borders (`check_contrast`); `0` `#8B897F` normal-text uses; `0` pink hues; `0` em-dashes; `Cormorant Garamond`, `Plus Jakarta Sans`, `JetBrains Mono` loaded; `tabular-nums` & `WIB` verified; `prefers-reduced-motion: reduce` (`1e-05s` / `0.01ms`, `scrollBehavior: auto`) clean. |
| `accessibility` | `pass` | `370e9234-1920-4eba-8afa-0283d2161c2b` | [`accessibility-report.md`](./qa/phase-04/accessibility-report.md) | `0` `axe-core 4.14.0` WCAG 2.2 AA violations across all `12` Storefront/Admin scans; `Bag` link `label-content-name-mismatch`, `<dl>` `<Divider />`, modal `aria-describedby` (`#movement-delta-hint`, `#movement-reason-hint`, `#movement-reason-error`), and roving `tablist` (`ArrowRight`/`End`/`ArrowLeft`/`Home`) verified; `200%` zoom `0px` overflow. |
| `security` | `pass` | `0c3ce3ca-523e-4efc-8508-714a781d05d6` | [`security-report.md`](./qa/phase-04/security-report.md) | `0` Critical/High/Medium/Low findings; `check:auth-metadata` `0` violations; `@arven/api` `10` files / `47` tests (`4` live PostgreSQL 18 + Memurai tests in `inventory-cart-integration.test.ts`); `Idempotency-Key` SHA-256 + `409` conflict/replay, `FOR UPDATE` + `CHECK`, `CsrfGuard`, IDOR scoping, and PII redaction verified. |
| `performance` | `pass` | `065ae053-94bf-4956-b39e-1f1c2b75ac61` | [`performance-report.md`](./qa/phase-04/performance-report.md) | Desktop `1280x800` `CLS <= 0.020665` (`0.000` `BagCountPill` hydration shift); Mobile `375x812` populated `/cart` `CLS = 0.059804` (`<= 0.10`); Cart API `2.15ms-26.06ms`; `storefront:/cart` `665,497 B` raw (`203,192 B` gz); `admin:/inventory` `805,341 B` raw (`241,770 B` gz); `0` Three.js/GLB/WASM leakage. |
| `final-regression` | `pass` | `a73f83dd-3ea0-46f5-b71e-cdfbd4f36666` | [`final-regression-report.md`](./qa/phase-04/final-regression-report.md) | Confirmed all `7` prior checkpoints fresh and `pass`, `check:auth-metadata` (`0` violations), uncached `--force` `41/41` Turbo tasks (`33` Vitest files, `125/125` tests, `52.792s`), `0` Three.js leakage, `0` Phase 05+ routes/modules, and clean git/port hygiene. |

---

## 4. Infrastructure Readiness, Hygiene & Next Step

- **Local Infrastructure Readiness:** Native Windows non-Docker services (`PostgreSQL 18` on `127.0.0.1:5432` and `Memurai Developer` on `127.0.0.1:6379`) are operational and passed live integration tests across `@arven/api` and `@arven/worker`; zero Docker containers or dependencies are required or running.
- **Process & Workspace Hygiene:** Ports `3000`, `3001`, `4000`, and `4001` have `0` listening processes; `git ls-files -- .env .harness` is empty (`.env` and `.harness/` remain untracked/ignored); zero secrets, passwords, or TOTP secrets are recorded in this packet or QA reports.
- **Phase Boundary & Rollback:** Strictly zero Phase 05+ checkout, order, Midtrans payment, shipping, returns, or 3D/WebGL features exist in Phase 04. Rollback is reversible by resetting/reverting the Phase 04 working tree to baseline commit `6af6ef2` (or prior Phase 03 baseline) and re-running `pnpm turbo build`.
- **Authorized Next Step:** **Phase 05: Checkout Quote, Order State Machine & Midtrans Integration** (open a new phase-scoped `principal-agentic-harness` plan before starting Phase 05 implementation; do not deploy Phase 04 without explicit user authorization).
