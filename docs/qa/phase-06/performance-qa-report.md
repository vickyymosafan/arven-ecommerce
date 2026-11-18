# ARVEN Phase 06 Performance & Bundle QA Report

> **Harness Plan ID:** `c3f9e082-a528-4293-a98b-ad26d1a2dd87`  
> **Task ID:** `5d127f7e-8ccd-457e-a481-aed69dfb0c8b`  
> **Checkpoint ID:** `performance`  
> **Independent Verifier:** `performance-qa-agent`  
> **Git Commit:** `e575168`  
> **Executed (UTC):** `2026-11-18T14:27:16Z`  
> **Browser Engine:** Playwright `1.65.1` / Chromium `156.0.8078.4` (`headless: true`, unthrottled loopback, `domcontentloaded` + `networkidle` + `2000ms` settle + `2000ms` idle window, `Network.clearBrowserCache` per route)  
> **Server Mode Observed:** Live Next.js 16 production servers (`:3000` Storefront `BUILD_ID=RXVxrvla_rcg_Xt3QARyk`, `:3001` Admin `BUILD_ID=jOIB73uoOdtEaCRBbK0jq`, `:4000` NestJS API; verified live `<script src>` filenames match `.next/static/chunks/*` on disk)  
> **Overall Verdict:** **`PASS`**

---

## 1. Executive Summary

Independent Phase 06 performance and bundle isolation verification across Storefront (`http://localhost:3000`), Admin (`http://localhost:3001` authenticated as `owner.dev@arven.local` via live TOTP MFA), API (`http://localhost:4000/api/v1`), and built `.next` production artifacts (`apps/storefront/.next`, `apps/admin/.next`) verified all target criteria:

1. **Strict Phase 07-08 3D Bundle Isolation (`PASS`):**
   - Built `.next` artifacts (`36` static JS files in `apps/storefront/.next/static`, `31` static JS files in `apps/admin/.next/static`, plus all `.next/server` chunks and `package.json` dependency manifests) contain **`0`** occurrences of `three` (`node_modules/three`), `@react-three/fiber`, `@react-three/drei`, `DRACOLoader`, `GLTFLoader`, `KTX2Loader`, `MeshoptDecoder`, `WebGLRenderer`, `THREE.REVISION`, `/decoders/`, `.glb`, `.gltf`, or `.wasm`. Neither `apps/storefront/public/decoders` nor `apps/admin/public/decoders` exists.
   - Live Chromium inspection across `26 / 26` route x viewport runs (`7` Storefront routes x 2 viewports + `6` Admin routes x 2 viewports) confirmed **`0`** `<canvas>` elements and **`0`** 3D/decoder strings in any loaded `<script>` tag or JS network response body.
2. **Live Web Vitals, Transfer Sizes & Runtime Stability (`PASS`):**
   - **Desktop (`1280x800`):** `TTFB` `5ms-9ms`, `FCP` `140ms-332ms`, `LCP` `144ms-424ms`, `CLS` `0` to `0.09375` (all `<= 0.10`), `0` console errors, `0` uncaught `pageerror`, `0` failed network requests, and `0` HTTP `>= 400` / `>= 500` responses across all `13` routes.
   - **Mobile (`375x812`):** `TTFB` `4ms-10ms`, `FCP` `104ms-300ms`, `LCP` `148ms-420ms`, **`CLS = 0` across all `13 / 13` routes**, `0` console/page/network/HTTP errors.
3. **Pagination Bounds & API Latency (`PASS`):**
   - Storefront `/lookbook` (`limit: 24`), `/journal` (`limit: 24`), and Admin `/orders` (`limit: 20`) request bounded pages, and Zod `paginationQuerySchema` enforces `max(100)` (`limit=100` -> `200`, `limit=101` -> `400`).
   - All `8` benchmarked Phase 06 API endpoints responded in **`4.33ms-51.25ms`** (averages **`4.80ms-19.77ms`**), well inside the `< 300ms` local server budget.
4. **Font & Memory/Idle Hygiene (`PASS`):**
   - Self-hosted `next/font/google` (`Cormorant Garamond`, `Plus Jakarta Sans`, `IBM Plex Mono`) loaded `4` local `/_next/static/media/*.woff2` assets per route with **`0`** third-party `fonts.googleapis.com` or `fonts.gstatic.com` network calls.
   - Post-settle `2000ms` idle observation recorded **`0` `requestAnimationFrame` callbacks**, **`0` idle network requests**, and **`0` idle long tasks** across all `26 / 26` runs, with compact JS heap footprints (`4.43 MB - 9.64 MB`).

