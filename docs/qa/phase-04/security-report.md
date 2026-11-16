# ARVEN Phase 04 Security QA Report

> **Harness Plan ID:** `1a47de03-ee06-469d-936b-8d01ef5b28cc`  
> **Task ID:** `8c193dcc-3258-469c-ae40-b91214f24e7b`  
> **Checkpoint ID:** `security`  
> **Independent Verifier:** `security-qa-agent`  
> **Standard Baseline:** OWASP ASVS 5.0 (Level 2 platform-wide; Level 3 rigor on inventory/cart invariants & admin boundaries) & [`docs/SECURITY_POLICY.md`](../../SECURITY_POLICY.md)  
> **Overall Verdict:** `PASS`

---

## 1. Executive Summary

Independent static code review, route metadata verification, and live PostgreSQL 18 + Memurai/Redis integration testing of Phase 04 (**Inventory Ledger & Storefront/Guest Cart**) confirm that all security controls, authorization boundaries, idempotency guarantees, transactional locking invariants, CSRF protections, and error-sanitization safeguards are enforced with **0 vulnerabilities** and **0 test failures**.

- **Route Auth Metadata Audit (`pnpm --filter @arven/api check:auth-metadata`):** Passed with `0` violations across all registered NestJS controllers and handlers.
- **Live API & Security Test Suite (`pnpm --filter @arven/api test`):** `10` test files passed, `47` tests passed (`5.43s`), including live PostgreSQL 18 + Memurai integration tests in `test/security/inventory-cart-integration.test.ts` (`4` tests) and `test/security/catalog-integration.test.ts` (`3` tests), plus unit/security suites covering crypto/MFA, guards/throttler/redaction, idempotency, and HTTP envelopes.

---

## 2. Verified Phase 04 Security Invariants

### 2.1 Admin Inventory Ledger & Idempotency Controls

Verified across [`inventory.controller.ts`](../../../apps/api/src/modules/inventory/inventory.controller.ts), [`inventory.service.ts`](../../../apps/api/src/modules/inventory/inventory.service.ts), [`idempotency.service.ts`](../../../apps/api/src/common/http/idempotency.service.ts), [`inventory.ts`](../../../packages/validators/src/inventory.ts), and [`migration.sql`](../../../packages/database/prisma/migrations/20261115000000_init_arven_schema/migration.sql):

| Control / Invariant | Verified Implementation | Status |
|---|---|---|
| **Admin Scope & MFA Enforcement** | `AdminInventoryController` (`@Controller('admin')`) declares class-level `@AdminAuth()`, enforced by global `SessionAuthGuard` + `MfaEnforcementGuard` (`SessionScope.ADMIN`, non-null `mfaVerifiedAt`, active admin role check). | `PASS` |
| **RBAC Permission Boundaries** | `GET /admin/inventory/levels`, `GET /admin/inventory/movements`, and `GET /admin/inventory/reservations` require `@RequirePermissions('inventory.read')`. `POST /admin/stock-movements` requires `@RequireAnyPermission('inventory.receive', 'inventory.adjust')`. | `PASS` |
| **Runtime Action-Type Split** | `InventoryService.createStockMovement` enforces `RECEIPT` -> `inventory.receive` and `ADJUSTMENT` -> `inventory.adjust`, throwing `403 FORBIDDEN` (`DomainHttpException`) if an actor lacks the specific sub-permission. | `PASS` |
| **Strict DTO Validation** | `createAdminStockMovementSchema` uses `z.strictObject(...)`, rejecting unknown fields, disallowing `quantityDelta === 0`, bounding delta `[-100_000, 100_000]`, requiring positive delta for `RECEIPT`, and requiring `reason` (`>= 3` chars) for `ADJUSTMENT`. | `PASS` |
| **Mandatory `Idempotency-Key` & Payload Hash** | `IdempotencyService.execute` validates `Idempotency-Key` with `idempotencyKeySchema` (`16-128` chars, `[a-zA-Z0-9._:-]+`, else `400 INVALID_IDEMPOTENCY_KEY`), hashes canonical sorted JSON via `sha256CanonicalPayload`, and keys records by `(idempotencyKey, actorScope: "admin:" + actor.userId, route: "POST:/api/v1/admin/stock-movements")`. | `PASS` |
| **Conflict, Replay & Failure Recovery** | Payload hash mismatch throws `409 IDEMPOTENCY_CONFLICT`. Active `IN_PROGRESS` sets `Retry-After: 2` (`IDEMPOTENCY_POLICY.IN_PROGRESS_RETRY_AFTER_SECONDS`) and throws `409 IDEMPOTENCY_IN_PROGRESS`. Completed replays return stored status/body with `Idempotent-Replayed: true`. Thrown errors clean up `IN_PROGRESS` rows via `deleteMany` so keys do not wedge. | `PASS` |
| **Row Locking & Ledger Consistency** | Inside `prisma.withTransaction`, `SELECT ... FROM inventory_levels WHERE warehouse_id = ... AND variant_id = ... FOR UPDATE` serializes updates (with atomic `INSERT ... ON CONFLICT DO NOTHING` + re-lock on uninitialized rows). Enforces `nextOnHand >= 0 && nextOnHand >= currentReserved` (`409 INSUFFICIENT_STOCK`), backed by PostgreSQL `CHECK` constraints (`chk_inventory_on_hand_nonneg`, `chk_inventory_reserved_nonneg`, `chk_inventory_reserved_lte_on_hand`). | `PASS` |
| **Immutable Ledger, Audit & Outbox** | Same transaction appends `inventory_movements`, writes scrubbed `audit_logs` (`inventory.movement.created`, `markAuditRecordedInTransaction(req)`), and enqueues `outbox_events` (`inventory.received` on `RECEIPT`). | `PASS` |
| **SQL Parameterization** | `InventoryService.listInventoryLevels` uses `Prisma.sql` tagged template interpolation and `escapeLikePattern` for `ILIKE` search queries (`q` bounded to `<= 120` chars). | `PASS` |

