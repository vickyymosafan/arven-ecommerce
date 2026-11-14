# ARVEN — Phase 02 Security Governance, Auth/RBAC Baseline & Agent Boundaries

> **Execution Plan ID:** `34ede88d-3a68-4410-8a37-9d1fd18ee2f3`  
> **Task ID:** `c1949bd0-1f23-4c1d-bf9a-1f8d8b8f7155` (`governance-lead` / `subagent-p2-governance`)  
> **Status:** Canonical Phase 02 Security & Delegation Contract  
> **Governing Baselines:** [`AGENTS.md`](../AGENTS.md), [`docs/PRINCIPAL_DEVELOPMENT.md`](./PRINCIPAL_DEVELOPMENT.md), [`docs/SECURITY_POLICY.md`](./SECURITY_POLICY.md), [`docs/API_CONTRACTS.md`](./API_CONTRACTS.md), [`docs/DATA_MODEL.md`](./DATA_MODEL.md), [`docs/PRD_AND_BUSINESS_RULES.md`](./PRD_AND_BUSINESS_RULES.md), [`docs/PHASE_02_DISCOVERY.md`](./PHASE_02_DISCOVERY.md), [`docs/adr/ADR-001`](./adr/ADR-001-tech-stack-and-version-pins.md), [`docs/adr/ADR-002`](./adr/ADR-002-session-proxy-and-same-site-auth.md)  
> **Capability Modules:** `5`, `8`, `23`, `29`, `31`, `33`, `38`, `45`, `59`, `62`, `66`

---

## 1. Policy Precedence, Phase 02 Scope & Honest Blocker Rule

1. **Strict Phase 02 Scope:** Phase 02 implements the monorepo foundation (`pnpm@10.34.9` + Turborepo), non-Docker native local runtime adapters, `packages/database` (full 11-domain Prisma 7 schema + initial migration + seed), `packages/config`, `packages/observability`, `packages/validators`, `packages/contracts`, `apps/api` (health, CSRF, auth, TOTP MFA, users/sessions/addresses, admin RBAC/audit endpoints, global guard chain), `apps/worker` (8 BullMQ queues, `OutboxRelayService`, `notification` worker), and Phase 02 Storefront/Admin shells + Auth UI. Phase 03+ commerce features (catalog browsing APIs, cart, checkout, payments, 3D viewer) MUST NOT be built inside Phase 02.
2. **Policy Precedence (`SECURITY_POLICY.md` §1.1):** Cardholder/PII bans > server-authoritative Auth/RBAC invariants > environment/secret isolation > UX/performance convenience. Never weaken CSP, CSRF, `HttpOnly` cookies, Argon2id costs, or `.strict()` Zod validation to unblock UI or tests.
3. **Zero Silent Security Exceptions:** No `@SkipThrottle` on auth routes, no `CORS *` with credentials, no disabled CSRF on browser routes, and no unannotated endpoints. Any temporary exception requires an explicit Security Exception Record (`<= 14 days` CI/staging max, `0` unapproved in production).
4. **Honest `BLOCKED` Reporting (`AGENTS.md` §2.4 & `PHASE_02_DISCOVERY.md` §3.2):**
   - Native PostgreSQL 18.1 (`127.0.0.1:5432`) enforces password auth (`fe_sendauth: no password supplied`). If local `.env` `DATABASE_URL` credentials are not yet provisioned by the user, `prisma migrate dev`, `prisma db seed`, and PostgreSQL integration/security tests MUST report `BLOCKED` — never fake database/Redis integration passes with mocks. Pure unit tests (e.g., Argon2id helper, Zod schemas, guard metadata unit specs) may run independently and MUST be labeled strictly with their unit-only scope.

---

## 2. Non-Docker Local Runtime Security & Fail-Closed Guardrails

Per the user-mandated **no-Docker** Phase 02 runtime and [`docs/PHASE_02_DISCOVERY.md`](./PHASE_02_DISCOVERY.md):

### 2.1 Fail-Closed Dev Adapter Startup Guardrails (`apps/api`, `apps/worker`, `packages/config`)

Both `apps/api` and `apps/worker` MUST validate configuration at bootstrap using a strict Zod environment schema (`packages/config`) **before** binding HTTP ports, opening BullMQ workers, or accepting requests:

| Variable | Allowed in `development` / `test` | Strictly Forbidden in `NODE_ENV === 'production'` (Fatal Exit) | Required Safety Controls |
|---|---|---|---|
| `EMAIL_DRIVER` | `local_capture` \| `smtp` | **`local_capture`** (MUST throw & abort startup if `NODE_ENV === 'production'`) | In `local_capture`, write rendered emails ONLY to gitignored `.local/emails/` (`0600`/owner-only); **never** log plaintext verification/password-reset tokens to stdout or Pino logs; **never** mount an unauthenticated HTTP inbox endpoint in staging/prod. Production requires verified `smtp`/provider credentials. |
| `STORAGE_DRIVER` | `local_fs` \| `s3` | **`local_fs`** (MUST throw & abort startup if `NODE_ENV === 'production'`) | In `local_fs`, store objects strictly under gitignored `.local/storage/staging/` and `.local/storage/public/`; canonicalize every `objectKey` with `path.resolve(rootDir, key)` and assert `resolved.startsWith(rootDir + path.sep)` to block path traversal (`../`) and null bytes. Staging/production require S3/R2 driver (`s3`). |
| `PAYMENT_DRIVER` *(baseline reservation)* | `local_stub` \| `midtrans` | **`local_stub`** (MUST throw & abort startup if `NODE_ENV === 'production'`) | Retained from `ARCHITECTURE.md` §4.4 so shared config schema fails closed from Phase 02 onward. |
| `SEED_DEV_USERS` | `true` \| `false` | **`true`** (seed script & API bootstrap MUST refuse seeded dev accounts when `NODE_ENV === 'production'`) | Production admin bootstrap MUST NOT use hardcoded fixture passwords. |
| `COOKIE_SECURE` | `false` *(HTTP `127.0.0.1` only)* \| `true` | **`false`** (MUST be `true` when `NODE_ENV === 'production'` or staging) | When `true`, cookies MUST carry `__Host-` prefix, `Secure=true`, `Path=/`, and NO `Domain` attribute. |