---

## 2. Phase 07-08 3D Bundle Isolation Audit

### 2.1 Built Production `.next` Artifacts & Package Manifests

Scanned `apps/storefront/.next` (`BUILD_ID: RXVxrvla_rcg_Xt3QARyk`, `29` app routes) and `apps/admin/.next` (`BUILD_ID: jOIB73uoOdtEaCRBbK0jq`, `21` app routes) across `static/` JS/CSS/media and `server/` JS chunks, plus `route-bundle-stats.json`:

| Application | Static JS Files (Total Raw / Gzip) | Static CSS Files (Raw / Gzip) | `package.json` 3D Deps | `public/decoders` Exists | `.glb`/`.gltf`/`.wasm` Files | `three` / `r3f` / `drei` / `DRACOLoader` / `GLTFLoader` / `/decoders/` Matches (Static + Server) | Verdict |
|---|---|---|---|---|---|---|---|
| `@arven/storefront` | `36` (`1,019,188 B` / `309,880 B`) | `1` (`59,407 B` / `10,475 B`) | `0` (`[]`) | `false` | `0` | `0` static + `0` server | **`PASS`** |
| `@arven/admin` | `31` (`1,133,926 B` / `333,785 B`) | `1` (`55,899 B` / `10,017 B`) | `0` (`[]`) | `false` | `0` | `0` static + `0` server | **`PASS`** |

### 2.2 Per-Route First-Load Production JS Budgets (`route-bundle-stats.json`)

| App | Route | First-Load Chunks | Uncompressed JS | Gzipped JS | App CSS (Raw / Gzip) | 3D/WebGL Symbols |
|---|---|---|---|---|---|---|
| Storefront | `/` | `8` | `556,721 B` | `164,887 B` | `59,407 B` / `10,475 B` | `0` |
| Storefront | `/lookbook` | `8` | `549,284 B` | `163,509 B` | `59,407 B` / `10,475 B` | `0` |
| Storefront | `/lookbook/[slug]` | `8` | `549,888 B` | `163,499 B` | `59,407 B` / `10,475 B` | `0` |
| Storefront | `/journal` | `8` | `548,900 B` | `163,413 B` | `59,407 B` / `10,475 B` | `0` |
| Storefront | `/journal/[slug]` | `8` | `548,698 B` | `163,326 B` | `59,407 B` / `10,475 B` | `0` |
| Storefront | `/about` | `8` | `548,514 B` | `163,174 B` | `59,407 B` / `10,475 B` | `0` |
| Storefront | `/account/returns` | `8` | `557,639 B` | `165,720 B` | `59,407 B` / `10,475 B` | `0` |
| Admin | `/` | `9` | `567,950 B` | `167,209 B` | `55,899 B` / `10,017 B` | `0` |
| Admin | `/orders` | `9` | `551,295 B` | `164,620 B` | `55,899 B` / `10,017 B` | `0` |
| Admin | `/orders/[id]` | `10` | `717,060 B` | `207,488 B` | `55,899 B` / `10,017 B` | `0` |
| Admin | `/returns` | `10` | `712,105 B` | `207,433 B` | `55,899 B` / `10,017 B` | `0` |
| Admin | `/coupons` | `10` | `702,275 B` | `205,440 B` | `55,899 B` / `10,017 B` | `0` |
| Admin | `/cms` | `10` | `716,826 B` | `207,498 B` | `55,899 B` / `10,017 B` | `0` |

---

## 3. Live Chromium Web Vitals, Transfer Sizes & Runtime Metrics

Each route was navigated with a cleared browser HTTP cache (`Network.clearBrowserCache`) while keeping auth session cookies intact for protected routes (`/account/returns` authenticated as `customer.dev@arven.local`; Admin routes authenticated as `owner.dev@arven.local` with live TOTP MFA).

### 3.1 Desktop (`1280x800`) Measurements

*Note: On `1280x800`, visible desktop navigation `<Link>` elements trigger Next.js App Router route-chunk prefetching (`16-23` JS requests total), whereas mobile viewports (`375x812`) with collapsed drawers load only the active route chunks (`9-20` JS requests).*

