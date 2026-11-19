# ARVEN Phase 07 Performance & 3D Bundle Isolation QA Report (Post-Repair Iteration 5)

> **Harness Plan ID:** `22202ad0-0d75-430c-ad26-ba1895be7ec4`  
> **Task ID:** `37a255a3-98fd-4ded-a6c3-9cde1faa7e66`  
> **Checkpoint ID:** `performance`  
> **Independent Verifier:** `performance-qa-agent`  
> **Governing Baselines:** [`docs/THREE_D_PIPELINE.md`](../../THREE_D_PIPELINE.md), [`docs/PHASE_07_ARCHITECTURE.md`](../../PHASE_07_ARCHITECTURE.md), [`docs/PRINCIPAL_DEVELOPMENT.md`](../../PRINCIPAL_DEVELOPMENT.md)  
> **Initial Audit Window (UTC):** `2026-11-18T21:05:27Z` – `2026-11-18T21:13:49Z` (`FAIL` — `DEFECT-P7-PERF-01`: Mobile `/about` `CLS = 0.188787`; plus `OBS-P7-PERF-01`, `OBS-P7-PERF-02`)  
> **Repair Iteration 5 Re-Verification (UTC):** `2026-11-19T02:59:30Z` – `2026-11-19T03:01:24Z`  
> **Rebuilt Live Builds Audited:**  
> - Storefront (`http://localhost:3000`): `BUILD_ID = douNM115Zi-mVNgjnY8D1` (`apps/storefront/.next`)  
> - Admin (`http://localhost:3001`): `BUILD_ID = iVb8PHvKNleMdA48fKBrP` (`apps/admin/.next`)  
> - API (`http://localhost:4000`): Live (`PostgreSQL 18` + `Memurai/Redis`)  
> **Browser Engine:** Playwright `1.65.1` / Chromium `156.0.8078.4` (`D:\ms-playwright\chromium-1248\chrome-win64\chrome.exe`, `headless: true`, `--enable-webgl --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist --enable-precise-memory-info`, `Network.clearBrowserCache` per route)  
> **Overall Checkpoint Verdict:** **`PASS`** *(Repair Iteration 5 resolved `DEFECT-P7-PERF-01`, `OBS-P7-PERF-01`, and `OBS-P7-PERF-02`: `100%` of routes pass `CLS <= 0.10` (`0` on Mobile & Desktop `/about` across `3/3` cold runs), `0` console/page/4xx/5xx errors across all `28` Storefront & Admin routes, `0 B` 3D chunk/asset leakage on all non-3D routes & initial `2D Mode`, `0` idle `rAF` frames / network requests / long tasks during `2000ms` post-`ready` quiescence, bounded `5`-cycle GPU/JS heap disposal, and `< 19ms` P95 3D API latency.)*

---

## 1. Executive Summary & Repair Closure Matrix

