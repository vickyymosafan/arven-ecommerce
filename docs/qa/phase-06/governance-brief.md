# ARVEN Phase 06 — Security & Policy Governance Brief

> **Phase:** Phase 06 — Admin Operations Dashboard, Order Fulfillment & Shipments, Returns & Dual-Step Refunds, Coupons, CMS & Audit Logs  
> **Plan ID:** `c3f9e082-a528-4293-a98b-ad26d1a2dd87`  
> **Task ID:** `241f67f6-b952-4539-9840-ee4325875732` (`governance-lead`)  
> **Baseline Sources:** [`docs/SECURITY_POLICY.md`](../../SECURITY_POLICY.md) (§§3–6), [`docs/API_CONTRACTS.md`](../../API_CONTRACTS.md) (§§5–8), [`docs/PRD_AND_BUSINESS_RULES.md`](../../PRD_AND_BUSINESS_RULES.md) (§4.3), [`docs/DATA_MODEL.md`](../../DATA_MODEL.md) (§§3, 5, 6), [`packages/config/src/constants.ts`](../../../packages/config/src/constants.ts)

---

## 1. Global Guard Chain & Auth Metadata Invariants

Every NestJS controller and handler added in Phase 06 MUST obey the global guard execution order (`ArvenThrottlerGuard` → `CsrfGuard` → `SessionAuthGuard` → `MfaEnforcementGuard` → `PermissionGuard`) and pass `checkRouteAuthMetadata` at startup:

- **Admin Endpoints (`/api/v1/admin/*`):** MUST declare `@AdminAuth()` (`SessionScope.ADMIN` cookie `__Host-arven_admin_sid` / `arven_admin_sid`) + explicit `@RequirePermissions(...)` or `@RequireAnyPermission(...)`. `MfaEnforcementGuard` rejects unverified admin sessions (`mfaVerifiedAt === null`) with `401 MFA_REQUIRED`. Missing permission metadata on any `/admin/*` route fails closed with `403 FORBIDDEN`.
- **High-Risk Privileged Endpoints:** Must additionally declare `@RequireMfaStepUp(900)` (15-minute freshness window; expired step-up fails with `403 MFA_STEP_UP_REQUIRED`).
- **State-Changing Browser Endpoints (`POST`, `PATCH`, `PUT`, `DELETE`):** Must pass `CsrfGuard` (`Origin`/`Referer` allowlist + `X-CSRF-Token`). `@SkipCsrf()` is strictly forbidden on all Phase 06 routes (reserved exclusively for signed payment webhooks).
- **Caching & Correlation:** All `/admin/*`, `/orders/*`, and `/returns/*` responses MUST emit `Cache-Control: no-store` and `X-Request-Id` / `meta.requestId`. Public `/cms/*` GETs may use bounded caching only for `PUBLISHED` content.

---

## 2. Full 7-Role RBAC + `CUSTOMER` Matrix (Phase 06 Routes)

Legend: **Y** = Permitted | **Limited** = Permitted with strict PII/field/state bounds | **Owner/Token** = Permitted only for verified resource owner (`CUSTOMER` session or `X-Guest-Order-Token`) | **—** = Denied (`403 FORBIDDEN` for admin roles; `401`/`403` for `CUSTOMER` on `/admin/*`).

### 2.1 Admin Order, Fulfillment, Shipment & Analytics Routes