| App & Route | TTFB | DCL | Load | FCP | LCP (Element) | CLS | Long Tasks (`>50ms`) | Reqs (`JS`) | JS Transfer / Decoded | Total Transfer | `<canvas>` / 3D Hits | Errors (`con/pg/fail/5xx`) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `SF /` | `5ms` | `37ms` | `149ms` | `332ms` | `332ms` (`P`) | `0.000209` | `1` | `50` (`16`) | `224,759 B` / `745,819 B` | `370,358 B` | `0` / `0` | `0/0/0/0` |
| `SF /lookbook` | `7ms` | `44ms` | `229ms` | `236ms` | `400ms` (`IMG`) | `0` | `2` | `45` (`16`) | `224,624 B` / `745,702 B` | `357,691 B` | `0` / `0` | `0/0/0/0` |
| `SF /lookbook/monolith-aw26` | `6ms` | `49ms` | `148ms` | `224ms` | `408ms` (`P`) | `0.093750` (`FOOTER`) | `2` | `42` (`16`) | `224,624 B` / `745,702 B` | `354,313 B` | `0` / `0` | `0/0/0/0` |
| `SF /journal` | `6ms` | `51ms` | `228ms` | `240ms` | `424ms` (`IMG`) | `0` | `2` | `56` (`18`) | `228,235 B` / `752,555 B` | `371,604 B` | `0` / `0` | `0/0/0/0` |
| `SF /journal/the-architecture-of-daily-uniforms` | `6ms` | `54ms` | `199ms` | `140ms` | `388ms` (`H1`) | `0.038544` (`FOOTER`) | `2` | `44` (`16`) | `224,451 B` / `744,512 B` | `355,142 B` | `0` / `0` | `0/0/0/0` |
| `SF /about` | `5ms` | `39ms` | `201ms` | `212ms` | `344ms` (`P`) | `0.043828` (`FOOTER`) | `2` | `49` (`17`) | `226,506 B` / `749,278 B` | `359,462 B` | `0` / `0` | `0/0/0/0` |
| `SF /account/returns` | `5ms` | `34ms` | `123ms` | `144ms` | `144ms` (`H1`) | `0.024935` (`FOOTER`) | `0` | `59` (`22`) | `245,242 B` / `803,324 B` | `389,428 B` | `0` / `0` | `0/0/0/0` |
| `Admin /` | `8ms` | `54ms` | `155ms` | `168ms` | `252ms` (`P`) | `0.030408` (`DIV`) | `1` | `55` (`22`) | `266,772 B` / `891,955 B` | `404,239 B` | `0` / `0` | `0/0/0/0` |
| `Admin /orders` | `9ms` | `67ms` | `245ms` | `260ms` | `260ms` (`P`) | `0.059873` (`DIV`) | `2` | `64` (`23`) | `274,043 B` / `922,237 B` | `426,582 B` | `0` / `0` | `0/0/0/0` |
| `Admin /orders/a4fc2e45-...` | `8ms` | `67ms` | `213ms` | `164ms` | `164ms` (`P`) | `0.002733` | `2` | `58` (`23`) | `274,043 B` / `922,237 B` | `415,989 B` | `0` / `0` | `0/0/0/0` |
| `Admin /returns` | `8ms` | `54ms` | `298ms` | `320ms` | `320ms` (`P`) | `0.007732` | `1` | `61` (`23`) | `274,043 B` / `922,237 B` | `418,709 B` | `0` / `0` | `0/0/0/0` |
| `Admin /coupons` | `8ms` | `56ms` | `297ms` | `220ms` | `220ms` (`P`) | `0.016831` (`DIV`) | `2` | `55` (`22`) | `266,772 B` / `891,955 B` | `404,409 B` | `0` / `0` | `0/0/0/0` |
| `Admin /cms` | `7ms` | `47ms` | `290ms` | `288ms` | `288ms` (`P`) | `0.000887` | `1` | `55` (`22`) | `266,772 B` / `891,955 B` | `405,875 B` | `0` / `0` | `0/0/0/0` |

### 3.2 Mobile (`375x812`) Measurements