### 2.2 Cart Ownership, CSRF, Price Integrity & Guest Merge

Verified across [`cart.controller.ts`](../../../apps/api/src/modules/cart/cart.controller.ts), [`cart.service.ts`](../../../apps/api/src/modules/cart/cart.service.ts), [`csrf.guard.ts`](../../../apps/api/src/common/security/guards/csrf.guard.ts), [`cart.ts`](../../../packages/validators/src/cart.ts), and [`constants.ts`](../../../packages/config/src/constants.ts):

| Control / Invariant | Verified Implementation | Status |
|---|---|---|
| **Session / Guest Ownership Scoping** | Authenticated customer resolution uses `sessionStore.resolveFromRequest(req, [SessionScope.CUSTOMER])` strictly (admin cookies cannot resolve as customer carts). Guest carts use `arven_guest_cart` (or `__Host-arven_guest_cart` when `COOKIE_SECURE=true`) minted from `32` CSPRNG bytes (`CART_POLICY.GUEST_TOKEN_BYTES`), stored solely as `SHA-256` hex (`guestTokenHash`) in `carts`, with `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, `secure: config.COOKIE_SECURE`, `maxAge: 30 days`. | `PASS` |
| **CSRF & Origin Enforcement** | Global `CsrfGuard` protects `POST /cart/items`, `PATCH /cart/items/:id`, `DELETE /cart/items/:id`, and `POST /cart/merge`: verifies `Origin`/`Referer` against `CORS_ALLOWED_ORIGINS` when present and validates `X-CSRF-Token` via `timingSafeEqual` against active session `csrfSecret` or pre-auth CSRF cookie (`verifyPreAuthCsrf`). | `PASS` |
| **Cross-Cart IDOR Prevention** | `updateItem` (`where: { id: itemId, cartId }`) and `deleteItem` (`deleteMany({ where: { id: itemId, cartId } })`) scope directly to the caller's resolved active `cartId`, returning `404 CART_ITEM_NOT_FOUND` on cross-cart attempts or unknown items. `:id` path params require valid UUIDs (`uuidSchema`). | `PASS` |
| **Authoritative Pricing & Stock** | `addCartItemRequestSchema` and `updateCartItemRequestSchema` use `z.strictObject(...)` without price/discount/user fields. `CartService` always computes IDR prices, discounts, product/variant publishability, and active-warehouse stock from PostgreSQL, capping additions at `CART_POLICY.MAX_LINE_QUANTITY` (`99`) and rejecting unavailable/oversubscribed items (`400`/`409`). | `PASS` |
| **Authenticated Merge (`POST /cart/merge`)** | Strictly decorated with `@CustomerAuth()` + `@AuditAction('cart.merged', 'cart')`. Locks active guest cart via `SELECT id, status FROM carts WHERE id = ... AND status = 'ACTIVE' FOR UPDATE`, skips unavailable items with notices, caps merged quantities at `min(availableQty, 99)`, deletes guest items, marks guest cart `MERGED` (`mergedIntoCartId`), writes `audit_logs`, and clears the guest cart cookie in `finally`. | `PASS` |

### 2.3 Error Sanitization, Logging Redaction & BFF Proxy Hygiene

Verified across [`global-exception.filter.ts`](../../../apps/api/src/common/http/global-exception.filter.ts), [`redaction.ts`](../../../packages/observability/src/redaction.ts), [`audit-log.service.ts`](../../../apps/api/src/modules/audit-notifications/audit-log.service.ts), [`apps/storefront/src/proxy.ts`](../../../apps/storefront/src/proxy.ts), and [`apps/admin/src/proxy.ts`](../../../apps/admin/src/proxy.ts):

- **Error Envelope Sanitization:** `GlobalExceptionFilter` maps Prisma `P2002`/`P2025`/`P2003` errors to sanitized domain codes (`CONFLICT`, `RESOURCE_NOT_FOUND`, `REFERENCE_CONFLICT`) and masks all `status >= 500` errors to `"An unexpected internal error occurred"` (`INTERNAL_ERROR`) with `requestId` correlation only — zero raw SQL messages, stack traces, or credentials in HTTP responses.
- **Log & Audit Redaction:** Pino `ARVEN_REDACT_PATHS` redacts cookies, authorization headers, CSRF tokens, passwords, tokens, MFA/TOTP secrets, payment keys, and PII fields; `scrubSensitiveMetadata` masks email/phone values and redacts secret keys before writing `audit_logs` or error logs.
- **XSS / CSP & Same-Origin Proxying:** Storefront and Admin `proxy.ts` rewrite `/api/v1/*` on same-origin with explicit `x-arven-portal` (`customer` / `admin`) provenance headers and apply per-request nonce CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy`. Search across Phase 04 Storefront/Admin/API modules found `0` `dangerouslySetInnerHTML`, `innerHTML`, `eval(`, or `process.env` leaks in client bundles.

---

## 3. Executed Commands & Test Results

| Command | Scope | Result | Observed Output Summary |
|---|---|---|---|
| `pnpm --filter @arven/api check:auth-metadata` | All NestJS controllers & routes in `apps/api` | `PASS` (exit `0`) | `Route auth metadata check passed with zero violations.` |
| `pnpm --filter @arven/api test` | Full `@arven/api` Vitest suite (`test/**/*.test.ts`) against live PostgreSQL 18 + Memurai (`redis://127.0.0.1:6379/14` & `/15`) | `PASS` (exit `0`) | **10 test files passed, 47 tests passed** (`5.43s`):<br>- `test/unit/adapters.test.ts` (5)<br>- `test/unit/http-envelope.test.ts` (4)<br>- `test/unit/idempotency-helper.test.ts` (5)<br>- `test/catalog.service.test.ts` (4)<br>- `test/unit/users-roles-audit.test.ts` (6)<br>- `test/unit/health.controller.test.ts` (4)<br>- `test/security/crypto-mfa.test.ts` (7)<br>- `test/security/guards-throttler-redaction.test.ts` (5)<br>- `test/security/catalog-integration.test.ts` (3)<br>- `test/security/inventory-cart-integration.test.ts` (4) |

