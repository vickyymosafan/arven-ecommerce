# ARVEN — REST API Contracts & Integration Specification

> **Base Path:** `/api/v1`  
> **Transport:** HTTPS JSON (`Content-Type: application/json; charset=utf-8`)  
> **Validation & Spec Pipeline:** Zod v4 Standard Schema (`packages/validators`) -> NestJS 12 `StandardSchemaValidationPipe` -> `@nestjs/swagger` OpenAPI 3.0 (`packages/contracts`)  
> **Governing ADRs:** [ADR-001](./adr/ADR-001-tech-stack-and-version-pins.md), [ADR-002](./adr/ADR-002-session-proxy-and-same-site-auth.md), [ADR-003](./adr/ADR-003-atomic-inventory-outbox-and-payment-idempotency.md).

---

## 1. Base Conventions

1. **URL & Resource Naming:** Plural nouns, kebab-case paths, UUIDv4/v7 resource IDs (or human `slug` / `orderNumber` where specified).
2. **Same-Origin Proxy:** Browser clients (`apps/storefront`, `apps/admin`) send all requests to same-origin `/api/v1/*`, forwarded internally to `apps/api` ([ADR-002](./adr/ADR-002-session-proxy-and-same-site-auth.md)). External payment webhooks hit `/api/v1/payments/webhooks/:provider` on the API ingress.
3. **Timestamps & Money:**
   - All timestamps are **ISO-8601 UTC** strings (`YYYY-MM-DDTHH:mm:ss.sssZ`).
   - All IDR monetary amounts are **non-negative integer Rupiah** (`number` within safe JSON integer bounds, never floats). Currency field is explicit ISO 4217 (`"IDR"`).
4. **Correlation ID (`requestId`):**
   - Every response returns `X-Request-Id` header and `meta.requestId` in the JSON envelope.
   - Inbound `X-Request-Id` headers matching `^[a-zA-Z0-9_-]{8,64}$` are propagated; missing or invalid headers trigger server UUID generation.
5. **Pagination, Filtering & Sorting:**
   - **Standard Offset Pagination** (catalog & admin grids): `?page=1&limit=20` (default `limit=20`, max `limit=100`). Returns `meta: { requestId, page, limit, total, totalPages }`.
   - **Cursor Pagination** (append-only streams: inventory movements, audit logs): `?cursor=<opaque>&limit=50`. Returns `meta: { requestId, limit, nextCursor, hasMore }`.
   - **Allowlists Only:** Arbitrary client column sorting or raw operator queries are rejected with `400 VALIDATION_ERROR`.
6. **Cache Control:**
   - Public catalog/CMS GETs may set bounded `Cache-Control` / `ETag`.
   - Auth, cart, checkout, orders, payments, and admin routes MUST return `Cache-Control: no-store`.

---

## 2. Standard Response & Error Envelopes

### 2.1 Success Envelope
```json
{
  "success": true,
  "data": {
    "id": "b6d97c46-2f44-4d6f-a6c7-98b88a7a1d10",
    "status": "PENDING_PAYMENT"
  },
  "meta": {
    "requestId": "req_01JCH9X2Q7M4R8K2N5P6W7Y8Z9"
  }
}
```

