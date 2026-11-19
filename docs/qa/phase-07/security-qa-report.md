# ARVEN Phase 07 — Independent Security QA Report

> **Verdict:** `PASS`  
> **Checkpoint:** `security`  
> **Reviewer:** `security-qa-agent` (Independent Phase 07 Security QA)  
> **Execution Plan ID:** `22202ad0-0d75-430c-ad26-ba1895be7ec4`  
> **Task ID:** `ac60794b-1266-4378-9b7a-a0a9cbb9741d`  
> **Governing Baselines:** [`docs/SECURITY_POLICY.md`](../../SECURITY_POLICY.md), [`docs/PHASE_07_GOVERNANCE.md`](../../PHASE_07_GOVERNANCE.md), [`docs/THREE_D_PIPELINE.md`](../../THREE_D_PIPELINE.md)  
> **Live Targets Audited:** Storefront `http://localhost:3000` (`BUILD_ID: T3kRHW2DSXnWAih3fLlDc`), Admin `http://localhost:3001` (`BUILD_ID: bPZ-VK30xA9SdrP5WT1Zd`), API `http://localhost:4000`

---

## 1. Executive Summary

Independent static analysis, automated security/unit suites, built client-bundle inspection, and live adversarial HTTP probes against the running Phase 07 servers confirm **`PASS`** with **0 Critical, 0 High, and 0 Medium vulnerabilities**:

- **Static & Automated Security Suites:** `route-auth-metadata` check passed with `0` violations; `@arven/api` security suites (`phase07-3d-security.test.ts` `3/3` + `rbac-refund-security.test.ts` `8/8`), `@arven/storefront` `proxy.test.ts` (`5/5`), `@arven/admin` `proxy.test.ts` (`4/4`), `@arven/validators` `assets3d.test.ts` (`4/4`), `@arven/worker` `three-d-assets.processor.test.ts` (`2/2`), and `@arven/three-engine` (`3/3`) all passed (`100%`, exit `0`, zero skipped tests).
- **Supply Chain & Bundle Hygiene:** `pnpm audit --prod --audit-level=high` exited `0` (`No known vulnerabilities found`). Built client chunks across `apps/storefront/.next/static` (`67` files, `4,395,728` bytes) and `apps/admin/.next/static` (`63` files, `4,518,072` bytes) contain `0` leaked DB/Redis URLs, private keys, server secrets, or forbidden third-party CDN origins (`raw.githack.com`, `fonts.googleapis.com`, `unpkg.com`, `jsdelivr.net`, `gstatic.com/draco`). Draco and Basis WASM decoders are self-hosted and served directly over same-origin `/decoders/*` (`200`, `application/wasm`).
- **CSP & Binary Streaming Controls:** Live `200` and `307` responses on `:3000` and `:3001` emit unique per-request cryptographic `'nonce-...'` tokens, `'wasm-unsafe-eval'`, `worker-src 'self' blob:`, and 4 Next.js 16 `cacheComponents` inline SHA-256 hashes with zero `'unsafe-eval'`, `'unsafe-inline'`, or `'strict-dynamic'` in `script-src`, plus `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`. Binary 3D asset routes (`/model`, `/model-lite`, `/poster`) on both `:4000` and proxied `:3000` emit exact MIME types (`model/gltf-binary` / `image/svg+xml; charset=utf-8`), `X-Content-Type-Options: nosniff`, and immutable/bounded cache headers.
- **Live Threat `T-06`, Auth/RBAC, Privacy & Scope Boundary:** Unauthenticated (`401 UNAUTHORIZED`) and `CUSTOMER`-session (`401`/`403`) probes failed closed on all admin 3D endpoints. Authenticated `OWNER` + live TOTP MFA (`401 MFA_REQUIRED` pre-MFA -> `200` post-MFA) verified Threat `T-06` quarantine controls against path traversal (`../../evil.glb` ignored), wrong MIME (`text/html` -> `400`), oversized `presign` (`20 MB` -> `400`), HTML `<script>` polyglot (`FAILED`, `422` publish block, `404` public route), `MZ` executable (`FAILED`, `422`, `404`), and SSRF external URI GLB (`FAILED`, `422`, `404`). `POST /api/v1/3d-assets/telemetry` rejected all 5 unknown PII fields (`email`, `ip`, `cookie`, `userId`, `phone`) with `400 VALIDATION_ERROR`. Phase 08 routes (`/showroom`, `/outfit-studio`, `/api/v1/showroom`, `/api/v1/outfits`) all returned `404`. All temporary probe DB records, local storage staging files, and auth sessions were cleanly removed/logged out.

