# ARVEN — Security Policy, RBAC Matrix, Threat Model & Privacy Standard

> **Status:** Canonical Phase 01 Governance Baseline  
> **Verification Standard:** OWASP ASVS 5.0 (Target Level 2 platform-wide; Level 3 rigor on payment verification, stock reservation invariants, and admin privilege boundaries)  
> **Sources:** [`ARVEN_Full_Blueprint_v1.md`](../ARVEN_Full_Blueprint_v1.md) (Sections 5, 11, 14, 15, 17, 18, 20; Appendices A, D), [`PRD_AND_BUSINESS_RULES.md`](./PRD_AND_BUSINESS_RULES.md), [`DISCOVERY_REPORT.md`](./DISCOVERY_REPORT.md) (`AMB-04`, `AMB-05`, `AMB-07`)  
> **Capability Modules:** `5` (Risk-Based Autonomy), `8` (Supply Chain Security), `23` (Policy Precedence), `29` (Privacy & Data Boundary), `31` (Policy Exception & Expiry), `33` (Secure-by-Default), `38` (Execution Isolation & Egress), `45` (Policy Conformance & Bypass-Test), `59` (Policy-to-Control Coverage), `62` (Assurance Profile & Applicability)

---

## 1. Policy Precedence, Scope & Exception Governance

### 1.1 Policy Precedence (Module 23)
When security, functional convenience, performance, or agent-autonomy goals conflict, precedence strictly resolves in this order:
1. **Hard Legal & Cardholder Safety Bans** — Absolute prohibition on storing raw card PAN/CVV/PINs; statutory privacy and breach-prevention controls.
2. **Server-Authoritative Transaction & Access Invariants** — Deny-by-default RBAC, resource ownership checks, server-computed pricing/discounts, atomic inventory locking, and cryptographic webhook verification.
3. **Environment Isolation & Secret Boundaries** — No secrets in Git or browser bundles; private DB/Redis networking.
4. **Product UX & Performance Optimizations** — Never weaken CSP, CSRF, session cookies, or validation to shortcut a UI flow.

### 1.2 Assurance Profile & Applicability (Module 62)
- **Public Catalog & Editorial Surface:** Low sensitivity for read data; high integrity requirement against XSS, cache poisoning, and search/3D DoS.
- **Customer Identity, Cart, Checkout & Returns Surface:** High confidentiality (PII) and high integrity (financial quotes, stock locking, ownership isolation) -> **OWASP ASVS 5.0 Level 2**.
- **Admin Dashboard, RBAC & Payment Webhook Surface:** Critical privilege and financial impact -> **OWASP ASVS 5.0 Level 2 mandatory + Level 3 controls** on MFA, step-up confirmation, signature/replay verification, and immutable audit logging.

### 1.3 Policy Exception & Expiry Protocol (Module 31)
- No silent workarounds or disabled security guards (`@SkipThrottle` on auth, `CORS *` with credentials, disabled CSRF, permissive upload MIME checks) are permitted in staging or production.
- Any temporary exception requires a documented Security Exception Record specifying: affected control, blast radius, compensating control, explicit sign-off by `OWNER` / Security Lead, and a hard expiration date (`<= 14 days` for CI/staging, `0` unapproved exceptions in production). Expired exceptions automatically fail the Phase Quality Gate.

---

## 2. Trust Boundaries & Topology

Per `DISCOVERY_REPORT.md` (`AMB-05`) and Blueprint Sections 7.1, 11.1, and 15.1, ARVEN enforces six explicit trust boundaries across its four deployable applications (`apps/storefront`, `apps/admin`, `apps/api`, `apps/worker`):

```text
[TB-1: Untrusted Internet]
  Customer / Admin Browser
        │  HTTPS (TLS 1.2+/1.3), WAF, Rate Edge, CDN
        ▼
[TB-2: Same-Site Edge & BFF Proxy]
  Next.js 16 (apps/storefront & apps/admin) via proxy.ts + /api/v1/* rewrite
        │  Private Internal Link + Propagated Request-ID + Host/Origin Checks
        ▼
[TB-3: Authoritative Application & Authorization Core]
  NestJS 12 REST API (apps/api) — DTO Validation, Auth/MFA, RBAC, Ownership, Business State Machines
        │                                            │
        ├──────────────────┐                         ▼ [TB-6: Isolated Asset Pipeline]
        │                  │                 Presigned S3 Quarantine Prefix ──► BullMQ 3d-assets / media Worker
        ▼                  ▼                         │ (Magic-byte/GLB validation, scan, strip, transcode)
[TB-4: Private Data Plane]                           ▼
  PostgreSQL 18 (Prisma 7 @prisma/adapter-pg)    Versioned Immutable Public CDN Prefix (Object Storage)
  Redis 8 (Throttler, Sessions Cache, BullMQ)
        │
        ▼ [TB-5: Outbound Egress & Inbound Webhook Gateway]
  Midtrans Payment API / Shipping Provider API / Transactional Email (SMTP)
```

### 2.1 Trust Boundary Contracts