| App & Route | TTFB | DCL | Load | FCP | LCP (Element) | CLS | Long Tasks (`>50ms`) | Reqs (`JS`) | JS Transfer / Decoded | Total Transfer | `<canvas>` / 3D Hits | Errors (`con/pg/fail/5xx`) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `SF /` | `7ms` | `45ms` | `152ms` | `160ms` | `160ms` (`P`) | `0` | `1` | `22` (`9`) | `169,281 B` / `561,063 B` | `285,764 B` | `0` / `0` | `0/0/0/0` |
| `SF /lookbook` | `6ms` | `42ms` | `213ms` | `224ms` | `376ms` (`IMG`) | `0` | `1` | `32` (`10`) | `171,101 B` / `565,051 B` | `288,996 B` | `0` / `0` | `0/0/0/0` |
| `SF /lookbook/monolith-aw26` | `8ms` | `46ms` | `178ms` | `188ms` | `420ms` (`IMG`) | `0` | `1` | `29` (`10`) | `171,101 B` / `565,051 B` | `287,262 B` | `0` / `0` | `0/0/0/0` |
| `SF /journal` | `4ms` | `38ms` | `236ms` | `244ms` | `408ms` (`IMG`) | `0` | `1` | `33` (`10`) | `170,832 B` / `563,477 B` | `291,109 B` | `0` / `0` | `0/0/0/0` |
| `SF /journal/the-architecture-of-daily-uniforms` | `6ms` | `44ms` | `188ms` | `112ms` | `380ms` (`IMG`) | `0` | `1` | `31` (`10`) | `170,832 B` / `563,477 B` | `288,007 B` | `0` / `0` | `0/0/0/0` |
| `SF /about` | `6ms` | `43ms` | `212ms` | `104ms` | `356ms` (`P`) | `0` | `1` | `28` (`9`) | `168,864 B` / `559,814 B` | `281,670 B` | `0` / `0` | `0/0/0/0` |
| `SF /account/returns` | `6ms` | `50ms` | `142ms` | `148ms` | `148ms` (`H1`) | `0` | `1` | `53` (`20`) | `240,857 B` / `794,092 B` | `379,657 B` | `0` / `0` | `0/0/0/0` |
| `Admin /` | `8ms` | `41ms` | `135ms` | `148ms` | `148ms` (`P`) | `0` | `1` | `18` (`9`) | `169,909 B` / `567,950 B` | `275,073 B` | `0` / `0` | `0/0/0/0` |
| `Admin /orders` | `8ms` | `52ms` | `192ms` | `252ms` | `252ms` (`P`) | `0` | `1` | `25` (`12`) | `219,949 B` / `751,333 B` | `333,973 B` | `0` / `0` | `0/0/0/0` |
| `Admin /orders/a4fc2e45-...` | `8ms` | `54ms` | `213ms` | `148ms` | `148ms` (`P`) | `0` | `2` | `25` (`12`) | `219,949 B` / `751,333 B` | `332,229 B` | `0` / `0` | `0/0/0/0` |
| `Admin /returns` | `8ms` | `47ms` | `292ms` | `220ms` | `220ms` (`P`) | `0` | `2` | `26` (`12`) | `223,729 B` / `767,851 B` | `335,804 B` | `0` / `0` | `0/0/0/0` |
| `Admin /coupons` | `8ms` | `43ms` | `285ms` | `300ms` | `300ms` (`P`) | `0` | `1` | `22` (`11`) | `214,465 B` / `727,739 B` | `322,462 B` | `0` / `0` | `0/0/0/0` |
| `Admin /cms` | `10ms` | `51ms` | `285ms` | `200ms` | `200ms` (`P`) | `0` | `2` | `22` (`11`) | `216,523 B` / `742,290 B` | `325,981 B` | `0` / `0` | `0/0/0/0` |

*Observation note:* Desktop `/lookbook/monolith-aw26` recorded `CLS = 0.09375` (`FOOTER` shifted at `346ms` when the `min-h-[60dvh]` skeleton settled into the rendered lookbook detail layout). It passes the `<= 0.10` threshold (`PASS`) with zero mobile shift (`0`).

---

## 4. Pagination Enforcement & API Response Latency (`http://localhost:4000/api/v1`)

### 4.1 Direct API Endpoint Latency (`5` samples each, `< 300ms` budget)