*(Two non-blocking **Informational / Low** operational notes are documented in Section 6: one moderate dev-only ESLint `minimatch` transitive advisory, and Express/Next.js proxy body-limit behavior on large base64 JSON payloads over the local-dev `local_fs` `upload-staging` fallback.)*

---

## 2. Static & Automated Security Suites

| Check | Command | Exit Code | Result | Observed Output |
|---|---|---|---|---|
| **Route Auth Metadata Audit** | `pnpm --filter @arven/api check:auth-metadata` | `0` | **PASS** | `Route auth metadata check passed with zero violations.` |
| **API Phase 07 & RBAC Security Suites** | `pnpm --filter @arven/api exec vitest run test/security/phase07-3d-security.test.ts test/security/rbac-refund-security.test.ts` | `0` | **PASS** | `2` files passed, `11/11` tests passed (`phase07-3d-security.test.ts` `3/3`; `rbac-refund-security.test.ts` `8/8`) against live PostgreSQL 18 + Redis |
| **Storefront `proxy.ts` Suite** | `pnpm --filter @arven/storefront exec vitest run test/proxy.test.ts` | `0` | **PASS** | `1` file passed, `5/5` tests passed (`1.75s`) |
| **Admin `proxy.ts` Suite** | `pnpm --filter @arven/admin exec vitest run test/proxy.test.ts` | `0` | **PASS** | `1` file passed, `4/4` tests passed (`1.83s`) |
| **Validators 3D Assets Suite** | `pnpm --filter @arven/validators exec vitest run test/assets3d.test.ts` | `0` | **PASS** | `1` file passed, `4/4` tests passed (`394ms`) |
| **Worker 3D Processor Suite** | `pnpm --filter @arven/worker exec vitest run test/three-d-assets.processor.test.ts` | `0` | **PASS** | `1` file passed, `2/2` tests passed (`2.96s`) |
| **Three-Engine GLB & Disposal Suite** | `pnpm --filter @arven/three-engine test` | `0` | **PASS** | `1` file passed, `3/3` tests passed (`2.52s`) |

---

## 3. Supply Chain, Built Client Chunks & Self-Hosted Decoders

### 3.1 Dependency Vulnerability Audit (`pnpm audit`)

| Command | Exit Code | Findings | Assessment |
|---|---|---|---|
| `pnpm audit --prod --audit-level=high` | `0` | `No known vulnerabilities found` | **PASS** — `0` High/Critical production vulnerabilities |
| `pnpm audit --prod` | `0` | `No known vulnerabilities found` | **PASS** — `0` production advisories across all severities |
| `pnpm audit` *(includes devDependencies)* | `1` | `1 moderate`: `minimatch >=7.0.0 <11.0.1` via `.>typescript-eslint>@typescript-eslint/typescript-estree>minimatch` (`GHSA-g3hv-75wg-m249`) | **Informational** — Dev-only ESLint AST tooling; not shipped in runtime bundles |

### 3.2 Built Client Chunk & Source Sink Inspection