| Boundary | Crossing Actors / Systems | Threat Posture | Mandatory Controls |
|---|---|---|---|
| **TB-1** | Browser ↔ CDN / WAF | Fully untrusted client | TLS everywhere (`HSTS`), WAF bot/flood mitigation, zero client authority over price, stock, discount, status, or roles. |
| **TB-2** | Browser ↔ Next.js 16 (`proxy.ts`) | Same-origin browser boundary | Next.js `proxy.ts` issues per-request CSP nonce; `/api/v1/*` BFF rewrite/proxy keeps API cookies **same-site** (`HttpOnly`, `Secure`, `SameSite=Lax` storefront / `SameSite=Strict` or `Lax` admin) without cross-site `SameSite=None` hacks. |
| **TB-3** | Next.js Proxy ↔ NestJS 12 API | Untrusted payloads, authenticated session context | `StandardSchemaValidationPipe` (Zod + `__proto__` stripping), explicit `CORSMiddleware`/allowlist, global deny-by-default `AuthGuard` + `RbacGuard`, ownership enforcement, `@nestjs/throttler` (Redis-backed), `Idempotency-Key` guard, response DTO allowlists. |
| **TB-4** | `apps/api` & `apps/worker` ↔ PostgreSQL 18 / Redis 8 / Object Storage | Private internal network only | Never bind DB or Redis to public interfaces; distinct least-privilege DB roles (`arven_api`, `arven_worker`, `arven_migrator`); parameterized Prisma 7 + SQL `CHECK` constraints; TLS/auth enabled in staging & production. |
| **TB-5** | `apps/api` & `apps/worker` ↔ Midtrans / Shipping / Email | External third-party SaaS | Outbound egress allowlist to verified provider hostnames only; server-only API keys; inbound webhooks validated via cryptographic signature + active `getStatus()` provider query + `payment_events.provider_event_id` deduplication. |
| **TB-6** | Admin Browser / Storage ↔ `apps/worker` (`3d-assets`, `media`) | Untrusted binary files (GLB, images) | Direct-to-quarantine presigned upload (`PUT`/`POST`) with strict size/type conditions; isolated worker parses, scans, verifies magic bytes & geometry/texture limits; promotes immutable versioned key (`v001`, `v002`) only on `READY`. |

---

## 3. OWASP ASVS 5.0 Verification Baseline & Security Controls

### 3.1 Authentication, Passwords & Admin MFA (ASVS V2 / V6)
1. **Password Hashing:** All user passwords MUST be hashed using **Argon2id** (minimum baseline: `memoryCost >= 65536` KiB / 64 MiB, `timeCost >= 3`, `parallelism >= 1`, 16-byte random salt, 32-byte tag). Weak hashes (`bcrypt`, `PBKDF2`, raw `SHA-*`) are banned for password storage.
2. **Password Policy:** Enforce minimum 12-character passwords (up to 128 chars to allow passphrases without truncation), check against breached-password blocklists where available, preserve Unicode spaces, and never truncate or silently strip characters.
3. **Mandatory Admin MFA:**
   - Every account holding **any** non-`CUSTOMER` operational role (`OWNER`, `MANAGER`, `PRODUCT`, `INVENTORY`, `ORDER`, `CONTENT`, `SUPPORT`) MUST enroll TOTP (RFC 6238) or WebAuthn/FIDO2 MFA before accessing `/admin` APIs or dashboards.
   - MFA verification state (`mfaVerifiedAt`) is bound to the server session record; unverified admin logins receive a restricted MFA-challenge state only and fail closed (`403 MFA_REQUIRED`) on all `/api/v1/admin/*` endpoints.
   - Sensitive operations (`user.role.manage`, `refund.approve`, `settings.provider.manage`) require recent MFA step-up verification (e.g., `<= 15 minutes` or explicit re-authentication confirmation) and mandatory `audit_logs` entry.
   - Store hashed single-use recovery codes only; display plaintext recovery codes exactly once at enrollment.
4. **Email Verification & Password Reset:**
   - Generate CSPRNG tokens (`>= 32` random bytes, URL-safe encoded). Store **only** `SHA-256(token)` in the database.
   - Strict TTL: `15–30 minutes` for password reset tokens; `24 hours` for email verification. Single-use invalidation upon consumption.
   - Password reset or password change MUST revoke all active sessions for that user and emit a security notification email.
5. **Credential Stuffing & Enumeration Defense:**
   - Identical generic responses and uniform timing behavior on login failure (`INVALID_CREDENTIALS`), registration conflict (`409` or neutral notice per UX contract without leaking private profile fields), and forgot-password (`200 OK` generic message regardless of email existence).
   - Multi-dimensional throttling (`IP` + normalized `email` key) + exponential backoff / CAPTCHA escalation hook on repeated failures.

### 3.2 Session Management, Cookies, CSRF & Guest Tokens (ASVS V3 / V7)
1. **Opaque Server-Side Sessions:**
   - Issue `>= 256-bit` CSPRNG opaque session tokens (`crypto.randomBytes(32)`). Store **only `SHA-256(sessionToken)`** in PostgreSQL `sessions` (with Redis read-through cache invalidated synchronously on logout/revocation).
   - Never embed mutable authorization claims in unrevokable stateless long-lived JWT cookies.
2. **Cookie Attributes:**
   - Storefront cookie (e.g., `__Host-arven_sid` over HTTPS; `arven_sid` only in local HTTP dev): `HttpOnly=true`, `Secure=true` (mandatory in staging/production), `SameSite=Lax`, `Path=/`.
   - Admin cookie (e.g., `__Host-arven_admin_sid`): `HttpOnly=true`, `Secure=true`, `SameSite=Strict` (or `Lax` if SSO/redirect requires, paired with strict Origin + CSRF token), `Path=/`, separate cookie namespace from storefront customer sessions.