| Route | Auth & Permission Decorator(s) | `OWNER` | `MANAGER` | `PRODUCT` | `INVENTORY` | `ORDER` | `CONTENT` | `SUPPORT` | `CUSTOMER` |
|---|---|---|---|---|---|---|---|---|---|
| `GET /admin/orders` | `@AdminAuth()` + `@RequireAnyPermission('order.read', 'order.read.limited')` | **Y** | **Y** | **Y** | **Y** | **Y** | — | **Limited** | — |
| `GET /admin/orders/:id` | `@AdminAuth()` + `@RequireAnyPermission('order.read', 'order.read.limited')` | **Y** | **Y** | **Y** | **Y** | **Y** | — | **Limited** | — |
| `POST /admin/orders/:id/transition` *(fulfillment: `PAID -> PROCESSING -> READY_TO_SHIP`)* | `@AdminAuth()` + `@RequirePermissions('order.fulfill')` *(handler-enforced per target status)* | **Y** | **Y** | — | — | **Y** | — | — | — |
| `POST /admin/orders/:id/transition` *(cancel: `PENDING_PAYMENT -> CANCELLED` / pre-shipment policy)* | `@AdminAuth()` + `@RequirePermissions('order.cancel')` *(handler-enforced)* | **Y** | **Y** | — | — | **Y** | — | **Limited** | — |
| `POST /admin/orders/:id/shipments` | `@AdminAuth()` + `@RequirePermissions('order.fulfill')` | **Y** | **Y** | — | — | **Y** | — | — | — |
| `POST /admin/shipments/:id/sync-tracking` | `@AdminAuth()` + `@RequirePermissions('order.fulfill')` | **Y** | **Y** | — | — | **Y** | — | — | — |
| `GET /admin/analytics/sales` | `@AdminAuth()` + `@RequireAnyPermission('analytics.read', 'analytics.read.limited')` | **Y** | **Y** | — | — | **Y** | — | **Limited** | — |

> **Transition Authorization Guardrail:** `POST /admin/orders/:id/transition` MUST declare `@RequireAnyPermission('order.fulfill', 'order.cancel')` at the route level AND enforce permission-by-target-transition inside the service: transitions to `PROCESSING` / `READY_TO_SHIP` / `SHIPPED` / `DELIVERED` / `COMPLETED` require `order.fulfill` (blocking `SUPPORT`), while transitions to `CANCELLED` require `order.cancel`. `SUPPORT` with `order.cancel` is strictly blocked from cancelling orders in `SHIPPED`, `DELIVERED`, or `COMPLETED` states (`403 FORBIDDEN` / `409 INVALID_STATE_TRANSITION`).

### 2.2 Admin Returns, Dual-Step Refunds & Coupons Routes

| Route | Auth & Permission Decorator(s) | `OWNER` | `MANAGER` | `PRODUCT` | `INVENTORY` | `ORDER` | `CONTENT` | `SUPPORT` | `CUSTOMER` |
|---|---|---|---|---|---|---|---|---|---|
| `GET /admin/returns` | `@AdminAuth()` + `@RequirePermissions('return.read')` | **Y** | **Y** | — | **Y** | **Y** | — | **Limited** | — |
| `GET /admin/returns/:id` | `@AdminAuth()` + `@RequirePermissions('return.read')` | **Y** | **Y** | — | **Y** | **Y** | — | **Limited** | — |
| `POST /admin/returns/:id/review` | `@AdminAuth()` + `@RequirePermissions('return.review')` | **Y** | **Y** | — | — | — | — | **Y** | — |
| `POST /admin/returns/:id/approve` | `@AdminAuth()` + `@RequirePermissions('return.approve')` | **Y** | **Y** | — | — | — | — | — | — |
| `POST /admin/returns/:id/receive` | `@AdminAuth()` + `@RequirePermissions('return.inspect')` | **Y** | **Y** | — | **Y** | — | — | — | — |
| `GET /admin/refunds` | `@AdminAuth()` + `@RequireAnyPermission('refund.request', 'refund.approve')` | **Y** | **Y** | — | — | **Y** | — | **Limited** | — |
| `POST /admin/orders/:id/refunds/request` | `@AdminAuth()` + `@RequirePermissions('refund.request')` + `Idempotency-Key` | **Y** | **Y** | — | — | **Y** | — | **Y** | — |
| `POST /admin/refunds/:id/approve` | `@AdminAuth()` + `@RequirePermissions('refund.approve')` + `@RequireMfaStepUp(900)` + `Idempotency-Key` | **Y** | — | — | — | — | — | — | — |
| `GET /admin/coupons` | `@AdminAuth()` + `@RequirePermissions('coupon.read')` | **Y** | **Y** | **Y** | — | **Y** | — | **Y** | — |
| `POST / PATCH / DELETE /admin/coupons*` | `@AdminAuth()` + `@RequirePermissions('coupon.manage')` | **Y** | **Y** | — | — | — | — | — | — |