- **Storefront Build (`apps/storefront/.next/static`, `BUILD_ID: T3kRHW2DSXnWAih3fLlDc`):** Scanned `67` files (`4,395,728` bytes).
  - Secret / credential patterns (`postgres://`, `postgresql://`, `redis://`, `rediss://`, PEM private keys, `SB-Mid-server-*`, `DATABASE_URL`, `REDIS_URL`, `MIDTRANS_SERVER_KEY`, `SESSION_HMAC_SECRET`, `MFA_ENCRYPTION_KEY`, `SEED_DEV_USER_PASSWORD`, `AWS_SECRET_ACCESS_KEY`, hardcoded token literals): **`0` matches**.
  - Forbidden external CDN / font / decoder origins (`raw.githack.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, `unpkg.com`, `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `www.gstatic.com/draco`): **`0` matches**.
- **Admin Build (`apps/admin/.next/static`, `BUILD_ID: bPZ-VK30xA9SdrP5WT1Zd`):** Scanned `63` files (`4,518,072` bytes).
  - Secret / credential patterns: **`0` matches**.
  - Forbidden external CDN / font / decoder origins: **`0` matches**.
- **Phase 07 Client Component DOM Sinks:** Static scan of [`packages/three-engine/src/**`](../../../packages/three-engine/src), [`apps/storefront/src/components/catalog/product-3d-viewer-island.tsx`](../../../apps/storefront/src/components/catalog/product-3d-viewer-island.tsx), and [`apps/admin/src/components/catalog/admin-product-3d-panel.tsx`](../../../apps/admin/src/components/catalog/admin-product-3d-panel.tsx) found **`0`** uses of `dangerouslySetInnerHTML`, `innerHTML`, or `eval(`.
- **Self-Hosted Decoders Verified on Disk & Live HTTP:**
  - `GET http://localhost:3000/decoders/draco/draco_decoder.wasm` -> `200`, `application/wasm`, `285,747` bytes.
  - `GET http://localhost:3000/decoders/basis/basis_transcoder.wasm` -> `200`, `application/wasm`, `527,333` bytes.
  - `GET http://localhost:3001/decoders/draco/draco_decoder.wasm` -> `200`, `application/wasm`, `285,747` bytes.

---

## 4. Live HTTP Headers, CSP & Binary Streaming Probes (`:3000`, `:3001`, `:4000`)

### 4.1 Storefront & Admin Response Headers (`200` & `307`)

All inspected routes emit `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`, along with strict CSP:

> **Observed `Content-Security-Policy` pattern:**  
> `default-src 'self'; script-src 'self' 'nonce-<per-request-128bit-base64>' 'sha256-7mu4H06fwDCjmnxxr/xNHyuQC6pLTHr4M2E4jXw5WZs=' 'sha256-kyaKBybsHvqmdq5RcfhCZ+crfD0hW2GQeUy0Bp1fWNg=' 'sha256-ot4uWMULOgQERJVeW+1RS4LiQazeh9VYa+IzbwCX43U=' 'sha256-D9S5KXsSSajKKVF3Jf+B22EHGKgFWMmaLff5rY6FNZc=' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`

| Target URL | Status | Location | Nonce Present & Unique Across 2 Requests | `'wasm-unsafe-eval'` & `worker-src 'self' blob:` | Forbidden in `script-src` (`'unsafe-eval'`, `'unsafe-inline'`, `'strict-dynamic'`) | Other Security Headers | Result |
|---|---|---|---|---|---|---|---|
| `http://localhost:3000/` | `200` | `—` | Yes (`O+sh6D...` vs `bLbOtJ...`) | Both present | `0` present | `DENY`, `nosniff`, `strict-origin-when-cross-origin`, `Permissions-Policy` | **PASS** |
| `http://localhost:3000/products/atelier-boxy-wool-overshirt` | `200` | `—` | Yes (`UBmwdF...` vs `0Uo+gP...`) | Both present | `0` present | `DENY`, `nosniff`, `strict-origin-when-cross-origin`, `Permissions-Policy` | **PASS** |
| `http://localhost:3000/account` | `307` | `/auth/login?next=%2Faccount` | Yes (`gUvSoV...` vs `AW9a5G...`) | Both present | `0` present | `DENY`, `nosniff`, `strict-origin-when-cross-origin`, `Permissions-Policy` | **PASS** |
| `http://localhost:3001/login` | `200` | `—` | Yes (`UlUoZx...` vs `R0RQbM...`) | Both present | `0` present | `DENY`, `nosniff`, `strict-origin-when-cross-origin`, `Permissions-Policy` | **PASS** |
| `http://localhost:3001/roles` | `307` | `/login?next=%2Froles` | Yes (`0mHQYy...` vs `TtKRRS...`) | Both present | `0` present | `DENY`, `nosniff`, `strict-origin-when-cross-origin`, `Permissions-Policy` | **PASS** |