3. **Rotation, Expiry & Revocation:**
   - Rotate session token (issue new session ID, invalidate previous token) on: login, guest-to-user cart/session transition, MFA verification, password change, and role assignment change.
   - Lifetimes: Storefront idle timeout `7 days` / absolute max `30 days`; Admin idle timeout `30 minutes` / absolute max `12 hours`.
   - Provide `GET /users/me/sessions` (device/IP metadata masked safely) and `DELETE /users/me/sessions/:id` / `POST /auth/logout-all` for self-service revocation.
4. **CSRF Defense:**
   - Browser-to-API mutations (`POST`, `PUT`, `PATCH`, `DELETE`) traversing the same-site Next.js proxy MUST pass **both**:
     1. Strict `Origin` (or fallback `Referer`) exact-match check against configured Storefront/Admin origins; and
     2. Anti-CSRF token verification (synchronizer token bound to session or double-submit `X-CSRF-Token` matching a `SameSite` readable token) OR enforced custom non-simple header + JSON `Content-Type: application/json` enforcement on CORS-blocked routes.
   - Payment/shipping provider webhook routes (`/api/v1/payments/webhooks/:provider`) are exempted from browser CSRF tokens **exclusively** by explicit route matcher and instead enforce strict cryptographic signature verification.
5. **Guest Cart & Guest Order Token Security (`AMB-04`):**
   - Guest cart token (`guest_token`) and guest order lookup/tracking token must be `>= 256-bit` CSPRNG secrets stored **hashed (`SHA-256`)** in `carts.guest_token_hash` and `orders.guest_access_token_hash` (or signed scoped capability token).
   - Knowing an `orderNumber` alone MUST NEVER expose customer PII, shipping address, or order line items without either authenticated `order.user_id === currentUser.id` or a valid guest proof token.

### 3.3 API Hardening, Next.js 16 `proxy.ts`, CSP, CORS & Error Sanitization (ASVS V1 / V4 / V5 / V13)
1. **CORS Allowlist:**
   - Explicitly allowlist exact deployed origins (`STOREFRONT_ORIGIN`, `ADMIN_ORIGIN`). **Forbidden:** wildcard `*` with `credentials: true` or dynamic origin reflection (`origin: (o, cb) => cb(null, true)`).
2. **CSP & HTTP Security Headers (Next.js 16 `proxy.ts`):**
   - Implement security headers and per-request CSP nonces inside Next.js 16 `proxy.ts` (`export function proxy(request: NextRequest)`) — never deprecated `middleware.ts`.
   - Baseline CSP policy for Storefront & Admin:
     - `default-src 'self'`
     - `script-src 'self' 'nonce-<random>' 'strict-dynamic'` (append `'unsafe-eval'` **only** when `NODE_ENV === 'development'` for React/R3F tooling; **never** `'unsafe-inline'` or `'unsafe-eval'` in production; allowlist Midtrans Snap script origin only on checkout route if Snap popup/embed is used)
     - `style-src 'self' 'nonce-<random>'` (or controlled Tailwind style hash policy where static routes require caching without per-request nonces)
     - `img-src 'self' blob: data: <CDN_ORIGIN>`
     - `font-src 'self'`
     - `connect-src 'self' <CDN_ORIGIN> <MIDTRANS_API_ORIGIN_IF_CLIENT_SNAP>`
     - `worker-src 'self' blob:` (for Three.js/Draco/KTX2 decoding workers only)
     - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `upgrade-insecure-requests`
   - Standard headers: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (prod), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
3. **Input Validation & Mass-Assignment Prevention (NestJS 12):**
   - Enforce global `StandardSchemaValidationPipe` (with Zod `@standard-schema/spec` strict object schemas) across `apps/api`. NestJS 12 strips `__proto__`/prototype keys automatically inside `StandardSchemaValidationPipe`; schemas MUST reject unrecognized fields (`.strict()`) so clients cannot inject `price`, `unitPrice`, `discountAmount`, `status`, `userId`, or `roleIds`.
   - Enforce explicit TypeScript + Zod bounds on all pagination (`page >= 1`, `limit <= 100`), search queries (`maxLength <= 120`, no raw regex execution), UUID params, and numeric quantities (`int`, `min: 1`, `max: 99` per line item unless business rule raises cap).