### 2.3 Admin & Public CMS + Customer Return Routes

| Route | Auth & Permission Decorator(s) | `OWNER` | `MANAGER` | `PRODUCT` | `INVENTORY` | `ORDER` | `CONTENT` | `SUPPORT` | `CUSTOMER` / Guest |
|---|---|---|---|---|---|---|---|---|---|
| `GET /admin/cms/pages*`, `lookbooks*`, `journal*` | `@AdminAuth()` + `@RequirePermissions('cms.read')` | **Y** | **Y** | **Y** | — | — | **Y** | — | — |
| `POST / PATCH / DELETE /admin/cms/*` | `@AdminAuth()` + `@RequirePermissions('cms.write')` | **Y** | **Y** | — | — | — | **Y** | — | — |
| `POST /admin/cms/*/:id/transition` (`DRAFT <-> PREVIEW`) | `@AdminAuth()` + `@RequirePermissions('cms.write')` | **Y** | **Y** | — | — | — | **Y** | — | — |
| `POST /admin/cms/*/:id/transition` (`-> PUBLISHED / ARCHIVED`) | `@AdminAuth()` + `@RequirePermissions('cms.publish')` | **Y** | **Y** | — | — | — | **Y** | — | — |
| `GET /cms/pages/:slug`, `/cms/lookbooks*`, `/cms/journal*` | `@Public()` (`PUBLISHED` + `deleted_at IS NULL` only) | **Y** | **Y** | **Y** | **Y** | **Y** | **Y** | **Y** | **Y** (Public) |
| `POST /orders/:id/returns` | `@Public()` (session or guest token proof) + `Idempotency-Key` | — | — | — | — | — | — | — | **Owner / Token** |
| `GET /returns/:id` | `@Public()` or `@PortalAuth()` (ownership or `SUPPORT` `return.read`) | **Y*** | **Y*** | — | — | — | — | **Limited*** | **Owner / Token** |

> \* For `GET /returns/:id`, `CUSTOMER` / Guest Token callers are strictly scoped by `return.user_id === actor.userId` or parent `order.guest_token_hash` verification (`X-Guest-Order-Token`). If an `ADMIN` session accesses `GET /returns/:id`, it MUST satisfy `MfaEnforcementGuard`, hold `return.read` (for `SUPPORT` triage or admin verification), and apply `SUPPORT` PII masking; admins should preferentially use `GET /admin/returns/:id`.

---

## 3. PII Masking & Payment Gateway Redaction Rules

Per `SECURITY_POLICY.md` §6.2 and Threat `T-08`, API response DTO serializers MUST enforce role-based field projection (never serialize raw Prisma models):

### 3.1 `SUPPORT` Limited View (`order.read.limited` + `analytics.read.limited`) vs. Operational View (`order.read` + `analytics.read`)