*(Informational note: [`vitest.config.ts`](../../../apps/api/vitest.config.ts) matches `test/**/*.test.ts`, so legacy `test/security/auth-pg.integration.ts` is not included in `pnpm --filter @arven/api test`.)*

### 3.1 Post-Accessibility-Repair Freshness Verification

Verified after Stage 5 (`accessibility-qa-agent`) completed:
- `git status --short apps/api packages` confirmed zero backend/package changes occurred after `check:auth-metadata` and `pnpm --filter @arven/api test` passed.
- Inspected the Stage 5 accessibility UI repair (`apps/storefront/src/components/storefront-shell.tsx`, `apps/storefront/src/components/cart/cart-view.tsx`, `apps/storefront/src/app/cart/page.tsx`, `apps/admin/src/components/inventory/inventory-workspace.tsx`): semantic/ARIA-only updates (`sr-only` item count label, `<dl>` structure, `aria-describedby`, tablist keyboard roving focus) with zero `dangerouslySetInnerHTML`, `innerHTML`, or `eval(` sinks.

---

## 4. Security Gate Determination

- **Findings:** `0` Critical, `0` High, `0` Medium, `0` Low vulnerabilities.
- **Checkpoint `security` Verdict:** **`PASS`** (subject to coordinator-orchestrated harness gate recording).
