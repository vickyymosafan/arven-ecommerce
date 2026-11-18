# ARVEN Phase 05 — Security & Policy Governance Brief

> **Phase:** Phase 05 — Checkout Quote, Order State Machine, Midtrans Payment & Expiry Worker  
> **Plan ID:** `7046df9d-13df-413d-b6ae-2ebaaaa6ddd9`  
> **Task ID:** `c4baf10d-a38e-4459-8c15-f0fc65163d5d` (`governance-lead`)  
> **Baseline Sources:** [`docs/SECURITY_POLICY.md`](../../SECURITY_POLICY.md), [`docs/API_CONTRACTS.md`](../../API_CONTRACTS.md) (§§5–8), [`docs/DATA_MODEL.md`](../../DATA_MODEL.md) (§§5–7), [`docs/PRD_AND_BUSINESS_RULES.md`](../../PRD_AND_BUSINESS_RULES.md) (§§4–5)

---

## 1. Deny-by-Default Auth & Resource Ownership Matrix (Phase 05 Endpoints)

Every NestJS handler MUST carry explicit auth metadata (`checkRouteAuthMetadata` fails startup if missing). Global guard order: `ArvenThrottlerGuard` → `CsrfGuard` → `SessionAuthGuard` → `MfaEnforcementGuard` → `PermissionGuard`.

| Endpoint | NestJS Auth Decorator | Allowed Caller(s) | Mandatory Ownership & Input Authority Rules |
|---|---|---|---|
| `POST /api/v1/checkout/quote` | `@Public()` | Guest or `CUSTOMER` session (`__Host-arven_sid` / `arven_sid`) | Resolve `CUSTOMER` scope via `SessionStoreService.resolveFromRequest(req, [SessionScope.CUSTOMER])`. If authenticated and `addressId` supplied, scope query `WHERE id = :addressId AND user_id = :actorUserId AND deleted_at IS NULL`. `.strict()` Zod schema forbids client prices, discounts, totals, or status; server recomputes authoritative `product_variants.price_idr`, active status, coupon rules, shipping, and `quoteExpiresAt`. |
| `POST /api/v1/checkout/orders` | `@Public()` | Guest or `CUSTOMER` session | Resolve `CUSTOMER` session if present (`user_id = actor.userId`, scoped `addressId` check). If unauthenticated guest (`user_id = null`), require `guestEmail` + `guestAddress` and generate `guestToken` (CSPRNG ≥ 32 bytes → `orders.guest_token_hash`). Enforce `chk_order_owner_or_guest`. Never trust client prices, discounts, totals, `userId`, or `status`. |
| `GET /api/v1/orders` | `@CustomerAuth()` | Authenticated `CUSTOMER` only | Fail closed (`401`) if no valid `CUSTOMER` session (admin cookie rejected). Repository query MUST filter directly `WHERE user_id = :actorUserId`. |
| `GET /api/v1/orders/:orderNumber` | `@Public()` | Order owner (`CUSTOMER`) **or** Guest Token bearer | Never expose order/PII by `orderNumber` alone (`T-02`). Require **either** `CUSTOMER` session matching `orders.user_id === actor.userId` **or** `orders.user_id IS NULL` + valid `X-Guest-Order-Token` matching `orders.guest_token_hash`. Missing proof → `401 UNAUTHORIZED`; mismatch → `403 RESOURCE_OWNERSHIP_DENIED` (or `404 RESOURCE_NOT_FOUND` with zero victim metadata). |
| `POST /api/v1/orders/:id/cancel` | `@Public()` (if guest-token cancel allowed) or `@PortalAuth()` | Order owner (`CUSTOMER`), verified Guest Token bearer (guest order), or `ADMIN` with `order.cancel` + MFA (Phase 06) | Verify ownership in DB (`orders.id = :id` AND (`user_id = :actorUserId` OR verified `X-Guest-Order-Token`)). Phase 05 self-service cancel is permitted **only** when `orders.status === 'PENDING_PAYMENT'` (`409 INVALID_STATE_TRANSITION` otherwise). Releases `ACTIVE` `stock_reservations` + appends `RELEASE` movement atomically. |
| `POST /api/v1/payments/:orderId/session` | `@Public()` | Order owner (`CUSTOMER`) **or** Guest Token bearer | Scope `orders` lookup by `:orderId` + ownership (`user_id === actor.userId` OR valid `X-Guest-Order-Token`). Reject non-`PENDING_PAYMENT` or expired orders (`409`/`422`). Amount passed to `PaymentProvider.createSession` MUST come exclusively from `orders.grand_total_idr`. |
| `GET /api/v1/payments/:id` | `@Public()` | Order owner (`CUSTOMER`) **or** Guest Token bearer | Join/load parent `orders` row and enforce identical ownership proof (`order.user_id === actor.userId` OR valid `X-Guest-Order-Token`). Return sanitized payment DTO only (`Cache-Control: no-store`); never return raw gateway secrets. |
| `POST /api/v1/payments/webhooks/:provider` | `@Public()` + `@SkipCsrf()` | Payment provider server-to-server (`midtrans` / non-prod `local_stub`) | Only `/webhook` routes may use `@SkipCsrf()`. Zero session auth; authenticated exclusively via cryptographic `SHA512` signature + `PaymentProvider.getStatus()` server double-check. |