### 2.2 Native Host PostgreSQL 18.1 & Memurai 4.2.2 Validation

| Host Service | Verified Endpoint | Startup & Security Validation Rules |
|---|---|---|
| **PostgreSQL 18.1** (`postgresql-x64-18`) | `127.0.0.1:5432` | `DATABASE_URL` MUST be supplied via gitignored `.env` (never hardcoded in `prisma.config.ts` or committed files). Local dev binds loopback (`127.0.0.1` / `localhost`) only. Production/staging require private VPC/TLS (`sslmode=require`) and distinct least-privilege DB roles (`arven_api`, `arven_worker`, `arven_migrator`) per `SECURITY_POLICY.md` §2.1 TB-4. Connection pool timeouts (`statement_timeout = 10000`) enforced on API connections. |
| **Memurai Developer 4.2.2** (`redis_version: 7.4.7`) | `127.0.0.1:6379` | Verified `maxmemory-policy = noeviction` (required for BullMQ durability). Local dev binds loopback only. In `NODE_ENV === 'production'`, `REDIS_URL` MUST NOT use unauthenticated loopback (`redis://127.0.0.1` / `localhost` without password/TLS); require ACL auth + TLS (`rediss://`) or private VPC credentials. `apps/worker` BullMQ client configures `maxRetriesPerRequest: null`; API cache/throttler uses bounded command timeouts. |
| **CORS & Origin Config** | `STOREFRONT_ORIGIN`, `ADMIN_ORIGIN` | Exact origin allowlist (`http://localhost:3000`, `http://localhost:3001` locally; HTTPS origins in staging/prod). Wildcard `*` or dynamic origin reflection MUST reject startup in `production`. |
| **Cryptographic Secrets** | `CSRF_HMAC_SECRET`, `MFA_ENCRYPTION_KEY`, `SESSION_SIGNING_SECRET` *(if used)* | Validated at startup: `MFA_ENCRYPTION_KEY` MUST decode to exact `32 bytes` (256-bit AES-GCM key); `CSRF_HMAC_SECRET` MUST be `>= 32` bytes. Placeholder values (`changeme`, `dev-secret`, repeated characters) MUST fail startup when `NODE_ENV === 'production'`. |

### 2.3 `.gitignore` & Secret Hygiene Baseline

The root `.gitignore` (owned by `architecture-lead`) MUST unconditionally exclude:
- Environment & secret files: `.env`, `.env.local`, `.env.*.local`, `!.env.example`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `secrets/`
- Non-Docker local runtime artifacts: `.local/` (covers `.local/emails/` and `.local/storage/`), `tmp/`, `*.log`
- Build/test/generated artifacts: `node_modules/`, `.turbo/`, `coverage/`, `playwright-report/`, `test-results/`, `packages/database/generated/`

`.env.example` MUST contain **zero** real passwords, tokens, or reusable cryptographic keys — only commented format templates and key-generation instructions (e.g., `openssl rand -hex 32`). CI MUST run automated secret scanning and dependency auditing (`pnpm audit --audit-level=high`) on every PR.

---

## 3. Phase 02 Authentication, Session, CSRF, MFA & Audit Specification

### 3.1 Password Policy & Argon2id Hashing (`argon2@^0.45.2`)

1. **Password Input Policy (`packages/validators`):**
   - Length: **minimum `12` characters, maximum `128` characters** (validated via Zod string bounds without silent truncation).
   - **Never `.trim()` passwords** — preserve leading, trailing, and internal Unicode spaces per OWASP ASVS 5.0 V2.1 (`SECURITY_POLICY.md` §3.1.2). Reject NUL control byte `\u0000`.
   - Check against a breached-password blocklist (baseline top breached passwords + email local-part / `"arven"` trivial pattern check) on registration and password reset.
   - Normalize `email` (`trim().toLowerCase()`) before persistence, lookups, and rate-limit keying.
2. **Argon2id Parameters (Verified against `node-argon2`):**
   - Explicitly pass options to `argon2.hash(password, ...)`:
     - `type: argon2.argon2id`
     - `memoryCost: 65536` (`64 MiB`, meeting `>= 64 MiB` requirement)
     - `timeCost: 3` (`t >= 3`)
     - `parallelism: 4` (`>= 1`)
     - `hashLength: 32` (32-byte tag, 16-byte CSPRNG salt auto-generated by `node-argon2`)
   - Weak hashes (`bcrypt`, `PBKDF2`, `scrypt`, raw `SHA-*`) are strictly forbidden for passwords.
3. **Timing & Enumeration Defense:**
   - When `POST /auth/login` or `POST /auth/admin/login` receives an unknown email, execute a dummy `argon2.verify(DUMMY_ARGON2_HASH, password)` before returning `401 INVALID_CREDENTIALS` so response latency matches existing accounts.
   - Return identical generic error payloads (`401 INVALID_CREDENTIALS`) for unknown email, wrong password, and suspended account. (For `PENDING_VERIFICATION` customer accounts, check `status` ONLY after password verification succeeds before returning `403 ACCOUNT_PENDING_VERIFICATION`.)
   - `POST /auth/forgot-password` MUST return an identical `200 OK` message regardless of whether the email exists.

### 3.2 Opaque Session Tokens, Dual Cookie Namespaces & Rotation