| Defect / Advisory ID | Initial Finding (`T3kRHW2DSXnWAih3fLlDc` / `bPZ-VK30xA9SdrP5WT1Zd`) | Repair Iteration 5 Re-Verification (`douNM115Zi-mVNgjnY8D1` / `iVb8PHvKNleMdA48fKBrP`) | Status |
|---|---|---|---|
| **`DEFECT-P7-PERF-01`** | Storefront Mobile `375x812` `/about` recorded **`CLS = 0.188787 > 0.10`** (`3/3` cold runs) due to `<LoadingState>` lacking vertical space reservation and shifting `<footer>` off-screen. | Added `className="min-h-[85dvh]"` in [`apps/storefront/src/app/about/page.tsx#L78`](../../../apps/storefront/src/app/about/page.tsx#L78). Measured **`CLS = 0.000`** across **`3/3` Mobile (`375x812`) + `3/3` Desktop (`1280x800`)** cold runs and in the full suite (`0` shifts). | **CLOSED** |
| **`OBS-P7-PERF-01`** | 2D-only PDP `/products/form-structured-calfskin-crossbody` unconditionally fetched `/api/v1/products/.../3d-assets`, logging `1` HTTP `404` + `1` console error. | Gated `storefrontApi.getProduct3DAssets(slug)` on `if (!data.has3dEnabled)` in [`product-detail-view.tsx#L88-L95`](../../../apps/storefront/src/components/catalog/product-detail-view.tsx#L88-L95). Verified **`0` `/3d-assets` requests**, **`0` HTTP `4xx/5xx`**, and **`0` console/page errors** on both `1280x800` and `375x812`. | **CLOSED** |
| **`OBS-P7-PERF-02`** | Self-hosted `/decoders/*` served with `Cache-Control: public, max-age=0`. | Added `headers()` rule for `/decoders/:path*` in [`apps/storefront/next.config.ts#L12-L24`](../../../apps/storefront/next.config.ts#L12-L24) & [`apps/admin/next.config.ts#L12-L24`](../../../apps/admin/next.config.ts#L12-L24). Storefront (`:3000`) `.wasm` & `.js` decoders and Admin (`:3001`) `.wasm` decoders return `200`, `Cache-Control: public, max-age=31536000, immutable` *(unauthenticated Admin `.js` redirects via [`apps/admin/src/proxy.ts#L129`](../../../apps/admin/src/proxy.ts#L129) matcher exclusion for `wasm`, remaining accessible inside authenticated Admin sessions)*. | **CLOSED** |

### Post-Repair Checkpoint Summary

| Audit Dimension | Scope & Samples | Empirical Result | Verdict |
|---|---|---|---|
| **1. Zero-3D Bundle Isolation (Static `.next` + Live Network)** | `28` Storefront static routes (`41` JS files), `20` Admin static routes (`37` JS files); `20` cold Storefront Non-3D visits + `2D` initial 3D PDP + `7` Admin Non-3D routes + Admin pre-Preview | **`0` bytes, `0` chunks, `0` symbols** of `three`, `@react-three/fiber`, `@react-three/drei`, `GLTFLoader`, `DRACOLoader`, `KTX2Loader`, `MeshoptDecoder`, `/decoders/`, `.glb`, or `.wasm` on EVERY non-3D route, 2D-only PDP, initial `2D Mode`, and Admin pre-click | **`PASS`** |
| **2. PDP Lazy-Load Delta, Mobile Lite Profile & Cache Budget** | `/products/atelier-boxy-wool-overshirt` (`1280x800` & `375x812`) | Lazy chunk `3l0swxfw52ba_.js` (`312,952 B` wire / `1,138,007 B` raw) loads strictly on `Model 3D` click; Desktop loads `/model` (`9,924 B` raw / `3,132 B` gzip wire, `immutable`); Mobile loads `/model-lite` (`7,328 B` raw / `2,800 B` gzip wire, `activeTier = "lite"`, `0` `/model` reqs); `clickToReady`: `552 ms` (Desktop) / `514 ms` (Mobile); `0` external CDN fetches | **`PASS`** |
| **3. WebGL `frameloop="demand"` Idle Quiescence & Disposal** | `2000ms` idle window post-`ready` (Desktop & Mobile) + `5`-cycle (`Foto 2D` <-> `Model 3D`) | **`0` idle `rAF` frames**, **`0` idle network requests**, **`0` idle long tasks (`> 50ms`)**; `geometries = 1`, `textures = 2` invariant on mount, `disposedResources = 6` on all `5/5` unmounts, `contextLostCount = 0`, bounded heap (`10.67 -> 11.89 MB`) | **`PASS`** |
| **4. Core Web Vitals (`CLS <= 0.10`, `LCP`, `TTFB`, Errors)** | `10` Storefront Non-3D + `1` 3D PDP (`x2` viewports) + `8` Admin Desktop routes | **`100%` of routes `CLS <= 0.0953`** (`0.000` on Desktop & Mobile `/about`, `0.000` on 2D/3D PDPs); **`0` console errors, `0` page errors, `0` HTTP `4xx/5xx`** across all `28` audited views | **`PASS`** |
| **5. Live 3D API Latency Benchmark (`:4000`)** | `6` endpoints x `10` warm sequential calls (+ `1` warmup) | `100%` `200`/`202`; `min`: `2.76–4.11 ms`, `avg`: `4.29–6.87 ms`, `p95`: `4.89–18.85 ms`, `max`: `4.89–18.85 ms` | **`PASS`** |

---

## 2. Strict Zero-3D Bundle Isolation Audit (Rebuilt Artifacts)

### 2.1 Static `.next` Production Build Manifest & Chunk Inspection

| Application | `BUILD_ID` | Static JS Inventory | Static CSS | External CDN Matches | Lazy-Only 3D Engine Chunk | Non-3D Routes 3D Chunks / Symbols |
|---|---|---|---|---|---|---|
| **Storefront** | `douNM115Zi-mVNgjnY8D1` | `41` files (`34` chunks + `4` decoder media JS + `3` Next manifests): `3,070,418 B` raw / `815,178 B` gzip | `static/chunks/21se6qxlsjb6n.css` (`62,156 B` / `10,948 B` gzip) | **`0`** | `static/chunks/3l0swxfw52ba_.js` (`1,138,007 B` / `312,304 B` gzip; mapped only in `/products/[slug]/page/react-loadable-manifest.json` module `54902`) | **`0` / `0`** across all `27` non-PDP routes |
| **Admin** | `iVb8PHvKNleMdA48fKBrP` | `37` files (`30` chunks + `4` decoder media JS + `3` Next manifests): `3,196,609 B` raw / `841,789 B` gzip | `static/chunks/0ja7i2853rb-l.css` (`58,257 B` / `10,445 B` gzip) | **`0`** | `static/chunks/388bwt13ulspo.js` (`1,124,678 B` / `307,739 B` gzip; mapped only in `/catalog/products/[id]/page/react-loadable-manifest.json` module `54902`) | **`0` / `0`** across all `19` non-product-detail routes |

- **Storefront `/products/[slug]` Boundary:** Rebuilt eager route chunk `static/chunks/3o60ly_ji6d43.js` (`25,582 B` raw / `7,499 B` gzip) contains only the `next/dynamic({ ssr: false })` loader stub referencing async module `54902` (`static/chunks/3l0swxfw52ba_.js`) and decoder path strings, with **`0`** `three` / `WebGLRenderer` / `react-three` / `GLTFLoader` / `DRACOLoader` / `KTX2Loader` / `MeshoptDecoder` symbols (`false`).
- **Admin `/catalog/products/[id]` Boundary:** Eager chunk `static/chunks/2vpsv2hvfy94c.js` (`45,106 B` raw / `11,989 B` gzip) contains only the `next/dynamic` stub (`388bwt13ulspo.js`) and pure-TS `@arven/three-engine/glb` helpers (`0` Three.js/R3F/Drei runtime code).

### 2.2 Live Chromium Cold Network Transfer & Runtime JS Symbol Scan

Every cold route cleared `Network.clearBrowserCache` inside an isolated browser context and scanned all downloaded JS payloads for 3D symbols.

#### Storefront Non-3D Routes + 2D Initial Modes (`1280x800` Desktop & `375x812` Mobile)

| Route | Desktop JS Transfer / Decoded (Reqs) | Mobile JS Transfer / Decoded (Reqs) | 3D Chunk / Symbol Hits (D / M) | `/decoders/`, `.glb`, `.wasm` Bytes (D / M) | `<canvas>` Count (D / M) | `__ARVEN_3D_DIAGNOSTICS__` |
|---|---|---|---|---|---|---|
| `/` | `239,147 B` / `813,614 B` (`17`) | `181,695 B` / `623,684 B` (`10`) | `0` / `0` | `0 B` / `0 B` | `0` / `0` | `undefined` |
| `/shop` | `237,014 B` / `809,030 B` (`16`) | `183,968 B` / `631,344 B` (`10`) | `0` / `0` | `0 B` / `0 B` | `0` / `0` | `undefined` |
| `/collections` | `239,147 B` / `813,614 B` (`17`) | `183,828 B` / `628,268 B` (`11`) | `0` / `0` | `0 B` / `0 B` | `0` / `0` | `undefined` |
| `/cart` | `241,048 B` / `817,200 B` (`18`) | `241,048 B` / `817,200 B` (`18`) | `0` / `0` | `0 B` / `0 B` | `0` / `0` | `undefined` |
| `/checkout` | `248,431 B` / `844,086 B` (`19`) | `248,431 B` / `844,086 B` (`19`) | `0` / `0` | `0 B` / `0 B` | `0` / `0` | `undefined` |
| `/lookbook` | `239,012 B` / `813,497 B` (`17`) | `183,610 B` / `627,672 B` (`11`) | `0` / `0` | `0 B` / `0 B` | `0` / `0` | `undefined` |
| `/journal` | `242,872 B` / `820,477 B` (`19`) | `183,340 B` / `626,098 B` (`11`) | `0` / `0` | `0 B` / `0 B` | `0` / `0` | `undefined` |
| `/about` | `241,048 B` / `817,200 B` (`18`) | `181,336 B` / `622,562 B` (`10`) | `0` / `0` | `0 B` / `0 B` | `0` / `0` | `undefined` |
| `/auth/login` | `244,561 B` / `823,069 B` (`20`) | `244,561 B` / `823,069 B` (`20`) | `0` / `0` | `0 B` / `0 B` | `0` / `0` | `undefined` |
| `/products/form-structured-calfskin-crossbody` *(2D-Only PDP)* | `247,043 B` / `839,196 B` (`18`) | `193,997 B` / `661,510 B` (`12`) | `0` / `0` | `0 B` / `0 B` | `0` / `0` | `undefined` |
| `/products/atelier-boxy-wool-overshirt` *(Initial 2D Mode)* | `247,043 B` / `839,196 B` (`18`) | `201,736 B` / `676,414 B` (`16`) | `0` / `0` | `0 B` / `0 B` | `0` / `0` | `undefined` |

#### Admin Routes (`1280x800`, Authenticated via `owner.dev@arven.local` + Live TOTP MFA -> Clean Sign Out `/api/v1/auth/me === 401`)

| Admin Route | JS Requests | JS Transfer / Decoded | Total Transfer | 3D Chunk / Symbol Hits | `.glb` / `.wasm` / `/decoders/` | `<canvas>` |
|---|---|---|---|---|---|---|
| `/` | `23` | `222,628 B` / `956,547 B` | `372,689 B` | `0` | `0` | `0` |
| `/orders` | `24` | `288,685 B` / `986,829 B` | `460,040 B` | `0` | `0` | `0` |
| `/returns` | `24` | `288,685 B` / `986,829 B` | `450,046 B` | `0` | `0` | `0` |
| `/coupons` | `23` | `281,317 B` / `956,547 B` | `431,542 B` | `0` | `0` | `0` |
| `/cms` | `23` | `281,317 B` / `956,547 B` | `433,015 B` | `0` | `0` | `0` |
| `/inventory` | `23` | `281,317 B` / `956,547 B` | `446,083 B` | `0` | `0` | `0` |
| `/catalog/products` | `25` | `299,809 B` / `1,016,898 B` | `475,940 B` | `0` | `0` | `0` |
| `/catalog/products/fdd1c8aa-...` *(Pre-`Preview 3D QA`)* | `25` | `299,809 B` / `1,016,898 B` | `465,805 B` | `0` | `0` | `0` |
| `/catalog/products/fdd1c8aa-...` *(After `Preview 3D QA` Click)* | `+1` (`388bwt13ulspo.js`) | `+308,373 B` / `+1,124,678 B` | `+311,492 B` (`previewClickToReady: 652 ms`) | `1` lazy chunk (`388bwt13ulspo.js`) | `1` GLB (`preview-model`, `3,119 B` wire, `no-store`) | `1` (`ready`) |

---

## 3. PDP Lazy-Load Delta, Mobile Lite Profile & Self-Hosted Cache Budget

### 3.1 Storefront 3D PDP Delta (`/products/atelier-boxy-wool-overshirt`)

| Metric | Desktop (`1280x800`) | Mobile (`375x812`) |
|---|---|---|
| **Initial `2D Mode` Total Transfer / JS Transfer** | `404,695 B` / `247,043 B` (`18` JS reqs) | `347,345 B` / `201,736 B` (`16` JS reqs) |
| **Post-Click `Model 3D` Network Delta** | `+4` reqs, **`+319,092 B`** total transfer | `+4` reqs, **`+318,760 B`** total transfer |
| **Lazy-Loaded 3D JS Chunk** | `/_next/static/chunks/3l0swxfw52ba_.js`: **`312,952 B`** wire / `1,138,007 B` decoded | `/_next/static/chunks/3l0swxfw52ba_.js`: **`312,952 B`** wire / `1,138,007 B` decoded |
| **Selected Device Tier (`__ARVEN_3D_DIAGNOSTICS__.activeTier`)** | **`default`** | **`lite`** |
| **GLB Endpoint Requested (`200`, `model/gltf-binary`)** | `/api/v1/3d-assets/ab90df35-.../model` (**`0`** `/model-lite` calls) | `/api/v1/3d-assets/ab90df35-.../model-lite` (**`0`** `/model` calls) |
| **GLB Payload Size (Wire Gzip / Raw Binary)** | **`3,132 B`** wire (`content-encoding: gzip`) / **`9,924 B`** raw (`<= 10 MB` cap) | **`2,800 B`** wire (`content-encoding: gzip`) / **`7,328 B`** raw (`<= 3.5 MB` cap) |
| **WASM Decoder Transfers at Runtime** | `0` *(seeded GLBs use uncompressed glTF 2.0 binary)* | `0` *(seeded GLBs use uncompressed glTF 2.0 binary)* |
| **Click `Model 3D` -> `loadState === 'ready'`** | **`552 ms`** | **`514 ms`** |
| **External CDN / Font / HDR Requests** | **`0`** | **`0`** |

### 3.2 Self-Hosted Cache Headers (`OBS-P7-PERF-02` Re-Verification)

| Asset / Endpoint | Status | `Content-Type` | `Cache-Control` |
|---|---|---|---|
| `http://localhost:3000/decoders/draco/draco_decoder.wasm` (`285,747 B`) | `200` | `application/wasm` | `public, max-age=31536000, immutable` |
| `http://localhost:3000/decoders/basis/basis_transcoder.wasm` (`527,333 B`) | `200` | `application/wasm` | `public, max-age=31536000, immutable` |
| `http://localhost:3000/decoders/draco/draco_decoder.js` (`719,410 B`) | `200` | `application/javascript; charset=UTF-8` | `public, max-age=31536000, immutable` |
| `http://localhost:3000/decoders/basis/basis_transcoder.js` (`57,529 B`) | `200` | `application/javascript; charset=UTF-8` | `public, max-age=31536000, immutable` |
| `http://localhost:3001/decoders/draco/draco_decoder.wasm` (`285,747 B`) | `200` | `application/wasm` | `public, max-age=31536000, immutable` |
| `http://localhost:3001/decoders/basis/basis_transcoder.wasm` (`527,333 B`) | `200` | `application/wasm` | `public, max-age=31536000, immutable` |
| `/api/v1/3d-assets/:id/model` & `/model-lite` | `200` | `model/gltf-binary` (`nosniff`) | `public, max-age=31536000, immutable` |
| `/api/v1/3d-assets/:id/poster` | `200` | `image/svg+xml; charset=utf-8` (`nosniff`) | `public, max-age=86400` |
| Self-hosted `.woff2` fonts (`4` files, `/_next/static/media/`) | `200` | `font/woff2` | `public, max-age=31536000, immutable` |

*(Seeded catalog GLB & poster budgets on `:4000`: `atelier-boxy-wool-overshirt` `9,924 B` / `7,328 B` / `965 B`; `essentials-heavyweight-crew-tee` `6,056 B` / `6,056 B` / `974 B`; `atelier-oversized-poplin-shirt` `9,916 B` / `7,320 B` / `968 B`; `movement-minimalist-leather-sneaker` `11,164 B` / `8,584 B` / `1,011 B`.)*

---

## 4. WebGL `frameloop="demand"` Idle Quiescence & 5-Cycle Toggle Memory Audit

### 4.1 2000ms Post-`ready` Idle Observation Window

| Profile | `frameloop` | Observation Window | Idle `requestAnimationFrame` Frames | Idle Network Requests | Idle Long Tasks (`> 50ms`) | Verdict |
|---|---|---|---|---|---|---|
| **Desktop (`1280x800`)** | `demand` | `2000 ms` | **`0`** | **`0`** | **`0`** | **`PASS`** |
| **Mobile (`375x812`)** | `demand` | `2000 ms` | **`0`** | **`0`** | **`0`** | **`PASS`** |

### 4.2 5 Consecutive Mount / Unmount Toggles (`Foto 2D` <-> `Model 3D`, Desktop `1280x800`)

Initial `2D Mode` baseline: `5.20 MB` (`5,452,704 B`); initial `Model 3D` mount: `10.72 MB` (`11,240,497 B`).

| Toggle Cycle | Unmount (`Foto 2D`) `<canvas>` | Unmount `disposedResources` | Unmount `usedJSHeapSize` | Remount (`Model 3D`) Time | Remount `geometries` / `textures` | Remount `usedJSHeapSize` |
|---|---|---|---|---|---|---|
| **Cycle 1** | `0` | `6` | `10.67 MB` (`11,183,439 B`) | `162 ms` | `1` / `2` | `11.26 MB` (`11,804,626 B`) |
| **Cycle 2** | `0` | `6` | `11.11 MB` (`11,648,834 B`) | `168 ms` | `1` / `2` | `11.63 MB` (`12,196,026 B`) |
| **Cycle 3** | `0` | `6` | `11.55 MB` (`12,108,038 B`) | `170 ms` | `1` / `2` | `11.81 MB` (`12,378,650 B`) |
| **Cycle 4** | `0` | `6` | `11.69 MB` (`12,257,422 B`) | `145 ms` | `1` / `2` | `12.05 MB` (`12,637,436 B`) |
| **Cycle 5** | `0` | `6` | `11.89 MB` (`12,467,620 B`) | `155 ms` | `1` / `2` | `12.11 MB` (`12,695,076 B`) |
| **Final Post-Cycle `2D`** | `0` | `6` | `11.94 MB` (`12,519,524 B`) | `—` | `—` | `—` |

---

## 5. Core Web Vitals & Navigation Timings Across Routes (Post-Repair)

### 5.1 Dedicated `DEFECT-P7-PERF-01` & `OBS-P7-PERF-01` Re-Verification

- **`/about` Cold `CLS` (`3x` Mobile `375x812` & `3x` Desktop `1280x800`):**
  - Mobile `375x812`: Run 1 **`0`** | Run 2 **`0`** | Run 3 **`0`** (`0` layout-shift entries, `0` console errors, `0` HTTP `>= 400`).
  - Desktop `1280x800`: Run 1 **`0`** | Run 2 **`0`** | Run 3 **`0`** (`0` layout-shift entries, `0` console errors, `0` HTTP `>= 400`).
- **`/products/form-structured-calfskin-crossbody` (`OBS-P7-PERF-01`):**
  - Desktop `1280x800` & Mobile `375x812`: `has3dAssetsReq = false`, `http4xx5xx = []`, `consoleErrors = []`, `pageErrors = []`.

### 5.2 Storefront Desktop (`1280x800`) & Mobile (`375x812`) Full Route Matrix

| Route | Desktop `TTFB / DCL / Load` | Desktop `FCP / LCP` | Desktop `CLS` | Desktop `LT` (Max) | Mobile `TTFB / DCL / Load` | Mobile `FCP / LCP` | Mobile `CLS` | Mobile `LT` (Max) | Errors (`con/pg/4xx+`) |
|---|---|---|---|---|---|---|---|---|---|
| `/` | `144.3 / 295.5 / 434.7 ms` | `1544 / 1544 ms (P)` | `0` | `2` (`69 ms`) | `3.8 / 46.6 / 152.2 ms` | `208 / 208 ms (P)` | `0.001109` | `1` (`59 ms`) | `0/0/0` |
| `/shop` | `6.4 / 63.3 / 166.4 ms` | `228 / 228 ms (P)` | `0` | `0` (`0 ms`) | `3.7 / 46.1 / 147.3 ms` | `168 / 168 ms (P)` | `0.065500` | `0` (`0 ms`) | `0/0/0` |
| `/collections` | `5.3 / 53.0 / 158.7 ms` | `120 / 536 ms (IMG)` | `0` | `2` (`66 ms`) | `4.1 / 45.0 / 138.7 ms` | `156 / 324 ms (IMG)` | `0` | `2` (`56 ms`) | `0/0/0` |
| `/cart` | `4.4 / 48.1 / 142.7 ms` | `144 / 144 ms (P)` | `0.011279` | `0` (`0 ms`) | `4.9 / 34.5 / 92.4 ms` | `172 / 220 ms (P)` | `0.095331` | `0` (`0 ms`) | `0/0/0` |
| `/checkout` | `20.1 / 63.2 / 162.9 ms` | `136 / 336 ms (P)` | `0.021592` | `2` (`54 ms`) | `5.4 / 46.2 / 130.1 ms` | `136 / 336 ms (P)` | `0.095331` | `0` (`0 ms`) | `0/0/0` |
| `/lookbook` | `5.3 / 47.1 / 139.3 ms` | `184 / 452 ms (IMG)` | `0` | `1` (`57 ms`) | `4.4 / 47.9 / 143.0 ms` | `160 / 276 ms (IMG)` | `0` | `1` (`58 ms`) | `0/0/0` |
| `/journal` | `4.9 / 43.4 / 142.8 ms` | `160 / 324 ms (IMG)` | `0` | `1` (`58 ms`) | `3.7 / 47.6 / 155.6 ms` | `196 / 296 ms (IMG)` | `0` | `1` (`66 ms`) | `0/0/0` |
| `/about` | `4.2 / 45.9 / 138.3 ms` | `176 / 276 ms (P)` | **`0`** | `1` (`60 ms`) | `5.6 / 50.3 / 158.7 ms` | `100 / 264 ms (P)` | **`0`** | `1` (`73 ms`) | `0/0/0` |
| `/auth/login` | `5.0 / 93.5 / 307.9 ms` | `180 / 180 ms (P)` | `0` | `1` (`76 ms`) | `5.2 / 45.0 / 206.7 ms` | `160 / 160 ms (P)` | `0` | `1` (`61 ms`) | `0/0/0` |
| `/products/form-structured-calfskin-crossbody` | `22.5 / 67.3 / 168.6 ms` | `120 / 504 ms (H1)` | `0` | `1` (`59 ms`) | `4.0 / 51.1 / 123.5 ms` | `144 / 544 ms (IMG)` | `0` | `0` (`0 ms`) | **`0/0/0`** |
| `/products/atelier-boxy-wool-overshirt` *(2D -> 3D)* | `8.0 / 52.5 / 173.6 ms` | `108 / 492 ms (H1)` | **`0`** *(2D & 3D)* | `1` (`61 ms` 2D) / `4` (`125 ms` 3D) | `5.6 / 44.5 / 100.9 ms` | `180 / 380 ms (IMG)` | **`0`** *(2D & 3D)* | `0` (2D) / `2` (`81 ms` 3D) | `0/0/0` |

### 5.3 Admin Desktop (`1280x800`) Full Route Matrix

| Route | `TTFB / DCL / Load` | `FCP / LCP` | `CLS` | `LT` (Max) | `usedJSHeapSize` | Errors (`con/pg`) |
|---|---|---|---|---|---|---|
| `/` | `25.5 / 92.3 / 247.8 ms` | `184 / 368 ms (P)` | `0.030408` | `0` (`0 ms`) | `5.96 MB` | `0/0` |
| `/orders` | `6.7 / 52.6 / 132.0 ms` | `188 / 188 ms (P)` | `0.059873` | `1` (`59 ms`) | `6.22 MB` | `0/0` |
| `/returns` | `6.2 / 46.4 / 191.4 ms` | `148 / 148 ms (P)` | `0.007732` | `1` (`59 ms`) | `5.85 MB` | `0/0` |
| `/coupons` | `5.5 / 41.7 / 187.5 ms` | `148 / 148 ms (P)` | `0.016831` | `1` (`59 ms`) | `5.89 MB` | `0/0` |
| `/cms` | `6.5 / 35.7 / 141.2 ms` | `220 / 220 ms (P)` | `0.000887` | `1` (`86 ms`) | `5.84 MB` | `0/0` |
| `/inventory` | `6.8 / 48.5 / 144.8 ms` | `172 / 172 ms (P)` | `0.006188` | `1` (`63 ms`) | `6.62 MB` | `0/0` |
| `/catalog/products` | `7.5 / 53.8 / 203.6 ms` | `120 / 120 ms (P)` | `0.002880` | `1` (`102 ms`) | `6.19 MB` | `0/0` |
| `/catalog/products/fdd1c8aa-...` *(Pre-Preview)* | `8.2 / 84.9 / 193.5 ms` | `184 / 184 ms (P)` | `0.014166` | `2` (`78 ms`) | `6.20 MB` | `0/0` |

---

## 6. Live API Endpoint Latency Benchmark (`http://localhost:4000`)

Measured with `1` discarded warmup call followed by **`10` sequential warm requests** per endpoint (`atelier-boxy-wool-overshirt`, Asset ID `ab90df35-de03-407b-9fd8-03b6fb2e95ba`). `POST /api/v1/3d-assets/telemetry` used a valid pre-auth CSRF token (`GET /api/v1/csrf-token`) + `Origin: http://localhost:3000`.

| Endpoint | HTTP Status (`10/10`) | Payload Bytes | `Min` (ms) | `Avg` (ms) | `P95` (ms) | `Max` (ms) | Threshold (`< 300 ms`) |
|---|---|---|---|---|---|---|---|
| `GET /api/v1/products/atelier-boxy-wool-overshirt/3d-assets` | `200` | `3,158 B` | `4.11` | `6.87` | `18.85` | `18.85` | **`PASS`** |
| `GET /api/v1/3d-assets/ab90df35-.../metadata` | `200` | `1,707 B` | `3.66` | `5.44` | `10.45` | `10.45` | **`PASS`** |
| `GET /api/v1/3d-assets/ab90df35-.../model` | `200` | `9,924 B` | `3.76` | `4.35` | `4.89` | `4.89` | **`PASS`** |
| `GET /api/v1/3d-assets/ab90df35-.../model-lite` | `200` | `7,328 B` | `4.08` | `4.55` | `5.31` | `5.31` | **`PASS`** |
| `GET /api/v1/3d-assets/ab90df35-.../poster` | `200` | `965 B` | `3.70` | `4.29` | `5.21` | `5.21` | **`PASS`** |
| `POST /api/v1/3d-assets/telemetry` | `202` | `172 B` | `2.76` | `5.18` | `11.35` | `11.35` | **`PASS`** |

---

## 7. Evidence Artifacts (`scratch/`)

- `C:\Users\vickymosafan\.gemini\antigravity\brain\55d3d89c-116d-4f0f-8cea-7a54b393ad6d\scratch\audit-static-bundles.mjs` -> `static-bundle-audit.json`
- `C:\Users\vickymosafan\.gemini\antigravity\brain\55d3d89c-116d-4f0f-8cea-7a54b393ad6d\scratch\audit-runtime-perf.mjs` -> `runtime-perf-audit.json`
- `C:\Users\vickymosafan\.gemini\antigravity\brain\55d3d89c-116d-4f0f-8cea-7a54b393ad6d\scratch\verify-repair5-fixes.mjs` -> `repair5-verify.json`
- `C:\Users\vickymosafan\.gemini\antigravity\brain\55d3d89c-116d-4f0f-8cea-7a54b393ad6d\scratch\audit-api-latency.mjs` -> `api-latency-benchmark.json`