> **Headers & Caching:** All Phase 05 endpoints MUST return `Cache-Control: no-store` and propagate `X-Request-Id` / `meta.requestId`.

---

## 2. `Idempotency-Key`, `CsrfGuard`, `@Throttle`, Guest Capability Token & Constant-Time Rules

### 2.1 `Idempotency-Key` Enforcement (`API_CONTRACTS.md` §6)
- **Mandatory Endpoints:** `POST /checkout/orders`, `POST /orders/:id/cancel`, `POST /payments/:orderId/session`.
- **Format:** `Idempotency-Key` header (`16..128` chars, `idempotencyKeySchema`). Missing or malformed → `400 INVALID_IDEMPOTENCY_KEY`.
- **Actor Isolation (`actorScope`):**
  - Authenticated user: `user:<userId>`.
  - Unauthenticated guest: scoped per caller identity (e.g., `guest:<sha256(guestToken || guestCartCookie || clientKey)>`), never a shared global `'guest'` bucket.
- **Canonical Request Hash & Route Binding:**
  - `requestHash = SHA256(canonicalPayload)` bound to `(idempotency_key, actor_scope, route)`.
  - Include route params (e.g., `:id`, `:orderId`) in `route` or hashed payload so reusing a key across different order IDs returns `409 IDEMPOTENCY_CONFLICT`.
- **Conflict Semantics:**
  - Payload/route hash mismatch → `409 IDEMPOTENCY_CONFLICT` (never execute mutation).
  - Concurrent `IN_PROGRESS` → `409 IDEMPOTENCY_IN_PROGRESS` + `Retry-After: 2`.
  - `COMPLETED` replay → stored `response_status` + `response_body` + `Idempotent-Replayed: true` header.

### 2.2 `CsrfGuard` Requirements (`API_CONTRACTS.md` §5, `SECURITY_POLICY.md` §3.2)
- Enforced on **all** Phase 05 `POST` mutations (`POST /checkout/quote`, `POST /checkout/orders`, `POST /orders/:id/cancel`, `POST /payments/:orderId/session`) **except** `POST /payments/webhooks/:provider` (`@SkipCsrf()`).
- Verifies **both** (1) exact `Origin`/`Referer` allowlist match (`CORS_ALLOWED_ORIGINS`) when present, and (2) `X-CSRF-Token` against either the active session `csrfSecret` (`TokenCryptoService.verifySessionCsrfToken`) or the pre-auth HMAC CSRF cookie (`TokenCryptoService.verifyPreAuthCsrf` initialized via `GET /api/v1/csrf-token` for guest flows).
- `apps/api/src/main.ts` CORS `allowedHeaders` MUST include `'X-Guest-Order-Token'` alongside `'X-CSRF-Token'` and `'Idempotency-Key'`.

### 2.3 `@Throttle` Profiles (`SECURITY_POLICY.md` §3.3, `ArvenThrottlerGuard`)
- Backed by Redis (`Memurai` / Redis 8) with baseline `120 req/min` per IP.
- **Strict Route Overrides:**
  - `POST /checkout/quote`, `POST /checkout/orders`, `POST /payments/:orderId/session`: **`15–20 req/min`** per actor/IP.
  - `POST /orders/:id/cancel`: **`15 req/min`** per actor/IP.
  - `GET /orders/:orderNumber`, `GET /payments/:id`: **`20–30 req/min`** per IP to mitigate `orderNumber` / `X-Guest-Order-Token` brute-force probing.