| Data Element | `OWNER` / `MANAGER` / `ORDER` (`order.read`, `analytics.read`) | `SUPPORT` (`order.read.limited`, `analytics.read.limited`) | `PRODUCT` / `INVENTORY` / `CONTENT` |
|---|---|---|---|
| **Customer Email** | Full operational email (only on order/customer operational endpoints) | **Masked** (`a***@domain.com`, preserving first character + domain) | Denied on customer endpoints; omitted or masked if non-customer domain |
| **Customer / Recipient Phone** | Full operational phone (`ORDER`/`MANAGER`/`OWNER` for fulfillment/exception handling) | **Masked** (`****5678`, last 4 digits only) | Denied / omitted |
| **Shipping Address (`address_snapshot`)** | Full recipient name, address lines, subdistrict, city, province, postal code | **Masked street/recipient in list views** (city, province, postal code + masked recipient/line; full ticket view only if permitted & audit-logged) | `PRODUCT`/`INVENTORY` have `order.read` for warehouse/SKU fulfillment context, zero access to `/admin/customers` (`customer.read` denied) |
| **Payment & Gateway Metadata** | Sanitized payment/refund summary (`provider`, `method`, `status`, `amountIdr`, `providerReference`, `settledAt`). Never expose `MIDTRANS_SERVER_KEY`, `signature_key`, or raw auth credentials. | **Gateway-redacted:** `provider`, `method`, `status`, `amountIdr`, `settledAt` only. **Strip** `snap_token`, `redirect_url`, `payment_events.payload`, and `refunds.gateway_response`. | Gateway payloads stripped |
| **Sales Analytics (`GET /admin/analytics/sales`)** | Full KPIs: gross/net sales IDR, AOV, conversion metrics, payment success rate, return rate, cohort trends | **Limited KPIs (`analytics.read.limited`):** Order-volume counts, fulfillment status/SLA breakdown, and return counts only. **Suppress** revenue/margin breakdowns, financial exports (`analytics.export` is `OWNER`-only), and all PII. | Denied (`403 FORBIDDEN`) |
| **Tokens & Secrets** | **Never returned anywhere:** `password_hash`, `mfa_secret_encrypted`, `token_hash`, `csrf_secret`, `guest_token_hash` | **Never returned anywhere** | **Never returned anywhere** |

### 3.2 Logging & Audit Redaction
- Central Pino logger MUST redact `cookie`, `authorization`, `x-csrf-token`, `x-guest-order-token`, `password*`, `token*`, `secret*`, `signature*`, `email`, `phone`, and `address*`.
- `audit_logs.before_state` and `audit_logs.after_state` MUST store structural IDs, state transitions, and integer IDR amounts while excluding raw credentials, session tokens, and payment gateway secrets.

---

## 4. Dual-Step Refund Separation of Duties

Refunds enforce mandatory two-stage authorization (`REFUND_REQUEST -> REFUND_APPROVE`) with separate permission codes, actor attribution, and `OWNER`-only cryptographic step-up:

### 4.1 Step 1 — Refund Request (`POST /api/v1/admin/orders/:id/refunds/request`)
- **Authorization:** `@AdminAuth()` + `@RequirePermissions('refund.request')` (`OWNER`, `MANAGER`, `ORDER`, `SUPPORT`).
- **Headers & Validation:** Requires `Idempotency-Key` (`400 INVALID_IDEMPOTENCY_KEY`), `X-CSRF-Token`, and `.strict()` Zod schema (`amountIdr`, `reason`, optional `returnId`). Rejects any client-supplied `status`, `requestedBy`, `approvedBy`, or `providerRefundId`.
- **Transactional Bounds (inside `prisma.$transaction` with `SELECT ... FOR UPDATE` on `orders` and `payments`):**
  1. Verify a settled `payments` record exists (`status IN ('SETTLEMENT', 'PARTIALLY_REFUNDED', 'REFUND_PENDING')`) and `orders.status` is eligible (`PAID`, `PROCESSING`, `READY_TO_SHIP`, `SHIPPED`, `DELIVERED`, `COMPLETED`, `RETURN_APPROVED`, `RETURNED`, `PARTIALLY_REFUNDED`).
  2. If `returnId` is provided, verify `returns.order_id === order.id` and `returns.status IN ('APPROVED', 'RECEIVED')`.
  3. Calculate `totalPaidIdr` (sum of settled payment `amount_idr`) and `committedRefundsIdr` (`SUM(refunds.amount_idr)` where `order_id = order.id` and `status IN ('REQUESTED', 'APPROVED', 'PROCESSING', 'SUCCEEDED')`).
  4. Enforce **`1 <= amountIdr <= (totalPaidIdr - committedRefundsIdr)`**; violations fail with `422` (`REFUND_AMOUNT_EXCEEDS_PAID`).
  5. Insert `refunds` with `status = 'REQUESTED'`, `requested_by = actor.userId`, `approved_by = null`, and unique `refund_key`.
  6. Write `audit_logs` (`action = 'refund.requested'`, `resource = 'refund'`, `resource_id = refund.id`, `after_state = { orderId, returnId, amountIdr, reason, requestedBy: actor.userId, status: 'REQUESTED' }`).