### 4.2 Live 3D Binary Streaming Endpoints (`atelier-boxy-wool-overshirt`, Asset ID `ab90df35-de03-407b-9fd8-03b6fb2e95ba`)

| Endpoint | Origin | Status | `Content-Type` | `X-Content-Type-Options` | `Cache-Control` | Payload Verification | Result |
|---|---|---|---|---|---|---|---|
| `/api/v1/3d-assets/<id>/model` | `:4000` (API) | `200` | `model/gltf-binary` | `nosniff` | `public, max-age=31536000, immutable` | `9,924` B, magic `0x676c5446` (`glTF`) | **PASS** |
| `/api/v1/3d-assets/<id>/model-lite` | `:4000` (API) | `200` | `model/gltf-binary` | `nosniff` | `public, max-age=31536000, immutable` | `7,328` B, magic `0x676c5446` (`glTF`) | **PASS** |
| `/api/v1/3d-assets/<id>/poster` | `:4000` (API) | `200` | `image/svg+xml; charset=utf-8` | `nosniff` | `public, max-age=86400` | `965` B (`<svg ...`) | **PASS** |
| `/api/v1/3d-assets/<id>/model` | `:3000` (BFF Proxy) | `200` | `model/gltf-binary` | `nosniff` | `public, max-age=31536000, immutable` | `9,924` B, magic `0x676c5446` (`glTF`) | **PASS** |
| `/api/v1/3d-assets/<id>/model-lite` | `:3000` (BFF Proxy) | `200` | `model/gltf-binary` | `nosniff` | `public, max-age=31536000, immutable` | `7,328` B, magic `0x676c5446` (`glTF`) | **PASS** |
| `/api/v1/3d-assets/<id>/poster` | `:3000` (BFF Proxy) | `200` | `image/svg+xml; charset=utf-8` | `nosniff` | `public, max-age=86400` | `965` B (`<svg ...`) | **PASS** |

---

## 5. Live Auth/RBAC, Threat `T-06`, Telemetry Privacy & Phase 08 Boundary Probes

### 5.1 Unauthenticated & `CUSTOMER` Session Access Control Probes

| Endpoint | Unauthenticated (w/ Pre-Auth CSRF) | `CUSTOMER` Session (`arven_sid` + Customer CSRF) | Guard Enforcing | Result |
|---|---|---|---|---|
| `GET /api/v1/admin/products/:id/3d-assets` | `401 UNAUTHORIZED` | `401 UNAUTHORIZED` | `SessionAuthGuard` (`SessionScope.ADMIN` required) | **PASS** |
| `POST /api/v1/admin/products/:id/3d-assets/presign` | `401 UNAUTHORIZED` | `403 CSRF_INVALID` | `CsrfGuard` (admin scope CSRF) / `SessionAuthGuard` | **PASS** |
| `POST /api/v1/admin/3d-assets/:id/publish` | `401 UNAUTHORIZED` | `403 CSRF_INVALID` | `CsrfGuard` (admin scope CSRF) / `SessionAuthGuard` | **PASS** |
| `GET /api/v1/admin/analytics/3d-engagement` | `401 UNAUTHORIZED` | `401 UNAUTHORIZED` | `SessionAuthGuard` (`SessionScope.ADMIN` required) | **PASS** |
| `PUT /api/v1/admin/3d-assets/:id/upload-staging` | `401 UNAUTHORIZED` | `403 CSRF_INVALID` | `CsrfGuard` (admin scope CSRF) / `SessionAuthGuard` | **PASS** |