### 2.4 Guest Order Capability Token (`X-Guest-Order-Token`) & Constant-Time Comparison
- **Generation:** On guest `POST /checkout/orders`, generate `>= 32` CSPRNG bytes (`TokenCryptoService.generateOpaqueToken(32)` → 256-bit `base64url`).
- **Storage & Logging:** Store **only** `SHA-256(guestToken)` (64-char hex) in `orders.guest_token_hash`. Return plaintext `guestToken` **once** in the `201` creation response (and transactional order email); never log `guestToken`, `X-Guest-Order-Token`, `guest_token_hash`, or `guest_email` in application logs (`T-08`).
- **Transport Preference:** Require `X-Guest-Order-Token` header on API calls (avoid `?token=` query parameters on `/api/v1` calls to prevent URL/access-log leakage; storefront `/checkout/status/[orderNumber]` passes the token via header through the BFF/client fetch).
- **Constant-Time Verification:** Hash candidate token with `SHA-256` hex and compare against `orders.guest_token_hash` using `crypto.timingSafeEqual` (`TokenCryptoService.timingSafeEqualUtf8`, verifying identical non-zero byte length `64` prior to comparison).

---

## 3. Midtrans Webhook Security, Late-Settlement Safeguard & Cardholder Bans

**Endpoint:** `POST /api/v1/payments/webhooks/:provider` (strict mandatory order per `API_CONTRACTS.md` §7):

1. **Strict Payload Validation:** Require `order_id`, `status_code`, `gross_amount`, `transaction_status`, `transaction_id`, `signature_key` (`512 KB` body cap).
2. **Constant-Time `SHA512` Signature Check (`T-05`):**
   - Compute `expected = SHA512(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY)` (lowercase hex, 128 chars).
   - Compare against `payload.signature_key` using `crypto.timingSafeEqual` (checking equal buffer length first).
   - On mismatch: record redacted security warning (never log `MIDTRANS_SERVER_KEY` or raw signature) and return **`401 WEBHOOK_SIGNATURE_INVALID`** with **zero** DB mutation.
   - Non-production `local_stub` adapter MUST still enforce the same `SHA512` `timingSafeEqual` signature contract using a test signing key.
3. **Unique Event Deduplication (`payment_events`):**
   - Deterministic `providerEventId = "${payload.transaction_id}:${payload.transaction_status}:${payload.status_code}"`.
   - `INSERT INTO payment_events (provider, provider_event_id, ...)` guarded by `UNIQUE(provider, provider_event_id)`.
   - On unique constraint violation (`P2002` / `23505`): return **`200 OK`** (`{ acknowledged: true, duplicate: true }`) immediately without re-executing stock or order transitions.
4. **Server-to-Server `PaymentProvider.getStatus()` Double-Check:**
   - Call Midtrans `GET /v2/{order_id}/status` over HTTPS (`<= 10s` timeout, allowlisted Midtrans hostnames only) to verify live `transaction_status`, `fraud_status`, and exact `gross_amount === payments.amount_idr` before committing state.
5. **Transactional State Commit / Release (`SELECT ... FOR UPDATE`):**
   - `settlement` / `capture (accept)` on `PENDING_PAYMENT`: `PaymentStatus -> SETTLEMENT`, `OrderStatus -> PAID`, `stock_reservations (ACTIVE -> COMMITTED)`, deduct `inventory_levels` (`quantity_on_hand - qty`, `quantity_reserved - qty`) + append `inventory_movements (SALE, -qty)`, emit `payment.succeeded` in `outbox_events`.
   - `deny` / `cancel` / `expire` on `PENDING_PAYMENT`: `PaymentStatus -> FAILED/EXPIRED`, `OrderStatus -> EXPIRED/CANCELLED`, release `stock_reservations (ACTIVE -> RELEASED/EXPIRED)`, decrement `inventory_levels.quantity_reserved` + append `inventory_movements (RELEASE, -qty)`, emit `payment.failed` in `outbox_events`.