### 2.2 Paginated List Envelope
```json
{
  "success": true,
  "data": [],
  "meta": {
    "requestId": "req_01JCH9X2Q7M4R8K2N5P6W7Y8Z9",
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

### 2.3 Error Envelope
```json
{
  "success": false,
  "error": {
    "code": "VARIANT_OUT_OF_STOCK",
    "message": "Selected variant does not have enough available stock.",
    "details": [
      {
        "field": "items[0].variantId",
        "issue": "requested=2, available=1"
      }
    ]
  },
  "meta": {
    "requestId": "req_01JCH9X2Q7M4R8K2N5P6W7Y8Z9"
  }
}
```

> **Error Sanitization:** Stack traces, SQL errors, Prisma codes, and internal hostnames MUST NEVER be returned in staging or production error payloads.

---

## 3. HTTP Status Mapping & Canonical Error Codes

| HTTP Status | Meaning | Canonical `error.code` Examples |
|---|---|---|
| `200` | Read or state-changing operation succeeded synchronously | — |
| `201` | Resource created (`order`, `address`, `product`, `return`, etc.) | — |
| `202` | Accepted for asynchronous processing (e.g. trigger 3D asset validation) | — |
| `204` | Succeeded with no body (`DELETE`, `logout`) | — |
| `400` | Syntactic/schema input validation failure or malformed header | `VALIDATION_ERROR`, `INVALID_IDEMPOTENCY_KEY` |
| `401` | Missing, expired, or revoked authentication session/signature | `UNAUTHORIZED`, `SESSION_EXPIRED`, `MFA_REQUIRED`, `WEBHOOK_SIGNATURE_INVALID` |
| `403` | Authenticated actor lacks RBAC permission, resource ownership, or valid CSRF | `FORBIDDEN`, `CSRF_INVALID`, `RESOURCE_OWNERSHIP_DENIED` |
| `404` | Resource missing or intentionally hidden per access/publish policy | `RESOURCE_NOT_FOUND` |
| `409` | State transition conflict, stock race, duplicate key, or idempotency mismatch | `VARIANT_OUT_OF_STOCK`, `INVALID_STATE_TRANSITION`, `IDEMPOTENCY_CONFLICT`, `IDEMPOTENCY_IN_PROGRESS`, `DUPLICATE_RESOURCE` |
| `422` | Syntactically valid input rejected by domain business rule | `COUPON_INVALID`, `QUOTE_EXPIRED`, `PUBLISH_GATE_UNMET`, `INCOMPATIBLE_OUTFIT_SLOT`, `OUTFIT_LIMIT_REACHED`, `RETURN_WINDOW_EXPIRED` |
| `429` | Rate limit threshold exceeded | `RATE_LIMITED` |
| `500` | Unexpected internal error | `INTERNAL_ERROR` |
| `503` | Upstream payment/shipping provider or dependency unavailable | `PROVIDER_UNAVAILABLE`, `SERVICE_UNAVAILABLE` |

---

## 4. Zod-First Standard Schema & OpenAPI Workflow (`packages/validators` -> `packages/contracts`)

ARVEN maintains a **single contract source of truth** without duplicating `class-validator` classes:

1. **Author Schemas (`packages/validators`):**
   - Request body, query, and path param schemas are written using **Zod v4** (`zod@^4.3`), which natively implements both the **Standard Schema** (`~standard.validate`) and **Standard JSON Schema** (`~standard.jsonSchema`) interfaces.
   - Example:
     ```typescript
     // packages/validators/src/checkout.schemas.ts
     import { z } from 'zod';

     export const createOrderSchema = z.object({
       addressId: z.string().uuid().optional(),
       guestAddress: guestAddressSchema.optional(),
       guestEmail: z.string().email().optional(),
       shipping: z.object({
         provider: z.string().min(1).max(64),
         service: z.string().min(1).max(64),
       }).strict(),
       couponCode: z.string().trim().min(2).max(64).optional(),
       items: z.array(z.object({
         variantId: z.string().uuid(),
         quantity: z.number().int().min(1).max(99),
         customization: z.object({
           colorPresetId: z.string().uuid().optional(),
         }).strict().optional(),
       }).strict()).min(1).max(50),
     }).strict();
     export type CreateOrderInput = z.infer<typeof createOrderSchema>;
     ```
2. **NestJS 12 Runtime Validation (`apps/api`):**
   - `main.ts` registers `app.useGlobalPipes(new StandardSchemaValidationPipe())`.
   - Controllers attach schemas directly to NestJS parameter decorators:
     ```typescript
     @Post('orders')
     createOrder(
       @Body({ schema: createOrderSchema }) dto: CreateOrderInput,
       @Headers('idempotency-key') idempotencyKey: string,
     ) { ... }
     ```
3. **OpenAPI 3.0 Generation (`packages/contracts`):**
   - `@nestjs/swagger@^12` reads `@Body({ schema })` / `@Query({ schema })` / `@Param(..., { schema })` metadata and natively converts Zod 4.2+ Standard JSON Schema definitions (`openapi-3.0` target, `input`/`output` variants).
   - CI script (`pnpm contracts:generate`) boots NestJS Swagger document generation without network dependencies, emits `packages/contracts/openapi/arven.openapi.json`, generates TypeScript response/client DTO types, and fails CI if committed `packages/contracts` artifacts are out of sync with `packages/validators` + `apps/api`.

---

## 5. Authentication, Guest Access & CSRF Contract

| Mechanism | Header / Cookie | Scope & Rule |
|---|---|---|
| Customer Session | Cookie `__Host-arven_sid` (HTTPS staging/prod) / `arven_sid` (local HTTP) | `HttpOnly; SameSite=Lax; Path=/; Secure` (staging/prod). Maps to `sessions.scope = 'CUSTOMER'`. |
| Admin Session | Cookie `__Host-arven_admin_sid` (HTTPS staging/prod) / `arven_admin_sid` (local HTTP) | Separate cookie namespace (`sessions.scope = 'ADMIN'`). Requires `mfa_verified_at IS NOT NULL` for all `/admin/*` endpoints except `/auth/mfa/*`. |
| Guest Cart | Cookie `__Host-arven_guest_cart` (HTTPS staging/prod) / `arven_guest_cart` (local HTTP) | `HttpOnly; SameSite=Lax; Path=/; Secure` (staging/prod). 256-bit opaque token stored SHA-256 hashed in `carts.guest_token_hash`. |
| Guest Order Lookup | Header `X-Guest-Order-Token` (or `?token=`) | Issued once in `POST /checkout/orders` response & order email (`orders.guest_token_hash`). Rate-limited & constant-time verified. |
| CSRF Protection | Header `X-CSRF-Token` + `Origin`/`Referer` | Required on all state-changing browser calls (`POST`, `PATCH`, `PUT`, `DELETE`). Exempt ONLY on cryptographically signed external webhook routes (`/payments/webhooks/*`). |

---

## 6. `Idempotency-Key` Contract

**Required Header:** `Idempotency-Key: <string 16..128 chars, UUIDv4 recommended>`  
**Mandatory Endpoints:** `POST /checkout/orders`, `POST /payments/:orderId/session`, `POST /orders/:id/cancel`, `POST /orders/:id/returns`, `POST /admin/orders/:id/refunds/request`, `POST /admin/refunds/:id/approve`, `POST /admin/stock-movements`.

### Enforcement Algorithm
1. Validate header presence & format -> missing header returns `400 INVALID_IDEMPOTENCY_KEY`.
2. Compute `actorScope` (`user:<userId>` or `guest:<cartTokenHashPrefix>`).
3. Compute `requestHash = SHA256(actorScope + "|" + METHOD + "|" + normalizedPath + "|" + canonicalJsonStringify(body))`.
4. Attempt atomic `INSERT INTO idempotency_records (..., status='IN_PROGRESS', expires_at=NOW() + 24h) ON CONFLICT DO NOTHING`.
5. **If conflict (row exists and `expires_at > NOW()`):**
   - If `existing.request_hash !== requestHash`: return **`409 Conflict`** (`IDEMPOTENCY_CONFLICT`) — **never execute mutation**.
   - If `existing.status === 'IN_PROGRESS'`: return **`409 Conflict`** (`IDEMPOTENCY_IN_PROGRESS`) with `Retry-After: 2`.
   - If `existing.status === 'COMPLETED'`: return stored `existing.response_status` and `existing.response_body` with response header `Idempotent-Replayed: true`.
6. **If execution succeeds:** update `idempotency_records` with `status='COMPLETED'`, `response_status`, `response_body` (ideally inside the same DB transaction for DB-only mutations, or immediately after provider session creation).

---

## 7. Midtrans Webhook Verification & Deduplication Contract

**Endpoint:** `POST /api/v1/payments/webhooks/midtrans`  
**Auth:** Cryptographic signature (no user session cookie or CSRF token).

### Processing Steps (Mandatory Order)
1. **Parse & Validate Payload Shape:** Require `order_id`, `status_code`, `gross_amount`, `transaction_status`, `transaction_id`, `signature_key`.
2. **Verify Signature Key (Constant-Time):**
   $$\text{expected} = \text{SHA512}(\text{order\_id} + \text{status\_code} + \text{gross\_amount} + \text{MIDTRANS\_SERVER\_KEY})$$
   Compare `expected` (lowercase hex) against `payload.signature_key` using `crypto.timingSafeEqual`. Mismatch -> log security event (redacted) and return `401 WEBHOOK_SIGNATURE_INVALID`.
3. **Deduplicate Event:** Compute deterministic `providerEventId = "${payload.transaction_id}:${payload.transaction_status}:${payload.status_code}"`. Attempt `INSERT INTO payment_events (provider, provider_event_id, ...)` constrained by `UNIQUE(provider, provider_event_id)`. If unique violation -> return **`200 OK`** (`{ acknowledged: true, duplicate: true }`).
4. **Authoritative Provider Double-Check:** Call Midtrans `GET /v2/{order_id}/status` (`PaymentProvider.getStatus`) to confirm live transaction status and exact `gross_amount` before committing financial transitions.
5. **Transactional State Update:**
   - Inside PostgreSQL transaction: lock `payments` & `orders` row (`SELECT ... FOR UPDATE`), validate allowed `PaymentStatus` & `OrderStatus` transitions:
     - `settlement` / `capture (accept)`: `PaymentStatus -> SETTLEMENT`, `OrderStatus -> PAID`, commit `stock_reservations` (`ACTIVE -> COMMITTED`), deduct `inventory_levels` + insert `inventory_movements (SALE)`, emit `payment.succeeded` outbox event.
     - `deny` / `cancel` / `expire`: `PaymentStatus -> FAILED/EXPIRED`, `OrderStatus -> EXPIRED/CANCELLED`, release `stock_reservations` (`RELEASE`), emit `payment.failed`.
     - **Late Settlement After Expiry:** If reservation/order is already `EXPIRED`, record `payment_events`, flag `payments` + create critical alert/refund-exception task in `outbox_events` rather than overselling unreserved inventory.
6. **Browser Redirect Safety:** Storefront return URLs (`/checkout/status?order=...`) NEVER mutate `payments` or `orders`; they poll `GET /api/v1/orders/:orderNumber` until webhook or reconciliation settles state.

---

## 8. Complete Endpoint Catalog (`/api/v1`)

### 8.1 Platform & Health
| Method | Route | Access | Purpose |
|---|---|---|---|
| `GET` | `/health/live` | Public | Process liveness probe |
| `GET` | `/health/ready` | Internal / LB | PostgreSQL `SELECT 1` + Redis `PING` readiness check |
| `GET` | `/csrf-token` | Public | Issues/refreshes session-bound CSRF token for browser forms |

### 8.2 Auth & Account Security
| Method | Route | Access | Idempotency / Notes |
|---|---|---|---|
| `POST` | `/auth/register` | Public (rate-limited) | Argon2id hash, creates customer + sends email verification token |
| `POST` | `/auth/login` | Public (rate-limited) | Sets `__Host-arven_sid` / `arven_sid` (or `__Host-arven_admin_sid` / `arven_admin_sid` on `/auth/admin/login`); merges guest cart if guest cart cookie present |
| `POST` | `/auth/mfa/setup` | Admin (pre-MFA / MFA-verified) | Generates TOTP QR secret (encrypted at rest) |
| `POST` | `/auth/mfa/verify` | Admin session | Verifies 6-digit TOTP; stamps `sessions.mfa_verified_at` |
| `POST` | `/auth/logout` | Authenticated | Revokes current session + clears cookie (`204`) |
| `POST` | `/auth/logout-all` | Authenticated | Revokes all active sessions for current user (`204`) |
| `POST` | `/auth/refresh` | Authenticated | Rotates session token & extends sliding TTL |
| `POST` | `/auth/forgot-password` | Public (rate-limited) | Uniform `200` response regardless of email existence (anti-enumeration) |
| `POST` | `/auth/reset-password` | Public (token) | Validates single-use token, revokes ALL active sessions for user |
| `POST` | `/auth/verify-email` | Public (token) | Consumes token, transitions `UserStatus -> ACTIVE` |
| `GET` | `/auth/me` | Authenticated | Returns safe user summary, role codes, MFA status (no password/secrets) |

### 8.3 Users, Sessions & Addresses
| Method | Route | Access | Notes |
|---|---|---|---|
| `GET` | `/users/me` | Self | Customer profile |
| `PATCH` | `/users/me` | Self | Update `fullName`, `phone` (email change requires re-verification) |
| `GET` | `/users/me/sessions` | Self | List active sessions with safely masked IP/device metadata |
| `DELETE` | `/users/me/sessions/:id` | Self (ownership check) | Revoke specific session (`204`) |
| `GET` | `/users/me/addresses` | Self | List non-deleted addresses |
| `POST` | `/users/me/addresses` | Self | Create address; enforces single `isDefault` |
| `PATCH` | `/users/me/addresses/:id` | Self (ownership check) | Update address |
| `DELETE` | `/users/me/addresses/:id` | Self (ownership check) | Soft delete (`204`) |

### 8.4 Catalog, Discovery & 3D Public Read
| Method | Route | Access | Query / Notes |
|---|---|---|---|
| `GET` | `/products` | Public | Filters: `category`, `collection`, `size`, `color`, `minPrice`, `maxPrice`, `inStock`, `q`; Sort: `newest \| price_asc \| price_desc \| featured`; returns `PUBLISHED` + `isVisible` only |
| `GET` | `/products/:slug` | Public | Full PDP payload: product details, active variants with stock availability hint, size guide, media gallery, `has3dEnabled` |
| `GET` | `/categories` | Public | Hierarchical active category tree |
| `GET` | `/collections` | Public | Published collections within active schedule window |
| `GET` | `/collections/:slug` | Public | Collection details + ordered products |
| `GET` | `/products/:id/3d-assets` | Public | Active `READY` `Product3DAsset` manifest + CDN URLs + `customization_presets` (`404` if unpublished) |
| `GET` | `/3d-assets/:id/metadata` | Public | Published 3D asset metadata (`coordinateSystem`, `materialSlots`, `qualityProfiles`, `posterKey`) |
| `GET` | `/showroom/scenes` | Public | Published showroom zones (`PUBLISHED` only), camera baselines, portals, and active hotspots with live `fromPriceIdr` |
| `GET` | `/showroom/zones/:code/scene`, `/scene-lite`, `/poster` | Public | Binary GLB / poster streams for `PUBLISHED` zones (`@SkipEnvelope()`, `X-Content-Type-Options: nosniff`, `Cache-Control: public, max-age=31536000, immutable`; `404` for `DRAFT`/`ARCHIVED`) |
| `GET` | `/outfit-studio/catalog` | Public | Pinned unisex mannequin rig contract (`arven_mannequin_unisex_v1`, `1.0.0`), compatible `READY` garments with live variant prices, and curated public presets |
| `GET` | `/outfit-studio/rigs/:rigId/model`, `/model-lite`, `/poster` | Public | Binary GLB / poster streams for pinned mannequin rig (`@SkipEnvelope()`, `X-Content-Type-Options: nosniff`, `Cache-Control: public, max-age=31536000, immutable`; `404` for unknown rig) |
| `POST` | `/outfit-studio/validate` | Public (CSRF + throttled) | Stateless compatibility check (`200 { valid: true }` or `422 INCOMPATIBLE_OUTFIT_SLOT` with `RIG_MISMATCH \| SKELETON_VERSION_MISMATCH \| SLOT_MISMATCH \| ANCHOR_INVALID \| LAYER_CONFLICT \| DUPLICATE_SLOT \| GARMENT_UNAVAILABLE \| VARIANT_PRODUCT_MISMATCH \| PRESET_ASSET_MISMATCH`) |
| `POST` | `/outfit-studio/cart-items` | Guest / User (CSRF + throttled) | Re-validates compatibility, resolves live variant prices/stock inside a `CartService` transaction, and returns per-slot `ADDED \| OUT_OF_STOCK \| INACTIVE` results |
| `GET/POST/PATCH/DELETE` | `/outfit-scenes`, `/outfit-scenes/:id` | Customer (`@CustomerAuth()`, ownership-scoped) | Customer saved outfits (max `50` per user -> `422 OUTFIT_LIMIT_REACHED`; stores IDs/presets only; hydrates live prices & `stale` flags on read; cross-user IDOR -> `404`) |

### 8.5 Cart
| Method | Route | Access | Notes |
|---|---|---|---|
| `GET` | `/cart` | Guest / User | Hydrates authoritative variant prices, live availability flags, and server subtotal |
| `POST` | `/cart/items` | Guest / User | Sets `arven_guest_cart` if anonymous; validates variant active & positive qty |
| `PATCH` | `/cart/items/:id` | Guest / User (cart ownership) | Updates quantity (`0` rejects; use `DELETE`) |
| `DELETE` | `/cart/items/:id` | Guest / User (cart ownership) | Removes line item (`204`) |
| `POST` | `/cart/merge` | Authenticated | Explicit merge of `arven_guest_cart` into user's active cart (sum qty capped by policy/available stock) |

### 8.6 Checkout, Orders, Payments & Returns
| Method | Route | Access | Idempotency | Notes |
|---|---|---|---|---|
| `POST` | `/checkout/quote` | Guest / User | No | Computes server subtotal, coupon discount, shipping options/cost, tax, grand total; returns signed/timestamped `quoteExpiresAt` |
| `POST` | `/checkout/orders` | Guest / User | **Required** | Atomic stock reservation + `PENDING_PAYMENT` order + snapshots + outbox; returns order + `guestToken` (once, if guest) |
| `GET` | `/orders` | Authenticated | No | Paginated list strictly filtered by `orders.user_id = session.userId` |
| `GET` | `/orders/:orderNumber` | Owner or Guest Token | No | Checks `session.userId === order.userId` OR valid `X-Guest-Order-Token` |
| `POST` | `/orders/:id/cancel` | Owner / Support | **Required** | Allowed only while `PENDING_PAYMENT` (or pre-fulfillment policy); releases reservation |
| `POST` | `/payments/:orderId/session` | Owner / Guest Token | **Required** | Creates Midtrans Snap session via `PaymentProvider.createSession` |
| `GET` | `/payments/:id` | Owner / Guest Token | No | Current sanitized payment status |
| `POST` | `/payments/webhooks/:provider` | Provider Signature | Event Dedup | Midtrans webhook handler (Section 7) |
| `POST` | `/orders/:id/returns` | Owner / Guest Token | **Required** | Validates `DELIVERED` order, return window, owned `order_item_id` & purchased quantities |
| `GET` | `/returns/:id` | Owner / Support | No | Ownership-checked return status & timeline |

### 8.7 Wishlists, Reviews & Public CMS
| Method | Route | Access | Notes |
|---|---|---|---|
| `GET/POST/DELETE` | `/wishlists/items`, `/wishlists/items/:id` | Authenticated (Self) | Ownership-checked wishlist items |
| `GET` | `/products/:slug/reviews` | Public | Returns `APPROVED` reviews + average rating |
| `POST` | `/products/:id/reviews` | Authenticated | Requires verified delivered order containing product; enters `PENDING` moderation |
| `GET` | `/cms/pages/:slug` | Public | Published CMS page blocks |
| `GET` | `/cms/lookbooks`, `/cms/lookbooks/:slug` | Public | Published lookbooks |
| `GET` | `/cms/journal`, `/cms/journal/:slug` | Public | Published journal articles |

### 8.8 Admin Operations (`/api/v1/admin/*` — Admin Session + MFA + Granular RBAC)
| Domain | Method & Route | Required Permission Code(s) | Notes |
|---|---|---|---|
| Catalog | `GET/POST/PATCH/DELETE /admin/products`, `.../variants`, `.../media` | `product.read`, `product.write` | Soft delete; price changes write `audit_logs` |
| Catalog Publish | `POST /admin/products/:id/transition` | `product.publish` | Enforces `READY_TO_PUBLISH` -> `PUBLISHED` completeness gate |
| Categories/Coll. | `CRUD /admin/categories`, `CRUD /admin/collections` | `product.write` | |
| 3D Assets | `POST /admin/products/:id/3d-assets/presign`, `POST .../confirm`, `POST /admin/3d-assets/:id/publish` | `asset.upload`, `asset.publish` | Presigned upload -> triggers `3d-assets` worker validation -> only `READY` can publish |
| Presets | `CRUD /admin/3d-assets/:id/presets` | `asset.upload` | Material/color slot validation |
| Showroom | `GET /admin/showroom/zones`, `GET /admin/showroom/zones/:id`, `POST /admin/showroom/zones`, `PATCH /admin/showroom/zones/:id`, `POST /admin/showroom/zones/:id/transition`, `POST /admin/showroom/zones/:id/hotspots`, `PATCH/DELETE /admin/showroom/hotspots/:id` | `asset.read` (`GET`), `asset.publish` (mutations) | Deterministic server-generated zone GLB (`<= 6 MB` / `<= 3.5 MB`); `DRAFT -> PUBLISHED -> ARCHIVED -> DRAFT`; `@AuditAction` |
| Outfit Studio | `GET /admin/outfit-studio/garments`, `PUT/DELETE /admin/3d-assets/:id/outfit-compatibility`, `GET/POST/PATCH/DELETE /admin/outfit-studio/presets` | `asset.read` (`GET`), `asset.publish` (mutations) | Compatibility diagnostics, rig/slot/anchor config, curated public presets (`user_id NULL`); `@AuditAction` |
| Inventory | `GET /admin/inventory/levels`, `GET /admin/inventory/movements`, `GET /admin/inventory/reservations` | `inventory.read` | Cursor-paginated ledger |
| Stock Ops | `POST /admin/stock-movements` | `inventory.receive` / `inventory.adjust` (**Idempotency Required**) | `RECEIPT` or `ADJUSTMENT` with mandatory reason + `audit_logs` |
| Orders | `GET /admin/orders`, `GET /admin/orders/:id`, `POST /admin/orders/:id/transition` | `order.read` / `order.read.limited`, `order.fulfill`, `order.cancel` | Validated state transitions only |
| Shipments | `POST /admin/orders/:id/shipments`, `POST /admin/shipments/:id/sync-tracking` | `order.fulfill` | Invokes `ShippingProvider.createShipment` |
| Returns | `GET /admin/returns`, `POST /admin/returns/:id/review`, `POST /admin/returns/:id/approve`, `POST /admin/returns/:id/receive` | `return.read`, `return.review`, `return.approve`, `return.inspect` | Inspection passes -> `RETURN_TO_STOCK` movement |
| Refunds | `POST /admin/orders/:id/refunds/request`, `POST /admin/refunds/:id/approve` | `refund.request`, `refund.approve` (**Idempotency Required**) | Two-step separation of duties (`request` != `approve`; `OWNER` approval + MFA step-up) |
| Coupons | `CRUD /admin/coupons` | `coupon.read`, `coupon.manage` | |
| Reviews | `GET /admin/reviews`, `POST /admin/reviews/:id/moderate` | `review.moderate` | `APPROVED` / `HIDDEN` / `REJECTED` |
| CMS | `CRUD /admin/cms/pages`, `.../lookbooks`, `.../journal` | `cms.read`, `cms.write`, `cms.publish` | `DRAFT` -> `PREVIEW` -> `PUBLISHED` -> `ARCHIVED` |
| Analytics | `GET /admin/analytics/sales`, `.../products`, `.../3d-engagement` | `analytics.read` / `analytics.read.limited` | Consistent server KPI definitions |
| RBAC & Settings | `CRUD /admin/roles`, `PATCH /admin/users/:id/roles`, `PATCH /admin/settings/providers`, `GET /admin/audit-logs` | `user.role.manage`, `settings.provider.manage`, `audit.read` / `audit.read.scoped` | High-risk role/provider changes require MFA step-up & write `audit_logs` |

---

## 9. Representative Request & Response Payloads

### 9.1 `POST /api/v1/checkout/orders` (Request)
*(Matches Blueprint Section 11.4; client NEVER submits unit prices, discounts, or totals.)*
```json
{
  "addressId": "4c2d1f8a-8c34-4a91-9b1f-3a57d19d7a01",
  "shipping": {
    "provider": "jne-adapter",
    "service": "REG"
  },
  "couponCode": "WELCOME10",
  "items": [
    {
      "variantId": "9a1e3c7b-51d2-4d30-b84c-2a7c89c2e912",
      "quantity": 1,
      "customization": {
        "colorPresetId": "f219e4a0-7218-4b5a-a224-119b82a54f09"
      }
    }
  ]
}
```

### 9.2 `POST /api/v1/checkout/quote` (200 Response)
```json
{
  "success": true,
  "data": {
    "currency": "IDR",
    "items": [
      {
        "variantId": "9a1e3c7b-51d2-4d30-b84c-2a7c89c2e912",
        "sku": "ARV-TOP-001-BLK-M",
        "productName": "Essential Oversized Tee",
        "unitPriceIdr": 299000,
        "quantity": 1,
        "discountAllocatedIdr": 29900,
        "lineTotalIdr": 269100,
        "availableQuantity": 14
      }
    ],
    "subtotalIdr": 299000,
    "discountTotalIdr": 29900,
    "shippingTotalIdr": 18000,
    "taxTotalIdr": 0,
    "grandTotalIdr": 287100,
    "appliedCoupon": {
      "code": "WELCOME10",
      "discountType": "PERCENTAGE",
      "discountValue": 10
    },
    "quoteExpiresAt": "2026-11-14T14:35:00.000Z"
  },
  "meta": {
    "requestId": "req_01JCH9Y1M8V2K9T4W3Z7X5C1B2"
  }
}
```