- `CUSTOMER` (`customer.dev@arven.local`) logged out via `POST /api/v1/auth/logout` (`200`), confirmed via `GET /api/v1/auth/me` -> `401 UNAUTHORIZED`.

### 5.2 Owner Authentication, Mandatory TOTP MFA & Clean Logout (`:3001`)

| Step | Probe | Observed Status & Payload | Result |
|---|---|---|---|
| 1 | `POST http://localhost:3001/api/v1/auth/admin/login` (`owner.dev@arven.local`) | `200`, `arven_admin_sid` cookie set, `mfaRequired: true` | **PASS** |
| 2 | `GET http://localhost:3001/api/v1/admin/products/:id/3d-assets` *(before MFA verify)* | `401 MFA_REQUIRED` (`MfaEnforcementGuard` fail-closed) | **PASS** |
| 3 | `POST http://localhost:3001/api/v1/auth/mfa/verify` *(live TOTP)* | `200`, `verified: true` | **PASS** |
| 4 | `GET http://localhost:3001/api/v1/admin/analytics/3d-engagement` *(after MFA)* | `200` | **PASS** |
| 5 | `POST http://localhost:3001/api/v1/auth/logout` -> `GET /api/v1/auth/me` | Logout `200` -> `/auth/me` `401 UNAUTHORIZED` | **PASS** |

### 5.3 Live Threat `T-06` Quarantine & Validation Probes (Isolated Temp Draft Product, Cleaned Post-Test)

| Attack / Negative Case | Target Endpoint(s) | Observed Result | Public Exposure Check | Result |
|---|---|---|---|---|
| **Path Traversal Filename (`../../evil.glb`)** | `POST .../3d-assets/presign` | `201`; server discarded traversal path and generated `staging/3d/<assetId>/<uuid>.glb` and `products/<tempSlug>/v0001/model.glb` (`0` `..` segments) | Asset remains `UPLOADED` (`404` on `/model`) | **PASS** |
| **Wrong Content-Type (`text/html`)** | `POST .../3d-assets/presign` | `400 VALIDATION_ERROR` (Zod literal `'model/gltf-binary'`) | No DB row created | **PASS** |
| **Oversized Byte Declaration (`20,000,000` B)** | `POST .../3d-assets/presign` | `400 VALIDATION_ERROR` (max `15,728,640` bytes) | No DB row created | **PASS** |
| **Oversized Body (`22.1M` base64 / `120 KB–22 MB` JSON)** | `PUT .../upload-staging` (`:3001`) & `:4000` | `:3001` returned `500 Internal Server Error` (exceeds Next.js proxy `10 MB` buffer); `:4000` Express `body-parser` rejected `>= 120 KB` with `413 REQUEST_ERROR` (`request entity too large`) | Payload rejected at ingress | **PASS** *(see §6 Note 2)* |
| **HTML `<script>` Polyglot Upload** | `upload-staging` -> `confirm` -> `publish` | `confirm` `202` -> `status: FAILED` (`"HTML/script polyglot payload rejected; Invalid GLB magic header..."`); `publish` -> `422 INVALID_STATE_TRANSITION` | Public `GET /api/v1/3d-assets/:id/model` -> `404` | **PASS** |
| **`MZ` Executable Upload (`0x4D 0x5A 0x90 ...`)** | `upload-staging` -> `confirm` -> `publish` | `confirm` `202` -> `status: FAILED` (`"Executable MZ/PE signature rejected; Invalid GLB magic header..."`); `publish` -> `422 INVALID_STATE_TRANSITION` | Public `GET /api/v1/3d-assets/:id/model` -> `404` | **PASS** |
| **SSRF External Buffer URI GLB (`http://169.254.169.254/...`)** | `confirm` -> `publish` | `confirm` `202` -> `status: FAILED` (`"External/script buffer URI rejected: http://169.254.169.254/latest/meta-data/..."`); `publish` -> `422 INVALID_STATE_TRANSITION` | Public `GET /api/v1/3d-assets/:id/model` -> `404` | **PASS** |