6. **Late-Settlement-After-Expiry Safeguard:**
   - If a verified `settlement`/`capture` arrives after `orders.status` / `stock_reservations.status` is already `EXPIRED` (or `CANCELLED`), **NEVER** transition `EXPIRED -> PAID` or deduct unreserved `inventory_levels` (preventing oversell).
   - Persist the `payment_events` row, update/flag `payments` with late-settlement metadata, and emit a critical `outbox_events` alert / manual refund-exception task for operator resolution.
7. **Strict Bans:**
   - **Browser Redirects Never Mutate State:** Storefront `/checkout/status/[orderNumber]` and Midtrans `finish`/`unfinish`/`error` redirects MUST NOT update `orders` or `payments`; they strictly poll `GET /api/v1/orders/:orderNumber`.
   - **Zero PAN / CVV / PIN Storage (`SECURITY_POLICY.md` §6.4):** Never collect, proxy through custom API forms, cache in Redis, log, or persist raw card PAN, CVV/CVC/CID, PIN, or magnetic-stripe data. All card entry stays inside Midtrans Snap; ARVEN persists only gateway references (`provider_reference`, `provider_transaction_id`, `method`, `status`, `amount_idr`, `snap_token`, `redirect_url`).

---

## 4. Sorted `variant_id ASC` Conditional SQL Lock (`T-04`) & Phase 06+ Exclusions

### 4.1 Atomic Stock Reservation & `T-04` 20-Way Oversell Gate (`DATA_MODEL.md` §7.1)
1. Aggregate duplicate variant quantities and sort line items strictly by **`variant_id ASC`** before executing SQL updates (prevents AB-BA deadlocks).
2. Inside `prisma.$transaction`, execute conditional SQL per sorted item:
   ```sql
   UPDATE inventory_levels
   SET quantity_reserved = quantity_reserved + $1,
       updated_at = NOW()
   WHERE warehouse_id = $2
     AND variant_id = $3
     AND (quantity_on_hand - quantity_reserved) >= $1
   RETURNING id, quantity_on_hand, quantity_reserved;
   ```
3. Require `affected_rows === 1`; on `0` rows, abort transaction and return **`409 VARIANT_OUT_OF_STOCK`** (reinforced by DB `CHECK` constraints `chk_inventory_reserved_lte_on_hand`, `chk_inventory_reserved_nonneg`, `chk_inventory_on_hand_nonneg`).
4. In the same DB transaction: insert `stock_reservations` (`ACTIVE`, synced `expires_at`), append `inventory_movements` (`RESERVATION`, `+qty`), insert `orders` (`PENDING_PAYMENT`), `order_items`, `order_status_history`, `coupon_redemptions` (atomic conditional `used_count` check), and `outbox_events` (`order.created`).
5. **`T-04` Pass Criteria:** With `quantity_on_hand = 1, quantity_reserved = 0`, 20 concurrent `POST /checkout/orders` requests using distinct `Idempotency-Key`s MUST result in **exactly 1** `201 Created`, **19** `409 VARIANT_OUT_OF_STOCK`, `quantity_reserved = 1`, `1` `ACTIVE` `stock_reservations` row, and `1` `RESERVATION` `inventory_movements` row.

### 4.2 Phase 06+ Exclusion Checklist (Hard Scope Boundary)
Do **NOT** implement any of the following in Phase 05:
- [ ] **No Returns:** No `POST /orders/:id/returns`, `GET /returns/:id`, `/admin/returns/*`, or return inspection flows.
- [ ] **No Refunds:** No `POST /admin/orders/:id/refunds/request`, `POST /admin/refunds/:id/approve`, `refund.approve` MFA step-up flows, or gateway refund payouts.
- [ ] **No Admin Order / Fulfillment / Shipment UI or Endpoints:** No `apps/admin` order grid/detail, `PAID -> PROCESSING -> READY_TO_SHIP` transitions, `POST /admin/orders/:id/shipments`, or tracking sync.
- [ ] **No Admin Coupon CRUD or CMS UI:** Only backend seed (`WELCOME10`) and server-side checkout coupon evaluation are in Phase 05; no `/admin/coupons` or Lookbook/Journal/Pages CMS UI.
- [ ] **No Phase 07–08 3D / WebGL Features:** No `packages/three-engine`, GLB viewers, Showroom, or Outfit Studio code on checkout/order routes.