### 4.2 Step 2 — Refund Approval & Payout (`POST /api/v1/admin/refunds/:id/approve`)
- **Authorization:** `@AdminAuth()` + `@RequirePermissions('refund.approve')` + **`@RequireMfaStepUp(900)`**.
  - **Strict `OWNER` Exclusivity:** Only `OWNER` holds `refund.approve`. `MANAGER`, `ORDER`, and `SUPPORT` MUST fail with `403 FORBIDDEN`.
  - **Step-Up Freshness:** If `Date.now() - actor.mfaVerifiedAt.getTime() > 900_000`, `MfaEnforcementGuard` MUST fail with `403 MFA_STEP_UP_REQUIRED`.
- **Headers & Validation:** Requires `Idempotency-Key` and `X-CSRF-Token`.
- **Transactional Execution & Separation of Duties:**
  1. Lock `refunds`, `orders`, and `payments` rows (`FOR UPDATE`). Require `refund.status === 'REQUESTED'` (`409 INVALID_STATE_TRANSITION` otherwise).
  2. Re-verify `refund.amount_idr <= totalPaidIdr - otherCommittedRefundsIdr` (`422` if race/duplicate exceeded bound).
  3. Set `approved_by = actor.userId` (preserving `requested_by` untouched as the original requester).
  4. Execute `PaymentProvider.refund(...)` (or transition `APPROVED -> PROCESSING -> SUCCEEDED` / `FAILED` atomically with gateway response persistence).
  5. On `SUCCEEDED`:
     - Update `refunds` (`status = 'SUCCEEDED'`, `approved_by = actor.userId`, `completed_at = NOW()`).
     - Compute cumulative succeeded refund total; transition `payments.status` and `orders.status` to `PARTIALLY_REFUNDED` (if `< totalPaidIdr`) or `REFUNDED` (if `=== totalPaidIdr`), appending `order_status_history`.
     - If `refund.return_id` is present and return is `APPROVED`/`RECEIVED`, transition `returns.status -> REFUNDED`.
     - Insert `outbox_events` (`event_type = 'refund.completed'`).
  6. **Mandatory Dual-Actor Audit Log:** Insert `audit_logs` (`action = 'refund.approved'`) explicitly recording **both `requestedBy: refund.requestedBy` and `approvedBy: actor.userId`**, `amountIdr`, `orderId`, `providerRefundId`, `beforeState`, and `afterState`.

---

## 5. Return Ownership, Quantity Bounds, Restock Atomicity & CMS Separation

### 5.1 Customer Return Submission (`POST /api/v1/orders/:id/returns`)
- **Ownership Verification (`T-02`):**
  - Authenticated flow: `CUSTOMER` session where `orders.user_id === actor.userId`.
  - Guest flow: `orders.user_id IS NULL` AND constant-time `X-Guest-Order-Token` (`SHA-256` + `timingSafeEqual` against `orders.guest_token_hash`).
  - Mismatches return `403 RESOURCE_OWNERSHIP_DENIED` / `404 RESOURCE_NOT_FOUND` with zero victim data leaked.
- **Eligibility & Idempotency:** Requires `Idempotency-Key` + `CsrfGuard`. Order MUST be `DELIVERED` (or within active post-delivery return window; expired window returns `422 RETURN_WINDOW_EXPIRED`).
- **Item Ownership & Quantity Bounds:**
  - Every `items[i].orderItemId` MUST belong to `orders.id` (`order_items.order_id === order.id`). Foreign `orderItemId`s fail with `403`/`422`.
  - Duplicate `orderItemId` entries in a single request are rejected (`400`/`422`).
  - For each `orderItemId`, compute `alreadyReturnedQty` across all non-rejected returns (`status IN ('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'RECEIVED', 'REFUNDED', 'CLOSED')`).
  - Enforce **`1 <= requestedQty <= (orderItem.quantity - alreadyReturnedQty)`**; over-quantity requests fail with `422 RETURN_QUANTITY_EXCEEDED`.
  - Atomically create `returns` (`REQUESTED`), `return_items`, update `orders.status -> RETURN_REQUESTED` + `order_status_history`, and insert `return.requested` in `outbox_events`.