1. **Token Generation & Hashing:**
   - Generate `>= 256-bit` CSPRNG opaque session tokens via `crypto.randomBytes(32).toString('base64url')`.
   - Persist **only** `SHA-256(token)` (`CHAR(64)` lowercase hex) in `sessions.token_hash`. Raw tokens are never stored in PostgreSQL, Memurai/Redis, or logs.
   - If Memurai caches active session lookups, key strictly by `session:sha256:<token_hash>` and delete the cache key **synchronously** in the same flow as logout, `/auth/logout-all`, `/users/me/sessions/:id`, password reset, user suspension, or role mutation.
2. **Strict Cookie Namespace Isolation (`ADR-002`):**

   | Portal | Production / Staging Cookie (`COOKIE_SECURE=true`) | Local HTTP Dev Cookie (`COOKIE_SECURE=false`) | Mandatory Flags | `sessions.scope` | Idle / Absolute TTL |
   |---|---|---|---|---|---|
   | **Storefront (`CUSTOMER`)** | `__Host-arven_sid` | `arven_sid` | `HttpOnly=true`, `SameSite=Lax`, `Path=/`, `Secure` (`true` in staging/prod; NO `Domain` attr) | `'CUSTOMER'` | `7 days` idle / `30 days` absolute |
   | **Admin (`ADMIN`)** | `__Host-arven_admin_sid` | `arven_admin_sid` | `HttpOnly=true`, `SameSite=Strict`, `Path=/`, `Secure` (`true` in staging/prod; NO `Domain` attr) | `'ADMIN'` | `30 minutes` idle / `12 hours` absolute |

   - **Portal Cross-Contamination Prevention (Critical on `localhost`):** Because browsers scope `localhost` cookies by hostname rather than port (`:3000` vs `:3001`), a developer/QA browser can hold both `arven_sid` and `arven_admin_sid` simultaneously.
     - `apps/storefront` `proxy.ts` sets `X-Arven-Portal: storefront` (overwriting any client-supplied value) and `apps/admin` `proxy.ts` sets `X-Arven-Portal: admin`.
     - `apps/api` enforces:
       - Routes decorated with `@CustomerAuth()` (`/users/me*`, customer flows) read **exclusively** `arven_sid`/`__Host-arven_sid` (`scope = 'CUSTOMER'`).
       - Routes decorated with `@AdminAuth()` (`/admin/*`, `/auth/mfa/*`) read **exclusively** `arven_admin_sid`/`__Host-arven_admin_sid` (`scope = 'ADMIN'`).
       - Shared portal auth routes (`/auth/me`, `/auth/logout`, `/auth/logout-all`, `/auth/refresh`) select the cookie matching `Origin` (`ADMIN_ORIGIN` vs `STOREFRONT_ORIGIN`) + `X-Arven-Portal` (and reject mismatched `Origin` vs `X-Arven-Portal`). In headless/Supertest calls with a single cookie and no `Origin`, accept the single supplied cookie matching its `scope`; if both cookies are sent without portal disambiguation, fail closed (`401 UNAUTHORIZED`).
3. **Mandatory Session Rotation & Revocation:**
   - Issue a fresh session token (`token_hash` replaced/rotated, previous token invalidated immediately) on: `/auth/login`, `/auth/admin/login`, `/auth/mfa/verify`, `/auth/refresh`, and role changes.
   - `POST /auth/reset-password` and admin user suspension (`UserStatus -> SUSPENDED`) MUST revoke **all** active sessions (`sessions.revoked_at = NOW()` + Redis cache purge) and emit a security notification email via `outbox_events`.
4. **Verification & Password Reset Tokens:**
   - `>= 32` random bytes (`crypto.randomBytes(32).toString('base64url')`), stored **only** as `SHA-256(token)` in `verification_tokens.token_hash`.
   - TTLs: `EMAIL_VERIFICATION` = **`24 hours`**; `PASSWORD_RESET` = **`30 minutes`** (`15–30m` policy window).
   - Consumed via atomic conditional update (`WHERE token_hash = $1 AND type = $2 AND consumed_at IS NULL AND expires_at > NOW()`).

### 3.3 CSRF Protection (`X-CSRF-Token` + `Origin`)

All state-changing HTTP requests (`POST`, `PUT`, `PATCH`, `DELETE`) MUST pass **both** controls in `CsrfGuard` before reaching controllers:

1. **Strict `Origin` / `Referer` Validation:**
   - Extract `Origin` header (or scheme+host+port from `Referer` if `Origin` is omitted by same-origin user agent).
   - Reject missing or non-allowlisted origins against configured exact `STOREFRONT_ORIGIN` / `ADMIN_ORIGIN` (`403 CSRF_INVALID`).
