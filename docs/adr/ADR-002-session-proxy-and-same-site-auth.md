# ADR-002: Same-Site Session Proxy, Cookie Auth, and Guest Token Boundary

Status: Accepted  
Date: 2026-11-14  
Owners: Architecture Lead / Security Lead  

## Context

[`ARVEN_Full_Blueprint_v1.md`](../../ARVEN_Full_Blueprint_v1.md) (Sections 11.1 and 15.1) mandates `HttpOnly`, `Secure`, `SameSite` session cookies and CSRF protection for browser authentication, while Section 20.3 recommends supporting **Guest Checkout** alongside authenticated accounts (`AMB-04`, `AMB-05`).

In a multi-app monorepo (`apps/storefront`, `apps/admin`, `apps/api`) running locally on distinct ports (`:3000`, `:3001`, `:4000`) and in production potentially across subdomains or separate service origins:
1. Direct cross-origin browser `fetch()` from Storefront/Admin to an API origin forces `SameSite=None; Secure` cookies and complex CORS credential policies, which modern browsers restrict and which widen CSRF exposure.
2. Storing JWT access tokens in `localStorage` or JS-readable cookies violates Blueprint Section 11.1 and exposes sessions to XSS exfiltration.
3. Next.js 16 replaces `middleware.ts` with `proxy.ts` (`export function proxy(request: NextRequest)`).
4. Guest checkout requires safe cart continuity and post-purchase order lookup without exposing orders to sequential IDOR attacks (`orderNumber` enumeration).

## Decision

Adopt a **Same-Site Next.js Proxy Boundary** with isolated cookie scopes and explicit guest token hashing:

1. **Same-Origin `/api/v1/*` Proxy:**
   - Browser JavaScript inside `apps/storefront` and `apps/admin` sends **all** API requests to same-origin `/api/v1/*`.
   - Next.js forwards `/api/v1/*` upstream to `API_INTERNAL_URL` (`apps/api`) via `next.config.ts` `rewrites()` / internal proxy handlers, paired with `proxy.ts` for request correlation (`X-Request-Id`), unauthenticated route redirects (e.g., `/account/*`, `/admin/*`), and header sanitization (stripping untrusted internal headers).
   - Server Components calling `apps/api` directly over the internal network explicitly forward the incoming `Cookie` and `X-Request-Id` headers.
   - External provider webhooks (e.g., Midtrans `POST /api/v1/payments/webhooks/midtrans`) route directly to `apps/api` at the WAF/ingress layer and are excluded from browser proxy cookies.
2. **Scoped Cookie Profile:**
   - **Storefront User Session:** Cookie `__Host-arven_sid` over HTTPS (`arven_sid` in local HTTP dev) with `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in staging/production. Maps via SHA-256 `token_hash` to `sessions` where `scope = 'CUSTOMER'`.
   - **Admin Staff Session:** Cookie `__Host-arven_admin_sid` over HTTPS (`arven_admin_sid` in local HTTP dev) with `HttpOnly`, `SameSite=Lax` (or `Strict`), `Path=/`, `Secure` in staging/production. Maps to `sessions` where `scope = 'ADMIN'`. Customer tokens are rejected on admin endpoints and vice versa.
   - **Admin MFA Gate:** Admin sessions require `sessions.mfa_verified_at IS NOT NULL` (completed via `/api/v1/auth/mfa/verify`) before any `/api/v1/admin/*` route succeeds.
   - **Guest Cart Token:** Cookie `__Host-arven_guest_cart` over HTTPS (`arven_guest_cart` in local HTTP dev) with `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in staging/production, containing a 256-bit cryptographically random opaque token stored SHA-256 hashed in `carts.guest_token_hash`.
3. **CSRF Defense:**
   - State-changing browser requests (`POST`, `PATCH`, `PUT`, `DELETE`) MUST supply `X-CSRF-Token` verified against `sessions.csrf_secret` (or signed pre-login CSRF cookie for anonymous forms like `/auth/login` and `/cart/items`) AND pass strict `Origin`/`Referer` allowlist verification in `apps/api`.
4. **Guest Checkout & Order Tracking Token (`AMB-04`):**
   - When an anonymous customer completes `POST /api/v1/checkout/orders`, `orders.user_id` is `NULL`, `orders.guest_email` stores the buyer email, and the API generates a high-entropy `guestToken` (returned **once** in the creation response and emailed in the order confirmation).
   - Database stores only `SHA256(guestToken)` in `orders.guest_token_hash`.
   - `GET /api/v1/orders/:orderNumber`, `POST /api/v1/payments/:orderId/session`, and `POST /api/v1/orders/:id/returns` require either `session.userId === order.user_id` OR a constant-time verified `X-Guest-Order-Token` / `?token=` query, protected by strict rate limiting.

## Alternatives considered

- **Option A — Cross-Origin API calls with `SameSite=None; Secure` + CORS:** Rejected due to heightened CSRF attack surface, third-party cookie blocking in Safari/Firefox/Chrome privacy modes, and messy local multi-port cookie debugging.
- **Option B — `localStorage` Bearer JWT:** Rejected due to XSS token theft risk and inability to immediately revoke stateless JWTs on logout, password reset, or account suspension without a session blacklist anyway.
- **Option C — Disable Guest Checkout (`user_id NOT NULL`):** Rejected per Blueprint Section 20.3 conversion guidance; luxury D2C storefronts lose significant first-time buyers when forced to register before checkout.

## Consequences

- **Benefits:** Zero cross-origin cookie friction in local or production environments; `SameSite=Lax` + `HttpOnly` + `X-CSRF-Token` defense-in-depth; clean isolation between customer and admin sessions; immediate server-side session revocation via PostgreSQL `sessions.revoked_at` (+ Redis read-through cache invalidation); secure guest checkout without IDOR exposure.
- **Trade-offs:** Next.js frontend containers proxy API traffic (negligible latency overhead on private VPC/loopback, requires preserving `Set-Cookie` headers and streaming body timeouts cleanly); guest order confirmation links must carry the unguessable `guestToken` and mask sensitive address fields where appropriate.

## Verification

- Playwright E2E verifies customer login sets `__Host-arven_sid` / `arven_sid` with `HttpOnly` & `SameSite=Lax`, and admin `/admin` routes redirect/block without MFA-verified `__Host-arven_admin_sid` / `arven_admin_sid`.
- Supertest security suite verifies missing/mismatched `X-CSRF-Token` or invalid `Origin` returns `403 CSRF_INVALID`.
- Supertest IDOR suite confirms User A cannot read User B's order (`403`/`404`) and guest order lookup without valid `guestToken` is denied.
- Logout and password reset immediately invalidate active session tokens even before TTL expiry.