| Endpoint | HTTP Status | Items Returned | Pagination Meta | Min (ms) | Avg (ms) | Max (ms) | Threshold (`< 300ms`) |
|---|---|---|---|---|---|---|---|
| `GET /api/v1/cms/lookbooks?page=1&limit=20` | `200` | `2` | `page: 1, limit: 20, total: 2, totalPages: 1` | `6.36` | `16.46` | `51.25` | **`PASS`** |
| `GET /api/v1/cms/journal?page=1&limit=20` | `200` | `3` | `page: 1, limit: 20, total: 3, totalPages: 1` | `6.84` | `8.94` | `13.17` | **`PASS`** |
| `GET /api/v1/cms/pages/about` | `200` | `—` | `requestId` envelope | `4.39` | `5.82` | `9.82` | **`PASS`** |
| `GET /api/v1/products?page=1&limit=20` | `200` | `11` | `page: 1, limit: 20, total: 11, totalPages: 1` | `14.58` | `19.77` | `30.28` | **`PASS`** |
| `GET /api/v1/admin/orders?page=1&limit=20` (`OWNER`) | `200` | `20` | `page: 1, limit: 20, total: 41, totalPages: 3` | `9.90` | `15.26` | `21.18` | **`PASS`** |
| `GET /api/v1/admin/returns?page=1&limit=20` (`OWNER`) | `200` | `2` | `page: 1, limit: 20, total: 2, totalPages: 1` | `5.92` | `7.84` | `10.02` | **`PASS`** |
| `GET /api/v1/admin/coupons?page=1&limit=20` (`OWNER`) | `200` | `5` | `page: 1, limit: 20, total: 5, totalPages: 1` | `4.33` | `4.80` | `5.75` | **`PASS`** |
| `GET /api/v1/admin/analytics/sales` (`OWNER`) | `200` | `—` | `requestId` envelope | `5.38` | `6.07` | `7.71` | **`PASS`** |

### 4.2 Pagination Cap & Page-Size Verification

- **Frontend Call Sites:** Storefront `/lookbook` and `/journal` request `page: 1, limit: 24`; Admin `/orders` requests URL-synced `page` with `limit: 20`.
- **Backend Hard Cap (`paginationQuerySchema` `max(100)`):**
  - `GET /api/v1/cms/lookbooks?page=1&limit=100` -> `200` | `?page=1&limit=101` -> **`400`** (`PASS`)
  - `GET /api/v1/cms/journal?page=1&limit=100` -> `200` | `?page=1&limit=101` -> **`400`** (`PASS`)
  - `GET /api/v1/admin/orders?page=1&limit=100` -> `200` | `?page=1&limit=101` -> **`400`** (`PASS`)

---

## 5. Self-Hosted Font & Idle Memory/Timer Hygiene

| Check | Storefront (`7` routes x 2 viewports) | Admin (`6` routes x 2 viewports) | Verdict |
|---|---|---|---|
| `next/font/google` self-hosted `.woff2` count in `.next/static/media` | `21` files | `21` files | **`PASS`** |
| Loaded `document.fonts` families on runtime routes | `Cormorant Garamond`, `Plus Jakarta Sans`, `IBM Plex Mono` (`4` local `/_next/static/media/*.woff2` requests/route) | `Cormorant Garamond`, `Plus Jakarta Sans`, `IBM Plex Mono` (`4` local `/_next/static/media/*.woff2` requests/route) | **`PASS`** |
| Third-party `fonts.googleapis.com` / `fonts.gstatic.com` network calls | `0` | `0` | **`PASS`** |
| Post-settle `2000ms` idle `requestAnimationFrame` callbacks | `0` across all `14` runs | `0` across all `12` runs | **`PASS`** |
| Post-settle `2000ms` idle network requests & idle long tasks | `0` / `0` across all `14` runs | `0` / `0` across all `12` runs | **`PASS`** |
| `performance.memory.usedJSHeapSize` range | `4.43 MB - 8.35 MB` | `4.71 MB - 9.64 MB` | **`PASS`** |

---

## 6. Verification Evidence Paths

- **Bundle Audit Script:** `C:\Users\vickymosafan\.gemini\antigravity\brain\5e5789f9-6950-40bc-8305-52b40e1bd98a\scratch\audit-bundle.mjs`
- **Bundle Audit JSON:** `C:\Users\vickymosafan\.gemini\antigravity\brain\5e5789f9-6950-40bc-8305-52b40e1bd98a\scratch\bundle-audit.json`
- **Runtime Audit Script:** `C:\Users\vickymosafan\.gemini\antigravity\brain\5e5789f9-6950-40bc-8305-52b40e1bd98a\scratch\audit-runtime.mjs`
- **Runtime Audit JSON:** `C:\Users\vickymosafan\.gemini\antigravity\brain\5e5789f9-6950-40bc-8305-52b40e1bd98a\scratch\runtime-audit.json`