2. **Cryptographic `X-CSRF-Token` Check:**
   - **Authenticated Session Requests:** Verify `X-CSRF-Token` using `crypto.timingSafeEqual` against HMAC-SHA256(`CSRF_HMAC_SECRET`, `${session.id}:${session.csrf_secret}`) (issued by `GET /api/v1/csrf-token`).
   - **Anonymous Pre-Login Mutations** (`/auth/register`, `/auth/login`, `/auth/admin/login`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`): `GET /api/v1/csrf-token` sets a signed `HttpOnly` pre-auth cookie (`__Host-arven_csrf` / `arven_csrf`, `SameSite=Lax`, `Path=/`) carrying `<nonce>.<hmac(nonce, CSRF_HMAC_SECRET)>` and returns `{ csrfToken: "<nonce>.<hmac>" }`. Mutation validates HMAC signature, token TTL (`<= 2h`), and constant-time equality between `X-CSRF-Token` header and cookie.
3. **CSRF Exemption Rule:**
   - `@SkipCsrf()` is strictly reserved for cryptographically signed third-party webhooks (`/api/v1/payments/webhooks/:provider` in Phase 05). No Phase 02 route may carry `@SkipCsrf()`.

### 3.4 Admin TOTP MFA Enrollment, Replay Lock (`afterTimeStep`) & Step-Up (`<= 15m`)

Implemented with `otplib@^13.6.0` (verified functional API: `generateSecret`, `generateURI`, `verify`):

1. **Mandatory Enrollment & Pre-MFA Lockout:**
   - Every account holding **any** operational role (`OWNER`, `MANAGER`, `PRODUCT`, `INVENTORY`, `ORDER`, `CONTENT`, `SUPPORT`) MUST enroll TOTP (RFC 6238, SHA-1/6 digits/30s period for universal authenticator compatibility) before accessing any `/api/v1/admin/*` route.
   - `POST /api/v1/auth/admin/login` creates an `ADMIN` session with `mfa_verified_at = NULL`. Until verified, `MfaEnforcementGuard` rejects all endpoints lacking `@SkipMfaCheck()` with **`403 MFA_REQUIRED`**.
2. **Anti-Takeover Enrollment Invariant (`mfa_enabled` Guard):**
   - A pre-MFA session (`mfa_verified_at === null`) may call `POST /api/v1/auth/mfa/setup` **ONLY** when `user.mfa_enabled === false` (initial onboarding).
   - If `user.mfa_enabled === true` and `session.mfa_verified_at === null`, `POST /api/v1/auth/mfa/setup` MUST reject with **`403 MFA_ALREADY_ENROLLED`** (preventing password-only attackers from overwriting an enrolled admin's TOTP seed!). Re-enrollment/rotation for an already-enrolled admin requires an MFA-verified session with fresh step-up (`<= 15m`).
   - `POST /api/v1/auth/mfa/setup` encrypts the generated Base32 secret using **AES-256-GCM** (`MFA_ENCRYPTION_KEY`, random 12-byte IV, authenticated tag) into `users.mfa_secret_encrypted` **without** enabling `mfa_enabled = true`; `mfa_enabled` flips to `true` ONLY when `POST /api/v1/auth/mfa/verify` succeeds on a valid live code, at which point single-use recovery codes (stored hashed via Argon2id or HMAC-SHA256; plaintext displayed **once**) are finalized/issued.
3. **Single-Use 30s Window Replay Lock (`afterTimeStep`):**
   - Call `otplib.verify({ secret, token, epochTolerance: 30, afterTimeStep })` where `afterTimeStep` is the user's last verified TOTP time step (omitted when `null`).
   - `verify()` returns `{ valid: true, delta, epoch, timeStep }` or `{ valid: false }`.
   - **Atomic Race-Free Lock:** Upon `result.valid === true`:
     - Enforce atomic PostgreSQL conditional update: `UPDATE users SET mfa_last_time_step = $step WHERE id = $userId AND (mfa_last_time_step IS NULL OR mfa_last_time_step < $step) RETURNING id` (and mirror atomic Redis lock `SET arven:mfa:step:${userId}:${result.timeStep} "1" EX 120 NX`).
     - If `affected_rows !== 1` (same 30s window code replayed sequentially OR concurrently via `Promise.all`), fail closed with **`401 INVALID_MFA_CODE`** (never stamp `mfa_verified_at`).
   - *Data Model Coordination Note (`data-engineer`):* Because [`docs/DATA_MODEL.md`](./DATA_MODEL.md) §5 omitted explicit columns for TOTP replay tracking and recovery codes on `users`, `data-engineer` MUST include additive Domain 1 schema support in Phase 02's initial migration: `users.mfa_last_time_step INTEGER NULL` and `mfa_recovery_codes` table (`id UUID PK`, `user_id UUID FK`, `code_hash TEXT NOT NULL`, `used_at TIMESTAMPTZ(3) NULL`, `created_at TIMESTAMPTZ(3)`).
4. **MFA Step-Up (`<= 15m`):**
   - High-privilege actions (`user.role.manage`, and in Phase 06+ `refund.approve` and `settings.provider.manage`) require `@RequireMfaStepUp(900)`: `Date.now() - session.mfa_verified_at.getTime() <= 15 * 60 * 1000`.
   - If expired (`> 15 minutes`), fail closed with **`403 MFA_STEP_UP_REQUIRED`** so the admin must re-verify via `POST /api/v1/auth/mfa/verify`.

### 3.5 `audit_logs` Immutability & PII / Secret Redaction

1. **PostgreSQL Engine-Level Immutability:**
   - The initial Prisma migration MUST attach a PostgreSQL trigger (`trg_audit_logs_immutable`) on `audit_logs` (`BEFORE UPDATE OR DELETE FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation()`) raising an exception (`audit_logs is append-only`), plus `REVOKE UPDATE, DELETE ON audit_logs` for restricted app DB roles in staging/prod.
2. **Pre-Write Secret Sanitization (`AuditLogService`):**
   - Recursively scrub `before_state` and `after_state` JSONB payloads before persisting: any key matching `/password|secret|token|cookie|authorization|signature|csrf|recovery|mfa_secret|private_key/i` MUST be replaced with `"[REDACTED]"`.
   - Never persist raw passwords, session tokens, CSRF secrets, TOTP secrets, or recovery codes in `audit_logs`.
3. **Structured Log & API PII Masking (`packages/observability` & DTO Presenters):**
   - Pino logger redaction paths MUST strip `req.headers.cookie`, `req.headers.authorization`, `req.headers['x-csrf-token']`, `*.password`, `*.passwordHash`, `*.password_hash`, `*.token`, `*.tokenHash`, `*.secret`, `*.mfaSecret`, `*.mfa_secret_encrypted`, `*.recoveryCodes`, `*.csrfSecret`, `*.DATABASE_URL`, `*.REDIS_URL`, `*.MFA_ENCRYPTION_KEY`.
   - Log only `requestId` and pseudonymous `actorId` (UUID) — never unmasked `email` or `phone` in operational logs.
   - Mask helpers (`maskEmail('alice.tan@arven.id') -> 'a***@arven.id'`, `maskPhone('+6281234567890') -> '****7890'`) used in masked views (`SUPPORT`, `GET /users/me/sessions` IP masking to `/24` or masked suffix).
   - Global exception filter MUST map Prisma, PostgreSQL, Redis, and unhandled errors to `{ success: false, error: { code, message }, meta: { requestId } }` with **zero** SQL text, internal hostnames, or stack traces in HTTP JSON responses.

---

## 4. Phase 02 Auth/RBAC Access Control Matrix & Verification Criteria

### 4.1 Global Guard Chain & Canonical Decorators (`apps/api`)

Register global `APP_GUARD` execution order in `AppModule`:
1. **`ThrottlerGuard`** (Redis/Memurai storage, IP + normalized email/actor keying)
2. **`CsrfGuard`** (runs on `POST`/`PUT`/`PATCH`/`DELETE`; validates `Origin` + `X-CSRF-Token` unless `@SkipCsrf()`)
3. **`SessionAuthGuard`** (denies by default unless `@Public()`; enforces strict `@CustomerAuth()` vs `@AdminAuth()` vs `@PortalAuth()` cookie scope & active session/user checks)
4. **`MfaEnforcementGuard`** (for `ADMIN` sessions: requires `session.mfa_verified_at !== null` unless `@SkipMfaCheck()`; also enforces `@RequireMfaStepUp(seconds)` when declared)
5. **`PermissionGuard`** (denies any `@AdminAuth()` route under `/admin/*` lacking `@RequirePermissions(...)` / `@RequireAnyPermission(...)` with `403 FORBIDDEN`, and checks actor's effective permissions against the seeded 36-row RBAC registry)

**Mandatory Startup / CI Route Reflection Gate (`check-route-auth-metadata`):**
- Bootstraps NestJS `MetadataScanner` / `DiscoveryService` across every registered controller handler.
- Fails if ANY route lacks an explicit auth posture (`@Public()`, `@CustomerAuth()`, `@AdminAuth()`, or `@PortalAuth()`).
- Fails if ANY `/admin/*` route carries `@Public()`, `@SkipMfaCheck()`, or lacks `@RequirePermissions(...)` / `@RequireAnyPermission(...)`.
- Fails if ANY Phase 02 route carries `@SkipCsrf()`.

> **Permission Registry Count Reconciliation (`data-engineer` & `security-engineer`):** `AGENTS.md` refers to 34 granular RBAC permissions while [`docs/SECURITY_POLICY.md`](./SECURITY_POLICY.md) §4.2 tabulates **36 granular permission rows** (adding scoped variants `analytics.read.limited`, `order.read.limited`, and `audit.read.scoped`). Phase 02 MUST seed **all 8 roles** (`OWNER`, `MANAGER`, `PRODUCT`, `INVENTORY`, `ORDER`, `CONTENT`, `SUPPORT`, `CUSTOMER`) and **all 36 permission codes** defined in `SECURITY_POLICY.md` §4.2 so every endpoint guard and scoped view resolves deterministically.

### 4.2 Phase 02 Endpoint-by-Endpoint Auth & RBAC Table

| Method & Route (`/api/v1/...`) | Auth Decorator | RBAC / MFA / Step-Up Decorators | CSRF (`POST/PATCH/DELETE`) | Throttle Profile | `@AuditAction(...)` | Ownership & Domain Security Rule |
|---|---|---|---|---|---|---|
| `GET /health/live` | `@Public()` | — | N/A | Global default | — | Process liveness only; zero secrets/env output |
| `GET /health/ready` | `@Public()` | — | N/A | Global default | — | `SELECT 1` + Redis `PING`; sanitized `200`/`503` without DB/Redis URI or stack trace |
| `GET /csrf-token` | `@Public()` | — | N/A | Global default | — | `Cache-Control: no-store`; issues session-bound or signed pre-auth CSRF token |
| `POST /auth/register` | `@Public()` | — | Required | `5 req/min` (IP) | `@AuditAction('auth.register', 'user')` | Zod `.strict()` rejects `role`/`roles`/`status`; assigns `CUSTOMER` only; Argon2id; emits verification outbox event |
| `POST /auth/login` | `@Public()` | — | Required | `10/min` IP + `5/min` email | `@AuditAction('auth.login', 'session')` | Issues `CUSTOMER` cookie ONLY; constant-time dummy verify if unknown email; identical `401` on invalid/suspended; rotates session |
| `POST /auth/admin/login` | `@Public()` | — | Required | `5/min` IP + email | `@AuditAction('auth.admin.login', 'session')` | Requires `ACTIVE` user holding `>= 1` staff role; pure `CUSTOMER` fails `401`; issues `ADMIN` cookie with `mfa_verified_at = NULL` |
| `POST /auth/mfa/setup` | `@AdminAuth()` | `@SkipMfaCheck()` *(only if `!user.mfaEnabled`; else requires verified + `@RequireMfaStepUp(900)`)* | Required | `5/min` actor | `@AuditAction('auth.mfa.setup', 'user')` | Rejects `403 MFA_ALREADY_ENROLLED` if `mfa_enabled === true && mfa_verified_at === null`; AES-256-GCM secret; does not enable until verified |
| `POST /auth/mfa/verify` | `@AdminAuth()` | `@SkipMfaCheck()` | Required | `5/min` IP + actor | `@AuditAction('auth.mfa.verify', 'session')` | Verifies TOTP (`epochTolerance: 30`, `afterTimeStep` atomic lock) or single-use recovery code; sets `mfa_verified_at` & rotates `ADMIN` session token |
| `POST /auth/logout` | `@PortalAuth()` | `@SkipMfaCheck()` | Required | Global default | `@AuditAction('auth.logout', 'session')` | Portal-matched cookie only; revokes current session + Redis delete + clears cookie (`204`) |
| `POST /auth/logout-all` | `@PortalAuth()` | `@SkipMfaCheck()` | Required | `10/min` actor | `@AuditAction('auth.logout_all', 'user')` | Revokes ALL active sessions for `actor.userId` across DB + Redis + clears cookie (`204`) |
| `POST /auth/refresh` | `@PortalAuth()` | `@SkipMfaCheck()` *(never elevates `mfa_verified_at`)* | Required | `20/min` actor | — | Validates idle (`7d`/`30m`) & absolute (`30d`/`12h`) TTL; rotates opaque token & `token_hash` |
| `POST /auth/forgot-password` | `@Public()` | — | Required | `5/min` IP + email | `@AuditAction('auth.password_reset.request', 'user')` | Uniform `200 OK` regardless of email existence; stores `SHA-256` token (`30m` TTL); enqueues email via outbox |
| `POST /auth/reset-password` | `@Public()` | — | Required | `5/min` IP | `@AuditAction('auth.password_reset.complete', 'user')` | Single-use token; enforces `12–128` char password policy; Argon2id; revokes **all** active sessions |
| `POST /auth/verify-email` | `@Public()` | — | Required | `10/min` IP | `@AuditAction('auth.email.verify', 'user')` | Single-use token (`24h` TTL); transitions `UserStatus -> ACTIVE` & stamps `verified_at` |
| `GET /auth/me` | `@PortalAuth()` | `@SkipMfaCheck()` | N/A | Global default | — | `Cache-Control: no-store`; returns safe allowlisted user/role/permission/MFA flags (zero hashes/secrets) |
| `GET /users/me` | `@CustomerAuth()` | — | N/A | Global default | — | `WHERE id = actor.userId`; allowlisted profile DTO |
| `PATCH /users/me` | `@CustomerAuth()` | — | Required | `20/min` actor | `@AuditAction('user.profile.update', 'user')` | Zod `.strict()` allows ONLY `fullName`, `phone`; rejects `email`/`role`/`roles`/`status` (`400`) |
| `GET /users/me/sessions` | `@CustomerAuth()` | — | N/A | Global default | — | `WHERE user_id = actor.userId AND revoked_at IS NULL`; masks IP/UA safely |
| `DELETE /users/me/sessions/:id` | `@CustomerAuth()` | — | Required | `20/min` actor | `@AuditAction('user.session.revoke', 'session')` | `WHERE id = :id AND user_id = actor.userId` (`404` if unowned); clears Redis cache (`204`) |
| `GET /users/me/addresses` | `@CustomerAuth()` | — | N/A | Global default | — | `WHERE user_id = actor.userId AND deleted_at IS NULL` |
| `POST /users/me/addresses` | `@CustomerAuth()` | — | Required | `20/min` actor | `@AuditAction('user.address.create', 'address')` | Derives `userId` strictly from session; single `isDefault` transaction |
| `PATCH /users/me/addresses/:id` | `@CustomerAuth()` | — | Required | `20/min` actor | `@AuditAction('user.address.update', 'address')` | `WHERE id = :id AND user_id = actor.userId AND deleted_at IS NULL` (`404` if unowned) |
| `DELETE /users/me/addresses/:id` | `@CustomerAuth()` | — | Required | `20/min` actor | `@AuditAction('user.address.delete', 'address')` | Soft delete scoped by `user_id = actor.userId` (`404` if unowned, `204` on success) |
| `GET /admin/roles` | `@AdminAuth()` | `@RequirePermissions('user.read')` | N/A | Global default | — | `OWNER` & `MANAGER` only; lists roles + permission mappings |
| `POST /admin/roles` | `@AdminAuth()` | `@RequirePermissions('user.role.manage')` + `@RequireMfaStepUp(900)` | Required | `10/min` actor | `@AuditAction('role.create', 'role')` | Strictly `OWNER` + MFA `<= 15m`; validates against canonical permission codes |
| `PATCH /admin/roles/:id` | `@AdminAuth()` | `@RequirePermissions('user.role.manage')` + `@RequireMfaStepUp(900)` | Required | `10/min` actor | `@AuditAction('role.update', 'role')` | Strictly `OWNER` + MFA `<= 15m`; forbids stripping `user.role.manage` from `OWNER` |
| `DELETE /admin/roles/:id` | `@AdminAuth()` | `@RequirePermissions('user.role.manage')` + `@RequireMfaStepUp(900)` | Required | `10/min` actor | `@AuditAction('role.delete', 'role')` | Strictly `OWNER` + MFA `<= 15m`; blocks deletion of `is_system = true` roles (`422`) |
| `GET /admin/users` | `@AdminAuth()` | `@RequirePermissions('user.read')` | N/A | Global default | — | `OWNER` full directory; `MANAGER` limited view; zero password/MFA secrets in DTO |
| `PATCH /admin/users/:id/roles` | `@AdminAuth()` | `@RequirePermissions('user.role.manage')` + `@RequireMfaStepUp(900)` | Required | `10/min` actor | `@AuditAction('user.roles.update', 'user')` | Strictly `OWNER` + MFA `<= 15m`; blocks removing last active `OWNER`; revokes target sessions |
| `PATCH /admin/users/:id/status` | `@AdminAuth()` | `@RequirePermissions('user.manage.limited')` | Required | `10/min` actor | `@AuditAction('user.status.update', 'user')` | `MANAGER` blocked (`403`) from mutating `OWNER` or `MANAGER` accounts; `SUSPENDED` revokes sessions |
| `GET /admin/audit-logs` | `@AdminAuth()` | `@RequireAnyPermission('audit.read', 'audit.read.scoped')` | N/A | Global default | — | Cursor-paginated; `OWNER`/`MANAGER` full read; `INVENTORY`/`ORDER` scoped to domain resources only |

### 4.3 Phase 02 Verification Criteria for Threat Tests `T-01`, `T-02`, `T-07`, `T-08`

Independent verification by `security-qa-agent` (`6657bc63-9d17-4ef6-899d-220673a4d9a8`) MUST prove all four Phase 02 threat suites pass without skipped or relaxed assertions:

| Threat ID | Test Suite Scope (Phase 02) | Concrete Attack Probes & Mandatory Pass Criteria |
|---|---|---|
| **`T-01`** | **Credential Stuffing, Brute Force & TOTP Replay** | 1. Send `15` rapid failed `POST /api/v1/auth/login` requests alternating valid registered email + non-existent email -> `429 RATE_LIMITED` triggers at threshold (`<= 10/min`), and pre-throttle failure bodies/codes (`401 INVALID_CREDENTIALS`) are indistinguishable.<br>2. Send `POST /api/v1/auth/forgot-password` for registered vs unregistered email -> identical `200` body before `429` threshold.<br>3. Authenticate admin via `/auth/admin/login`, verify TOTP code `C` via `/auth/mfa/verify` -> `200 OK` (`mfa_verified_at` stamped, session cookie rotated). Immediately replay identical code `C` sequentially AND via `Promise.all` -> `401 INVALID_MFA_CODE` on replay (single-use 30s `afterTimeStep` lock verified).<br>4. Rapid failed `/auth/mfa/verify` calls -> `429 RATE_LIMITED`. |
| **`T-02`** | **BOLA / IDOR & Cross-Portal Session Isolation** | 1. Seed Customer A and Customer B each with saved addresses & active sessions.<br>2. Authenticate as Customer A -> call `PATCH /users/me/addresses/:bId`, `DELETE /users/me/addresses/:bId`, `DELETE /users/me/sessions/:bSid` -> assert `404` / `403`, zero Customer B PII in JSON, and Customer B DB rows untouched.<br>3. Send `PATCH /users/me` with `{ userId: b.id }` or `{ email: "x@y.com" }` -> assert `400 VALIDATION_ERROR` (`.strict()`).<br>4. Present Customer `arven_sid` to `GET /admin/roles` & `POST /auth/mfa/setup` -> `401`/`403`; present pre-MFA `arven_admin_sid` (`mfa_verified_at = null`) to `GET /admin/roles` & `GET /admin/audit-logs` -> `403 MFA_REQUIRED`; present `arven_admin_sid` to `GET /users/me` -> `401`; call `POST /auth/mfa/setup` as pre-MFA session on already-enrolled admin -> `403 MFA_ALREADY_ENROLLED`; submit mutations without `X-CSRF-Token` or with evil `Origin` -> `403 CSRF_INVALID`. |
| **`T-07`** | **Admin Privilege Escalation (`user.role.manage`)** | 1. Authenticate with valid MFA as `MANAGER`, `PRODUCT`, `INVENTORY`, `ORDER`, `CONTENT`, `SUPPORT` -> call `POST /admin/roles`, `PATCH /admin/roles/:id`, `PATCH /admin/users/:id/roles` -> assert `403 FORBIDDEN` for every non-`OWNER` role.<br>2. Authenticate as `MANAGER` -> call `PATCH /admin/users/:ownerOrManagerId/status` -> assert `403 FORBIDDEN`.<br>3. Authenticate as `OWNER` with `mfa_verified_at` backdated `> 15 minutes` -> call `PATCH /admin/users/:id/roles` -> assert `403 MFA_STEP_UP_REQUIRED`. Re-verify MFA -> `200 OK`, role updated, target user sessions revoked, `audit_logs` row persisted.<br>4. Send `POST /auth/register` or `PATCH /users/me` with `{ role: "OWNER" }` / `{ roles: ["OWNER"] }` -> `400 VALIDATION_ERROR`.<br>5. Run `check-route-auth-metadata` -> `0` unannotated endpoints and `0` `/admin/*` endpoints missing permission metadata. |
| **`T-08`** | **PII / Secret Leakage & `audit_logs` Immutability** | 1. Capture `packages/observability` Pino output across register, login (fail/success), MFA setup/verify, password reset, profile update, role mutation, and a forced `500` DB exception.<br>2. Assert captured logs include `requestId` + `actorId` UUID and contain **zero** plaintext passwords, cookie tokens, `X-CSRF-Token`, TOTP Base32 secrets, recovery codes, `MFA_ENCRYPTION_KEY`, `DATABASE_URL` password, or unmasked email/phone strings.<br>3. Assert HTTP JSON responses for `/auth/me`, `/users/me`, `/admin/users`, and forced `500` error omit `password_hash`, `mfa_secret_encrypted`, `mfa_last_time_step`, `token_hash`, `csrf_secret`, SQL strings, and stack traces.<br>4. Assert `audit_logs` records omit redacted secrets and direct SQL `UPDATE` / `DELETE` on `audit_logs` is rejected by PostgreSQL trigger `trg_audit_logs_immutable`. |

---

## 5. Phase 02 Workstream File Ownership & Security Boundaries

Per [`docs/PRINCIPAL_DEVELOPMENT.md`](./PRINCIPAL_DEVELOPMENT.md) §4.2, downstream Phase 02 implementation agents operate on strictly disjoint `ownedPaths` (locked via `principal-agentic-harness` before editing):

| Agent Role | Phase 02 Owned Paths (Exclusive Write Boundary) | Mandatory Security & Stack Duties | Strictly Prohibited |
|---|---|---|---|
| **`data-engineer`** (`e7a8512c-...`) | `packages/database/**` | Implement full 11-domain Prisma 7 schema (`prisma.config.ts`, `PrismaPg`, `ProductStatus` w/ `READY_TO_PUBLISH`, `quantity_on_hand`/`quantity_reserved`, `SALE`, nullable `orders.user_id`), additive `users.mfa_last_time_step` + `mfa_recovery_codes`, all `DATA_MODEL.md` SQL `CHECK` + partial indexes + `trg_audit_logs_immutable` trigger, deterministic Argon2id seed (`8` roles + all `36` permissions + `6` SKUs; dev/test users gated off when `NODE_ENV === 'production'`). | Touching `apps/*`, `packages/validators`, or `.harness/*`; using Prisma 8 RC (`contract.prisma`) or `url = env(...)` in `schema.prisma`; faking DB pass without PostgreSQL 18. |
| **`security-engineer`** (`5452eec5-...`) | `apps/api/src/common/security/**`, `apps/api/src/modules/auth/**`, `apps/api/test/security/**` | Implement Argon2id hasher, AES-256-GCM MFA cipher, SHA-256 session/token hashing, `otplib@13` TOTP setup/verify + `afterTimeStep` atomic replay lock + step-up, `CsrfGuard`, global guard chain (`SessionAuthGuard`, `MfaEnforcementGuard`, `PermissionGuard`), all decorators, `check-route-auth-metadata` reflection check, and security test suites (`T-01`, `T-02`, `T-07`, `T-08`). | Modifying `packages/database/**`, `apps/storefront/**`, `apps/admin/**`, `packages/ui/**`, `apps/api/src/app.module.ts`, or `.harness/*`; relaxing Zod `.strict()` or guard defaults. |
| **`backend-developer`** (`5ff9d4d7-...`) | `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/common/http/**`, `apps/api/src/modules/health/**`, `apps/api/src/modules/users-roles/**`, `apps/api/src/modules/audit-notifications/**`, `apps/api/src/shared/**`, `apps/worker/**`, `packages/contracts/**` | Native ESM (`"type": "module"`, `NodeNext`, `.js` relative imports), `StandardSchemaValidationPipe`, sanitized error filter, `health`, `users-roles` (strict `user_id` scoping + `OWNER`/`MANAGER` constraints), `AuditLogService` redaction, `local_capture` & `local_fs` adapters failing closed in `production`, `apps/worker` Memurai 8-queue setup + `OutboxRelayService` (`FOR UPDATE SKIP LOCKED`), `pnpm contracts:generate`. | Modifying `apps/api/src/common/security/**` or `apps/api/src/modules/auth/**` directly; touching `packages/database/**` or frontend apps; weakening security guards/validation. |
| **`frontend-developer`** (`ba3b25e3-...`) | `packages/ui/**`, `apps/storefront/**`, `apps/admin/**` *(observing Antislop timing rules)* | Next.js 16 `proxy.ts` (CSP with per-request nonce in dynamic `<Suspense>` auth/admin layouts, `frame-ancestors 'none'`, `object-src 'none'`, `X-Request-Id`, overwriting `X-Arven-Portal`), same-origin `/api/v1/*` proxy preserving `Set-Cookie`, zero `localStorage` tokens, `cacheComponents: true` + `<Suspense>`, `DESIGN.md` tokens (no `#8B897F` normal text on light, zero pink, `tabular-nums`, Indonesian copy hygiene), Auth UI & minimal protected Admin/Account shells. | Importing `@arven/database`, `@prisma/client`, `argon2`, `otplib`, or `apps/api/*`; creating `middleware.ts` or `experimental.ppr`; cross-origin API calls; touching backend/database files. |
| **`security-qa-agent`** (`6657bc63-...`) *(Independent)* | Read-only audit + QA report artifacts under `docs/` or test logs *(never editing production src)* | Independently execute `T-01`, `T-02`, `T-07`, `T-08`, cookie/CSRF/CSP header inspection, fail-closed `NODE_ENV === 'production'` adapter startup tests, `check-route-auth-metadata`, `pnpm audit` / secret scan, and record `security` checkpoint status (`PASS`, `FAIL`, or `BLOCKED` if DB creds missing). | Self-attesting own code or marking `BLOCKED` checks as `PASS`. |

---

## 6. Phase 02 Security Exit Gate Checklist

Before Phase 02 can pass `security` and `final-regression` quality checkpoints:
1. Fail-closed startup verification proves `EMAIL_DRIVER=local_capture` and `STORAGE_DRIVER=local_fs` abort startup when `NODE_ENV === 'production'`.
2. `.gitignore` excludes `.env*` (except `.env.example`) and `.local/`; zero secrets appear in Git or build output.
3. Initial Prisma 7 migration + `trg_audit_logs_immutable` trigger + deterministic `8`-role / `36`-permission seed execute cleanly on native PostgreSQL 18.1 (or report `BLOCKED` honestly if `DATABASE_URL` credentials are not provisioned).
4. `apps/worker` connects to Memurai 4.2.2 (`noeviction`), registers all 8 queues, and relays `outbox_events` notifications via `local_capture`.
5. `check-route-auth-metadata` passes with zero unannotated routes and zero unprotected `/admin/*` endpoints.
6. Independent `security-qa-agent` runs `T-01`, `T-02`, `T-07`, `T-08`, CSRF/Origin, cookie flags, and `pnpm audit` with real recorded outputs and zero unresolved Critical/High vulnerabilities.