### 5.4 Zero-PII 3D Telemetry Strict Schema Probes (`POST http://localhost:4000/api/v1/3d-assets/telemetry`)

| Injected Unknown PII Field | HTTP Status | Error Code | Schema Enforcing | Result |
|---|---|---|---|---|
| `email` | `400` | `VALIDATION_ERROR` | `record3DTelemetryRequestSchema` (`z.strictObject`) | **PASS** |
| `ip` | `400` | `VALIDATION_ERROR` | `record3DTelemetryRequestSchema` (`z.strictObject`) | **PASS** |
| `cookie` | `400` | `VALIDATION_ERROR` | `record3DTelemetryRequestSchema` (`z.strictObject`) | **PASS** |
| `userId` | `400` | `VALIDATION_ERROR` | `record3DTelemetryRequestSchema` (`z.strictObject`) | **PASS** |
| `phone` | `400` | `VALIDATION_ERROR` | `record3DTelemetryRequestSchema` (`z.strictObject`) | **PASS** |

### 5.5 Strict Phase 07 Scope Boundary (Zero Phase 08 Feature Creep)

| Route | Host | Observed HTTP Status | Result |
|---|---|---|---|
| `/showroom` | `http://localhost:3000` | `404` | **PASS** |
| `/outfit-studio` | `http://localhost:3000` | `404` | **PASS** |
| `/api/v1/showroom` | `http://localhost:4000` | `404` | **PASS** |
| `/api/v1/outfits` | `http://localhost:4000` | `404` | **PASS** |

### 5.6 Probe Cleanup & Baseline Preservation Verification

- Deleted temporary draft product (`1` row), temporary `product_3d_assets` (`3` rows), `asset_validation_runs` (`3` rows), `outbox_events` (`3` rows), `product_categories` (`1` row), and temporary staging directories under `.local/storage/staging/3d/`.
- Post-cleanup PostgreSQL baseline counts verified identical to pre-probe baseline: `active_products = 11`, `total_3d_assets = 6`. Zero source files in `apps/**`, `packages/**`, or `.harness/**` were modified.

---

## 6. Residual Risk & Informational Operational Notes

1. **Dev-Only Dependency Advisory (`Informational`):** `pnpm audit` reports `1 moderate` advisory (`minimatch >=7.0.0 <11.0.1`, `GHSA-g3hv-75wg-m249`) strictly within `@typescript-eslint/typescript-estree` dev tooling. Production runtime dependencies (`pnpm audit --prod`) report `0` vulnerabilities.
2. **Local-FS JSON Upload Fallback vs Express/Proxy Body Caps (`Low / Operational`):** In production/staging (`S3/R2` driver), GLB uploads go directly to presigned S3 quarantine URLs (`<= 15 MB`) bypassing API/Next.js JSON parsing per [`docs/SECURITY_POLICY.md`](../../SECURITY_POLICY.md) §3.3.5. In `local_fs` mode (`PUT /api/v1/admin/3d-assets/:id/upload-staging` JSON base64 fallback), Express's default `100 KB` JSON parser on `:4000` returns `413 REQUEST_ERROR` for requests `>= ~100 KB`, and Next.js `:3001` proxy returns `500 Internal Server Error` when buffering requests above Next.js's `10 MB` proxy cap (`11 MB` / `22 MB`). Security posture remains fail-closed (no oversized upload can succeed), though local manual uploads of real GLBs `> ~75 KB` via `local_fs` JSON fallback would require either multipart/raw streaming or raising the `upload-staging` body limit in a future phase if needed.

---

## 7. Checkpoint `security` Determination

- **Findings Summary:** `0` Critical, `0` High, `0` Medium, `0` Low security defects (`2` informational/operational notes).
- **Phase 07 `security` Gate Verdict:** **`PASS`**