### 5.2 Return Inspection & `RETURN_TO_STOCK` Restock Atomicity (`POST /api/v1/admin/returns/:id/receive`)
- **State Guard (`PRD_AND_BUSINESS_RULES.md` §4.3):** Only `APPROVED` returns may transition to `RECEIVED` (`POST /admin/returns/:id/receive`, permission `return.inspect`). Lock `returns` row `FOR UPDATE` inside `prisma.$transaction` to prevent duplicate physical receipt/restock.
- **Conditional Restock Rule:**
  - Each `return_item` records `condition` (`UNOPENED | GOOD | DAMAGED | DEFECTIVE`).
  - **Only** items with `condition IN ('UNOPENED', 'GOOD')`, `restock: true`, `return_items.restocked === false`, and non-null `order_items.variant_id` may restock. `DAMAGED`/`DEFECTIVE` items MUST remain `restocked = false` and never alter sellable stock.
  - Inside the **same DB transaction**:
    1. Conditional update `return_items SET restocked = true WHERE id = :itemId AND restocked = false` (must affect 1 row).
    2. Increment `inventory_levels SET quantity_on_hand = quantity_on_hand + :qty, updated_at = NOW() WHERE warehouse_id = :whId AND variant_id = :variantId`.
    3. Append `inventory_movements` row (`type = 'RETURN_TO_STOCK'`, `quantity_delta = +qty`, `reference_type = 'RETURN'`, `reference_id = return.id`, `actor_id = actor.userId`, `reason = 'Return inspection passed'`).
    4. Write `audit_logs` (`action = 'return.received'`) capturing per-item conditions and restocked quantities.

### 5.3 CMS Publish Separation (`DRAFT -> PREVIEW -> PUBLISHED -> ARCHIVED`)
- **Separate Authoring vs. Publishing Permissions:**
  - `cms.write` permits creating/editing drafts and toggling `DRAFT <-> PREVIEW` across `Page`, `Lookbook`, and `JournalArticle`.
  - `cms.publish` is strictly required to transition any CMS entity to `PUBLISHED` (stamping `published_at = NOW()`) or `ARCHIVED`.
- **Public Storefront Isolation:** `GET /api/v1/cms/pages/:slug`, `/cms/lookbooks*`, and `/cms/journal*` MUST query `WHERE status = 'PUBLISHED' AND deleted_at IS NULL`. `DRAFT`, `PREVIEW`, and `ARCHIVED` records MUST return `404 RESOURCE_NOT_FOUND` on public endpoints.
- **Content Sanitization:** CMS structured `blocks`/`body`/`slides` payloads MUST pass `.strict()` Zod schemas; disallow `<script>`, inline `on*` event attributes, and `javascript:` URIs.

---

## 6. Strict Phase 07–08 Exclusion Checklist (Hard Scope Boundary)

Phase 06 MUST NOT include any Phase 07 or Phase 08 3D/WebGL features:

- [ ] **No 3D Asset Pipeline Endpoints or Workers:** No `POST /admin/products/:id/3d-assets/presign`, `.../confirm`, `.../publish`, `/admin/3d-assets/:id/presets`, and no `3d-assets` BullMQ GLB validation worker.
- [ ] **No 3D Product Viewer Code:** No `packages/three-engine`, `three`, `@react-three/fiber`, `@react-three/drei`, `<Canvas>`, or `/decoders/` WASM assets in `apps/storefront` or `apps/admin`.
- [ ] **No Virtual Showroom:** No `/showroom` pages, `GET /showroom/scenes`, or 3D hotspot scenes.
- [ ] **No Outfit Studio:** No `/outfit-studio` pages, `GET /outfit-studio/catalog`, or `/outfit-scenes` routes.
- [ ] **No `3d-rendering` QA Gate:** Phase 06 verification excludes `3d-rendering` and verifies `apps/storefront` and `apps/admin` carry zero `three` bundle dependencies.