4. **Rate Limiting (`@nestjs/throttler` + Redis):**
   - Global default baseline (e.g., `120 req/min` per IP/actor) plus tighter route-level `@Throttle(...)` profiles:
     - `POST /auth/login`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/mfa/verify`: `5–10 req/min` per IP + per account key.
     - `POST /auth/register`: `5 req/min` per IP.
     - `POST /checkout/quote`, `POST /checkout/orders`, `POST /payments/:orderId/session`: `15–20 req/min` per actor/IP.
     - `GET /products` (search/filter) & `GET /products/:id/3d-assets`: `60 req/min` per IP with CDN/Redis caching for published catalog.
     - `POST /admin/3d-assets/presign`: `10 req/min` per admin actor.
5. **Request Size Caps:**
   - Default NestJS Express 5 JSON body limit: `1 MB`; Auth & Checkout mutation routes capped tighter (`256 KB`); Webhook routes capped (`512 KB`).
   - All binary media and GLB files bypass NestJS JSON body parsing via presigned S3 upload URLs with signed `content-length-range` conditions (`<= 10 MB` images, `<= 15 MB` raw staging GLB before optimization to `2–8 MB` target).
6. **Output Serialization & Error Sanitization:**
   - Use `StandardSchemaSerializerInterceptor` / explicit response DTO mappers (field allowlist) so internal fields (`password_hash`, `mfa_secret`, `guest_token_hash`, internal cost/notes) can never leak in API responses.
   - Standard error envelope (`success: false, error: { code, message, details }, meta: { requestId }`): map unhandled exceptions, Prisma query errors, and provider stack traces to sanitized `500 INTERNAL_ERROR` / `503 SERVICE_UNAVAILABLE` messages with `requestId` correlation only.

### 3.4 Infrastructure, Supply Chain & Egress Controls (Modules 8, 38)
- **Dependency & Supply Chain Hygiene (Module 8):** Pin exact lockfile (`pnpm-lock.yaml`) + CI `pnpm install --frozen-lockfile`; run automated dependency vulnerability audits (`pnpm audit` / SCA) and SAST/secret scanning in CI (Blueprint §17.3); verify ESM compatibility and maintainer provenance before introducing new packages (especially third-party `@nestjs/*` and Three.js loaders).
- **Secrets Management:** Never commit `.env`, private keys, Midtrans server keys, or R2/S3 credentials to Git. Runtime secrets injected from Secret Manager (staging/prod) and validated via Zod startup config schema (fail fast on missing/weak secrets in production).
- **Worker & Egress Isolation (Module 38):** `apps/worker` parses untrusted 3D/media uploads without access to payment signing keys or admin auth secrets; outbound HTTP calls from API/worker use explicit timeouts (`<= 10s`), TLS verification enabled, and provider domain allowlists (preventing SSRF via user-supplied URLs — user-supplied media/GLB external URLs are disallowed; uploads must use ARVEN presigned object keys).

---

## 4. Complete RBAC Role & Granular Permission Matrix

Per Blueprint Section 14.2, ARVEN enforces **deny-by-default** authorization combining:
1. **Role-Based Access Control (RBAC)** using granular `resource.action` permission codes, AND
2. **Resource Ownership Enforcement** for self-service customer/guest access and scoped admin boundaries.

### 4.1 Role Definitions
1. **`OWNER`**: Full platform authority; sole holder of `user.role.manage`, `refund.approve`, and `settings.provider.manage`.
2. **`MANAGER`**: Operational lead across catalog, 3D assets, inventory, orders, coupons, and CMS; can `refund.request` (cannot self-approve refunds) and manage non-privileged staff/customer accounts (`user.manage.limited`), but **cannot** mutate RBAC role definitions or grant `OWNER`/`MANAGER` roles.
3. **`PRODUCT`**: Merchandising & catalog lead; manages products, variants, categories, collections, media, and 3D assets (`product.publish`, `asset.publish`); read-only on stock movements and orders; zero access to refunds, users/roles, analytics, or audit logs.
4. **`INVENTORY`**: Warehouse & fulfillment stock operator; receives stock (`inventory.receive`), performs audited adjustments (`inventory.adjust`), inspects returned goods (`return.inspect`); read-only on products, orders, and inventory-scoped audit trails.
5. **`ORDER`**: Fulfillment operator; reads orders, manages picking/packing/shipment dispatch (`order.fulfill`, `shipment.manage`), requests refunds (`refund.request`); read-only on sales analytics, products, inventory, and order-scoped audit trails.
6. **`CONTENT`**: Editorial & storefront CMS creator; writes/publishes Homepage, Lookbooks, Journal, Campaigns (`cms.write`, `cms.publish`); read-only on products and 3D assets.
7. **`SUPPORT`**: Customer service specialist; views masked customer profiles and limited order/sales summaries (`order.read.limited`), moderates product reviews, reviews return eligibility (`return.review`), cancels eligible pre-fulfillment orders (`order.cancel`), and files `refund.request`; zero ability to approve refunds, adjust stock, edit products/CMS, or view audit logs.
8. **`CUSTOMER`** *(Storefront Account)*: Self-service only (`user_id === session.userId`). Zero access to any `/admin` route or operational permission code.

### 4.2 Granular Permission Code Registry & Role Matrix

Legend: **Y** = Permitted | **Limited / Scoped** = Permitted with explicit data/field/state bounds | **—** = Denied (`403 Forbidden`)

| Blueprint Area (§14.2) | Permission Code | Scope / Control Rule | Owner | Manager | Product | Inventory | Order | Content | Support |
|---|---|---|---|---|---|---|---|---|---|
| **Sales Analytics** | `analytics.read` | Full sales, conversion, cohort & 3D metrics | **Y** | **Y** | — | — | **Y** | — | — |
| | `analytics.read.limited` | Order-volume / SLA support summary only (no margin/PII) | **Y** | **Y** | — | — | **Y** | — | **Limited** |
| | `analytics.export` | Export financial/analytics CSV/JSON (audit logged) | **Y** | — | — | — | — | — | — |
| **Products & Catalog** | `product.read` | Read draft/review/published catalog, variants & media | **Y** | **Y** | **Y** | **Y** | **Y** | **Y** | **Y** |
| | `product.write` | Create/edit products, variants, prices, categories, collections | **Y** | **Y** | **Y** | — | — | — | — |
| | `product.publish` | Transition `READY_TO_PUBLISH -> PUBLISHED` / `ARCHIVED` | **Y** | **Y** | **Y** | — | — | — | — |
| **3D Assets & Presets** | `asset.read` | Read 3D asset metadata, validation runs, presets | **Y** | **Y** | **Y** | — | — | **Y** | — |
| | `asset.upload` | Request presigned upload & create validation run | **Y** | **Y** | **Y** | — | — | — | — |
| | `asset.publish` | Approve validated `READY` 3D asset & customization presets | **Y** | **Y** | **Y** | — | — | — | — |
| **Inventory & Stock** | `inventory.read` | View warehouse levels, movements & active reservations | **Y** | **Y** | **Y** | **Y** | **Y** | — | **Y** |
| | `inventory.receive` | Append `RECEIPT` stock movement (`+on_hand`) | **Y** | **Y** | — | **Y** | — | — | — |
| | `inventory.adjust` | Append `ADJUSTMENT` movement (reason + audit required) | **Y** | **Y** | — | **Y** | — | — | — |
| **Orders & Shipping** | `order.read` | Full operational order, payment status & shipment view | **Y** | **Y** | **Y** | **Y** | **Y** | — | — |
| | `order.read.limited` | Support order view (masked contact PII, no raw gateway payloads) | **Y** | **Y** | — | — | **Y** | — | **Limited** |
| | `order.fulfill` | Advance `PAID -> PROCESSING -> READY_TO_SHIP` & create/update shipments | **Y** | **Y** | — | — | **Y** | — | — |
| | `order.cancel` | Cancel eligible unpaid/pre-shipment order (releases reservation) | **Y** | **Y** | — | — | **Y** | — | **Limited** |
| **Returns & Refunds** | `return.read` | View return requests, evidence & inspection notes | **Y** | **Y** | — | **Y** | **Y** | — | **Y** |
| | `return.review` | Triage return eligibility & request details | **Y** | **Y** | — | — | — | — | **Y** |
| | `return.inspect` | Record physical receipt & `RETURN_TO_STOCK` restock inspection | **Y** | **Y** | — | **Y** | — | — | — |
| | `return.approve` | Approve or reject return claim (`REQUESTED/UNDER_REVIEW -> APPROVED/REJECTED`) | **Y** | **Y** | — | — | — | — | — |
| | `refund.request` | Initiate refund request bound to order/return items & max paid amount | **Y** | **Y** | — | — | **Y** | — | **Y** |
| | `refund.approve` | Authorize & trigger Midtrans/manual refund payout (MFA step-up + audit) | **Y** | — | — | — | — | — | — |
| **Coupons & Promos** | `coupon.read` | Inspect coupon definitions & redemption counts | **Y** | **Y** | **Y** | — | **Y** | — | **Y** |
| | `coupon.manage` | Create, update, enable/disable promotional coupons | **Y** | **Y** | — | — | — | — | — |
| **Customers & Reviews** | `customer.read` | View customer profiles & order history (Support sees masked phone/email) | **Y** | **Y** | — | — | — | — | **Limited** |
| | `customer.note.write` | Append support notes on customer/order cases | **Y** | **Y** | — | — | — | — | **Y** |
| | `review.moderate` | Approve or hide customer product reviews | **Y** | **Y** | — | — | — | — | **Y** |
| **CMS (Editorial)** | `cms.read` | View draft/published Homepage, Lookbooks, Journal, Campaigns | **Y** | **Y** | **Y** | — | — | **Y** | — |
| | `cms.write` | Create/edit CMS drafts | **Y** | **Y** | — | — | — | **Y** | — |
| | `cms.publish` | Publish or archive CMS pages/articles/lookbooks | **Y** | **Y** | — | — | — | **Y** | — |
| **Users, Roles & Settings** | `user.read` | View staff directory & role assignments | **Y** | **Limited** | — | — | — | — | — |
| | `user.manage.limited` | Suspend/activate customer or non-privileged staff (`PRODUCT`/`INVENTORY`/`ORDER`/`CONTENT`/`SUPPORT` only; no role creation) | **Y** | **Limited** | — | — | — | — | — |
| | `user.role.manage` | Create/edit roles, assign permissions, grant/revoke any role (MFA step-up) | **Y** | — | — | — | — | — | — |
| | `settings.provider.manage` | Configure payment/shipping/store settings (MFA step-up + audit) | **Y** | — | — | — | — | — | — |
| **Audit Logs** | `audit.read` | Query full immutable platform `audit_logs` | **Y** | **Y** | — | — | — | — | — |
| | `audit.read.scoped` | Query domain-scoped audit events (Inventory: stock/returns; Order: orders/shipments) | **Y** | **Y** | — | **Scoped** | **Scoped** | — | — |

### 4.3 Deny-by-Default & Resource Ownership Enforcement
1. **Default-Closed Guard Chain:** In NestJS `apps/api`, register global `APP_GUARD` chain (`SessionAuthGuard` -> `MfaEnforcementGuard` -> `PermissionGuard`). Any endpoint lacking explicit `@Public()` metadata requires an authenticated session; any `/admin/*` endpoint lacking explicit `@RequirePermissions(...)` MUST reject every request with `403 FORBIDDEN` at runtime and fail startup/CI reflection tests (`check-route-auth-metadata`).
2. **Separation of Duties on Refunds:** Even when `OWNER` holds both `refund.request` and `refund.approve`, if a refund was requested by a staff member and escalated, `audit_logs` records both `requestedBy` and `approvedBy`; non-`OWNER` accounts (`MANAGER`, `ORDER`, `SUPPORT`) are strictly blocked from calling `POST /admin/refunds/:id/approve`.
3. **Self-Ownership Query Scoping:** Customer endpoints (`GET/PATCH /users/me/*`, `GET /orders`, `GET /orders/:orderNumber`, `POST /orders/:id/cancel`, `POST /orders/:id/returns`, `GET /returns/:id`, `GET/POST/DELETE /wishlists/*`, `GET/POST/DELETE /outfits/*`) MUST embed `where: { id, userId: actor.userId }` directly inside the repository query—never fetch by `id` alone and check ownership afterwards without enforcing `userId` scoping.
4. **Admin Limited Constraints:** `SUPPORT` cannot invoke `order.cancel` on orders already in `SHIPPED`/`DELIVERED`/`COMPLETED` states; `MANAGER` calling `user.manage.limited` cannot assign or elevate any user to `OWNER` or `MANAGER` and cannot edit permissions on role definitions.

---

## 5. Threat Model & Concrete Verification Tests

Per Blueprint Sections 15.2 and 18.2, every threat below has both mandatory architectural mitigations and a concrete verification test required for CI / Phase QA sign-off.

| # | Threat | Attack Scenario | Affected Surface | Mandatory Mitigations | Concrete Verification Test (Pass Criteria) |
|---|---|---|---|---|---|
| **T-01** | **Credential Stuffing & Brute Force** | Automated script replays leaked email/password lists against login or attempts MFA TOTP guessing. | `POST /auth/login`, `POST /auth/mfa/verify`, `POST /auth/forgot-password` | `@nestjs/throttler` per-IP + per-email rate limit (`5–10 req/min`); Argon2id cost baseline; generic error messages; mandatory admin TOTP/WebAuthn MFA; TOTP replay window lock (`1 use per 30s step`). | **API Integration / Security Test:** Send 15 rapid failed `POST /auth/login` calls with mixed valid/invalid emails -> verify `429 TOO_MANY_REQUESTS` triggers at threshold, response messages for existing vs non-existing emails are identical (`401 INVALID_CREDENTIALS`), and reused TOTP code returns `401`. |
| **T-02** | **BOLA / IDOR (Orders, Addresses, Returns, Carts)** | Authenticated User A mutates `:id` or `:orderNumber` in URL/body to read/cancel/return User B's order or delete User B's saved address; Guest probes sequential order numbers. | `GET /orders/:orderNumber`, `POST /orders/:id/cancel`, `POST /orders/:id/returns`, `GET /returns/:id`, `/users/me/addresses/:id`, `/cart/*` | Repository-level `WHERE user_id = :currentUserId`; guest orders require `SHA-256(guestToken)` match; `404` / `403` without revealing victim resource metadata. | **Supertest AuthZ Matrix:** Seed User A and User B with orders, addresses, wishlists, and returns. Authenticate as User A and request all User B endpoints -> assert `403` or `404` and zero User B PII/data in body; test guest order lookup with `orderNumber` alone without valid `guestToken` -> assert `401`/`403`. |
| **T-03** | **Price & Discount Manipulation** | Attacker modifies HTTP JSON payload to send `unitPrice: 1`, `discountAmount: 999999`, negative `quantity`, or applies expired/ineligible coupon or Outfit Studio stale price. | `POST /cart/items`, `POST /checkout/quote`, `POST /checkout/orders`, Outfit Studio saved payloads | `.strict()` Zod schemas omit price/discount/status fields completely; backend re-reads authoritative `product_variants.price`, active status, and `coupons` rules inside DB transaction; integer/NUMERIC IDR math only. | **Supertest Tampering Suite:** (a) POST `/checkout/orders` with injected `{ unitPrice: 1, total: 1 }` -> assert `400 VALIDATION_ERROR` (rejected unknown keys). (b) Add item to cart, update variant price in DB from `299000` to `349000`, request quote & create order -> assert quote/order snapshot uses `349000`. (c) Send `quantity: -1` or expired coupon -> assert `400`/`422`. |
| **T-04** | **Overselling Race Condition** | Two or more concurrent checkouts attempt to buy the final `1` available unit of `ARV-TOP-001-BLK-M`. | `POST /checkout/orders`, `inventory_levels`, `stock_reservations` | Sorted `variant_id` update order + atomic conditional SQL (`UPDATE inventory_levels SET quantity_reserved = quantity_reserved + :qty WHERE warehouse_id = :w AND variant_id = :v AND quantity_on_hand - quantity_reserved >= :qty`) + PostgreSQL `CHECK (quantity_reserved <= quantity_on_hand)` + `inventory_movements` entry in same transaction. | **Concurrency Integration Test (`Promise.all` + `k6`):** Initialize variant stock `on_hand = 1, reserved = 0`. Dispatch 20 concurrent `POST /checkout/orders` requests with distinct `Idempotency-Key`s -> assert **exactly 1** returns `201`, **19** return `409 VARIANT_OUT_OF_STOCK`, DB has `quantity_reserved = 1`, `1` active `StockReservation`, and `1` `RESERVATION` movement row. |
| **T-05** | **Webhook Spoofing & Replay** | (a) Attacker posts forged Midtrans `settlement` webhook; (b) Attacker navigates directly to `/checkout/success?order=...`; (c) Midtrans delivers duplicate webhook 3x. | `POST /payments/webhooks/midtrans`, Storefront checkout return page | Verify `SHA512(order_id + status_code + gross_amount + serverKey/signatureSecretKey)` with constant-time compare (`crypto.timingSafeEqual`); call Midtrans `getStatus()` server-to-server; enforce unique `payment_events.provider_event_id`; browser redirect never mutates order/payment state. | **Webhook Security & Idempotency Tests:** (a) Post forged `signature_key` or altered `gross_amount` -> `401/403`, zero state mutation. (b) Replay identical valid webhook 3x concurrently/sequentially -> first commits `PAID` + `SALE` movement once, repeats return `200` idempotently with **1** `payment_events` row and **1** `SALE` ledger movement. (c) Hit storefront success URL without webhook -> order stays `PENDING_PAYMENT`. |
| **T-06** | **Malicious GLB / Image Upload & Parser Exploit** | Staff or compromised account uploads polyglot HTML/JS as `.webp`, malformed glTF binary chunk with zip-bomb/huge buffer, external `uri` pointing to SSRF target, or path traversal in filename (`../../etc/passwd`). | `POST /admin/3d-assets/presign`, `POST /admin/media/presign`, BullMQ `3d-assets` / `media` worker, CDN serving | Server generates random UUID object keys (`products/<slug>/vNNN/model.glb`); ignore client filenames; presigned policy caps size; worker validates GLB magic header (`0x46546C67`), version `2`, chunk bounds, forbids external non-embedded URIs/scripts, checks image magic bytes & re-encodes/strips EXIF; CDN serves with `X-Content-Type-Options: nosniff` and restricted MIME types. | **Asset Pipeline Negative Tests:** Submit malformed GLB bytes, GLB with external `http://169.254.169.254` URI, oversized `> 15 MB` buffer, and HTML file renamed `.png` -> assert validator transitions asset to `FAILED`, blocks `asset.publish` (`422`), and unvalidated object is never exposed on public CDN prefix. |
| **T-07** | **Admin Privilege Escalation (`user.role.manage`)** | `CONTENT`, `SUPPORT`, or `MANAGER` calls admin role assignment endpoint or injects `roles: ['OWNER']` into profile update/registration. | `POST/PATCH /admin/roles`, `PATCH /admin/users/:id/roles`, `PATCH /users/me`, `POST /auth/register` | Dedicated `user.role.manage` permission assigned **exclusively** to `OWNER` with MFA step-up; `StandardSchemaValidationPipe` rejects `role`/`roles` on registration & profile DTOs; self-elevation forbidden; immutable `audit_logs` capture before/after roles. | **RBAC Escalation Test:** Authenticate as `CONTENT`, `SUPPORT`, and `MANAGER` (even with valid MFA) -> call `PATCH /admin/users/:id/roles` and `POST /admin/roles` -> assert `403 FORBIDDEN`. Attempt `PATCH /users/me` with `{ role: 'OWNER' }` -> assert `400` rejected field and DB roles unchanged. |
| **T-08** | **PII / Secret Leakage in Logs & APIs** | Application logs dump full request bodies/headers (`Cookie`, `password`, `email`, `phone`, `address`), or error response prints Prisma SQL / stack trace / Midtrans key. | `packages/observability` logger, NestJS exception filter, `audit_logs`, `/admin/analytics` | Central Pino/structured logger redaction paths (`req.headers.cookie`, `req.headers.authorization`, `password*`, `token*`, `secret*`, `signature*`); PII masker (`a***@domain.com`, `****5678`); production exception filter strips stack/SQL details; `audit_logs` strips secrets and restricts PII snapshots. | **Log & Error Inspection Test:** Trigger validation error, `500` DB error, login, and checkout in integration test; inspect captured structured log stream & HTTP error responses -> assert zero occurrences of plaintext password, session cookie value, `SERVER_KEY`, raw phone/email in info logs, or stack traces in HTTP JSON. |
| **T-09** | **DoS / Resource Abuse on Search & 3D Endpoints** | Attacker floods unindexed search with wildcard/long strings or high-concurrency requests; or repeatedly requests heavy GLB downloads/presigned upload slots. | `GET /products`, `GET /products/:id/3d-assets`, `POST /admin/3d-assets/presign`, WebGL client | Query string length cap (`<= 120` chars), allowlisted sort/filter enums, DB GIN/trigram/B-tree indexes (no dynamic `RegExp`), tight `@Throttle` limits, cursor/bounded pagination (`limit <= 100`), CDN caching for public GETs/GLBs, per-user active upload quota. | **Load & Abuse Test (`k6` / API):** Send `q` > 120 chars or `limit=10000` -> `400 VALIDATION_ERROR`. Burst 100 search/presign calls from single IP/user -> `429 TOO_MANY_REQUESTS` triggered cleanly while cached catalog read P95 stays within budget. |

---

## 6. Privacy, PII Minimization, Masking & Retention Governance

Per Blueprint Section 15.4 and Module 29:

### 6.1 PII Minimization & Consent Separation
- Collect **only** the PII strictly required for account identity, order fulfillment, returns, and statutory recordkeeping: `email`, `full_name`, `phone`, shipping `address` components, and pseudonymous `actor_id` / `request_id`.
- **Marketing Consent Separation:** Newsletter/promotional consent MUST be stored as an explicit, opt-in timestamped flag separate from checkout or registration terms acceptance. Transactional emails (order confirmation, payment receipt, shipping tracking, password reset) operate on contractual necessity; promotional messages strictly check opt-in consent.
- **No PII in Analytics / 3D Telemetry:** Pageview, conversion, and 3D engagement events (`analytics` module) MUST use anonymized/pseudonymous session or aggregate identifiers—never `email`, `phone`, `full_name`, or street address.

### 6.2 Role-Based PII Masking & Logging Rules

| Surface | Full PII Allowed? | Masking / Redaction Rule |
|---|---|---|
| **Application & Error Logs** | **No** | Log `request_id` and pseudonymous `actor_id` (UUID) only; redact `Cookie`, `Authorization`, `password`, `token`, `guest_token`, `SERVER_KEY`, `address`, `phone`, `email`. |
| **Customer Self-Service (`/users/me`, `/orders`)** | **Yes (Own Data Only)** | Authenticated owner or verified guest-token bearer sees their own order/address details. |
| **Admin `OWNER` & `MANAGER`** | **Operational Need** | Full order shipping/contact access for exception handling; `audit_logs` records access to sensitive exports. |
| **Admin `ORDER`** | **Fulfillment Need** | Shipping recipient name, phone, and delivery address visible for dispatch/label creation; no raw auth/payment secret exposure. |
| **Admin `SUPPORT`** | **Masked by Default** | Email masked (`j***@example.com`), phone masked (`****8901`) in list views; full detail only on scoped ticket view if permitted and audit-logged. |
| **Admin `PRODUCT`, `INVENTORY`, `CONTENT`** | **None** | Zero access to customer directory, emails, phones, or shipping addresses. |

### 6.3 Data Retention & Deletion Boundaries

| Data Category | Retention Baseline | Disposal / Anonymization Rule |
|---|---|---|
| **Active / Expired Sessions** | Revoked immediately on logout; expired rows purged within `30 days` | Hard delete expired/revoked rows via scheduled cleanup job. |
| **Password Reset / Verification Tokens** | `15–30 min` / `24h` active; purge expired tokens within `7 days` | Hard delete consumed/expired hashed tokens. |
| **`idempotency_records`** | `24–72 hours` (checkout/payment mutations) | Hard delete expired records after safe settlement window. |
| **Telemetry / Server Logs** | `30–90 days` hot/warm | Pseudonymous only; auto-expire via log lifecycle policy. |
| **Orders, Payments, Refunds & Inventory Ledger** | **Immutable financial record** (minimum statutory/accounting period, e.g., `7 years`) | **Never hard-delete** financial ledger rows (`ARVEN_Full_Blueprint_v1.md` §10.4). |
| **Customer Account Deletion / Erasure Request** | Executed upon verified user request (when no active unsettled order/dispute exists) | Soft-delete/close `User` and hard-delete saved `Addresses`, `Wishlists`, `Carts`, and `Sessions`; **anonymize** `email`, `full_name`, `phone`, and PII inside historical `Order.address_snapshot` (`[REDACTED]`) while preserving SKU/amount/tax/ledger totals for accounting integrity. |
| **`audit_logs`** | Append-only (`>= 2–7 years` per compliance tier) | Immutable (`INSERT` only for app DB role; `UPDATE`/`DELETE` revoked); payload sanitized before write. |

### 6.4 Explicit Ban on Cardholder Credentials (PCI-DSS Boundary)
**ARVEN systems MUST NEVER collect, transmit through custom API forms, cache in Redis, write to logs, or store in PostgreSQL/Object Storage any raw credit/debit card Primary Account Number (PAN), CVV/CVC/CID security code, PIN, or magnetic-stripe data.** All card and payment instrument inputs occur exclusively inside Midtrans-hosted or Midtrans-certified client SDK flows; ARVEN persists only non-sensitive gateway references (`provider_reference`, payment method type, masked/status metadata returned by Midtrans, and `amount`/`currency`).

---

## 7. Security Sign-Off Checklist (Phase 02–09 Enforcement)
Before Phase 09 release (`security` quality checkpoint -> `PASS`), independent `security-qa-agent` verification MUST produce recorded evidence for:
1. Dependency SCA (`pnpm audit` / lockfile check) + SAST + secret scan with zero unmitigated Critical/High findings.
2. AuthN/MFA/Session tests (Argon2id verification, cookie flags, session rotation on login/privilege change, admin MFA enforcement, CSRF rejection).
3. Complete RBAC permission matrix integration suite (`7 roles x permission codes`, fail-closed unannotated route test, BOLA/IDOR matrix).
4. Checkout financial & concurrency integrity suite (tampered price rejection, 20-way oversell lock test, forged/replayed webhook test).
5. Malicious file upload & CSP/CORS header verification (`proxy.ts` nonces, `nosniff`, `frame-ancestors 'none'`).
6. PII log redaction audit & zero card-data storage check.
