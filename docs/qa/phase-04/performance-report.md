# ARVEN Phase 04 Performance QA Report

> **Harness Plan ID:** `1a47de03-ee06-469d-936b-8d01ef5b28cc`  
> **Task ID:** `e2df8e27-f09f-4ab3-b2ee-0bd2dfbb7647`  
> **Checkpoint ID:** `performance`  
> **Independent Verifier:** `performance-qa-agent`  
> **Git Commit:** `6af6ef2` (with repaired `/cart` skeleton reservation in `cart-view.tsx` & `cart/page.tsx` rebuilt and live)  
> **Browser Engine:** Playwright Chromium `156.0.8078.4` (`headless: true`, unthrottled loopback)  
> **Server Mode Observed:** Live `next dev` (Turbopack dev mode on `:3000` and `:3001`, NestJS API on `:4000`) + static inspection of rebuilt production `.next` artifacts  
> **Overall Verdict:** `PASS` (`Desktop 1280x800 CLS <= 0.020665`; `Mobile 375x812 CLS <= 0.059804`; `0` Three.js leakage; API `2.15ms–26.06ms`)

---

## 1. Executive Summary

Independent post-repair performance QA across Storefront (`http://localhost:3000`), Admin (`http://localhost:3001/login`), API (`http://localhost:4000/api/v1`), and rebuilt production manifests (`apps/storefront/.next`, `apps/admin/.next`) verified:

- **Desktop (`1280x800`) Web Vitals & `BagCountPill` Hydration (`PASS`):** All 5 cold routes plus populated `/cart` and hydrated `/` recorded `FCP <= 316ms`, `LCP <= 716ms`, `TTFB <= 110ms`, `0` console/page/network errors, and `CLS <= 0.020665` (`<= 0.10`). Specifically, `BagCountPill` client hydration (`Bag0 items -> Bag1 item` on `/` and PDP) produced **`0.000` incremental CLS**.
- **Mobile (`375x812`) `/cart` CLS Repair Verified (`PASS`):** After adding `min-h-[38rem] sm:min-h-[34rem]` skeleton reservation in `cart-view.tsx` and `cart/page.tsx`, **mobile populated `/cart` CLS improved from `0.244055` -> `0.059804`** (`<= 0.10` threshold), and empty `/cart` measured `CLS = 0.057026`. Home (`/`, `0.001109`) and PDP (`0`) also passed with `0` errors.
- **Phase 04 API Latency Baseline (`PASS`):** Across 3 clean guest cart cycles (`GET /csrf-token`, `GET /cart`, `POST /cart/items`, `PATCH /cart/items/:id`, `DELETE /cart/items/:id`), every call returned in `2.15ms–26.06ms` (well below `250ms` local limit, zero N+1 hangs).
- **Three.js Exclusion & Production `.next` Bundle Sizes (`PASS`):** Static scan of rebuilt `apps/storefront/.next` (`26` static JS files) and `apps/admin/.next` (`27` static JS files) confirmed **`0` `three` / `@react-three/*` / `.glb` / `.gltf` / `.wasm` assets** bundled onto `/`, `/shop`, `/products/[slug]`, `/cart`, `/login`, or `/inventory`. Production JS for `storefront:/cart` is `665,497 B` raw (`203,192 B` gzip); `admin:/inventory` is `805,341 B` raw (`241,770 B` gzip).

---

## 2. Live Browser Runtime Web Vitals & Network Telemetry (Post-Repair)

> **Note on Live Server Runtime:** `:3000` and `:3001` are serving `next dev` (Turbopack dev mode, including `react-dom_development`, `next-devtools`, and `hmr-client` chunks). Consequently, live dev JS decoded/transferred sizes are larger than the minified production `.next/static/chunks` reported in Section 4, and dev hydration introduces `53ms–119ms` script evaluation long tasks.

### 2.1 Desktop (`1280x800`) Measurements

| Route / Journey | TTFB | DCL | Load | FCP | LCP | CLS | Long Tasks (`>50ms`) | Reqs (`JS`) | Transferred JS | Total Transferred | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `Storefront Home (/)` (cold, empty bag) | `77ms` | `127ms` | `338ms` | `316ms` | `316ms` | `0.000209` (`dd`) | `2` (`113ms`, `53ms`) | `40` (`18`) | `862,832 B` (`4,176,555 B` dec.) | `1,007,285 B` | `0` |
| `Storefront Shop (/shop)` (cold) | `98ms` | `137ms` | `342ms` | `244ms` | `244ms` | `0` | `1` (`101ms`) | `38` (`18`) | `864,629 B` (`4,178,418 B` dec.) | `1,010,941 B` | `0` |
| `Storefront PDP` (cold, `/products/form-structured-calfskin-crossbody`) | `108ms` | `159ms` | `379ms` | `232ms` | `716ms` | `0` | `1` (`107ms`) | `32` (`18`) | `863,810 B` (`4,175,883 B` dec.) | `993,644 B` | `0` |
| `Storefront Cart Empty (/cart)` (cold) | `71ms` | `110ms` | `297ms` | `172ms` | `472ms` | `0.00149` (`footer` at `444ms`) | `1` (`99ms`) | `28` (`18`) | `864,214 B` (`4,177,695 B` dec.) | `987,707 B` | `0` |
| `Storefront Cart Populated (/cart)` (warm cache post-PDP add) | `82ms` | `110ms` | `307ms` | `180ms` | `564ms` | `0.020665` (`footer` at `518ms`) | `1` (`106ms`) | `29` (`18`) | `22,891 B` (warm; `4,177,695 B` dec.) | `42,478 B` | `0` |
| `Storefront Home Populated Bag (/)` (warm cache, `1 item`) | `70ms` | `95ms` | `304ms` | `168ms` | `168ms` | `0.000209` (`dd` at `571ms`) | `2` (`119ms`, `57ms`) | `40` (`18`) | `21,509 B` (warm; `4,176,555 B` dec.) | `59,686 B` | `0` |
| `Admin Login (/login)` (cold) | `110ms` | `150ms` | `400ms` | `248ms` | `248ms` | `0` | `1` (`105ms`) | `27` (`21`) | `1,032,189 B` (`5,629,312 B` dec.) | `1,149,248 B` | `0` |

### 2.2 Mobile (`375x812`) Measurements (Post-Repair)

| Route / State | FCP | LCP | CLS | Shift Source & Verdict |
|---|---|---|---|---|
| `Storefront Home Empty (/)` | `284ms` | `284ms` | `0.001109` | `DD` (`636ms`) — `PASS` (`<= 0.02`) |
| `Storefront Cart Empty (/cart)` | `140ms` | `440ms` | `0.057026` | `FOOTER` (`410ms`) — `PASS` (`<= 0.10`) |
| `Storefront PDP` + `Add to Bag` | `184ms` | `636ms` | `0` | `0` shifts pre- and post-`Add to Bag` (`Bag0 items -> Bag1 item`) — `PASS` |
| `Storefront Cart Populated (/cart)` | `160ms` | `512ms` | **`0.059804`** | `FOOTER` (`471ms`; down from `0.244055` pre-repair) — **`PASS` (`<= 0.10`)** |
| `Storefront Home Populated (/)` (`Bag1 item`) | `196ms` | `196ms` | `0.001109` | `DD` (`556ms`; `0.000` delta from `BagCountPill` hydration) — `PASS` |

- **Guest Bag Cleanup:** Temporary guest cart item created on PDP was deleted via `DELETE /api/v1/cart/items/:id` (`204`), verified `remainingItems: 0`.
- **Console / Network Errors:** `0` console errors, `0` `pageerror`, `0` failed requests, `0` HTTP `>= 400` responses, `0` Three.js/GLB network requests across all Desktop and Mobile runs.

---

## 3. Phase 04 API Endpoint Latency Baseline (`http://localhost:4000/api/v1`)

Measured directly over loopback HTTP (`Origin: http://localhost:3000`, cookie jar preserved, SKU `ARV-ACC-001` / variant `7f11755d-3fce-4d82-95f2-ca62cfc05b67`) across `3` clean guest cart cycles:

| Endpoint | HTTP Status | Min (ms) | Avg (ms) | Max (ms) | Local Threshold (`<250ms`) |
|---|---|---|---|---|---|
| `GET /api/v1/csrf-token` | `200` | `2.15` | `4.07` | `6.07` | `PASS` |
| `GET /api/v1/cart` | `200` | `2.83` | `2.95` | `3.04` | `PASS` |
| `POST /api/v1/cart/items` | `200` | `13.14` | `18.52` | `26.06` | `PASS` |
| `PATCH /api/v1/cart/items/:id` | `200` | `13.26` | `15.92` | `21.12` | `PASS` |
| `DELETE /api/v1/cart/items/:id` | `204` | `4.91` | `5.92` | `7.39` | `PASS` |

---

## 4. Three.js Exclusion & Next.js Production Build Chunk Inspection (Rebuilt `.next`)

Static inspection of rebuilt `apps/storefront/.next` and `apps/admin/.next` (`build-manifest.json`, route `page_client-reference-manifest.js`, and `.next/static` assets):

### 4.1 Route Client JS & CSS Production Chunk Sizes

| App & Route | JS Chunks (Route-Specific) | Total JS Raw | Total JS Gzip | Route-Specific JS Raw | Route-Specific JS Gzip | App CSS Raw / Gzip | `three` / `@react-three` / `.glb` Matches |
|---|---|---|---|---|---|---|---|
| `storefront:/` | `8` (`3`) | `664,703 B` | `202,525 B` | `107,692 B` | `31,493 B` | `57,092 B` / `10,004 B` | `0` |
| `storefront:/shop` | `8` (`3`) | `665,405 B` | `203,351 B` | `108,394 B` | `32,319 B` | `57,092 B` / `10,004 B` | `0` |
| `storefront:/products/[slug]` | `8` (`3`) | `665,660 B` | `203,048 B` | `108,649 B` | `32,016 B` | `57,092 B` / `10,004 B` | `0` |
| `storefront:/cart` | `8` (`3`) | `665,497 B` | `203,192 B` | `108,486 B` | `32,160 B` | `57,092 B` / `10,004 B` | `0` |
| `admin:/login` | `10` (`4`) | `766,663 B` | `231,776 B` | `209,538 B` | `60,547 B` | `55,207 B` / `9,744 B` | `0` |
| `admin:/inventory` | `10` (`4`) | `805,341 B` | `241,770 B` | `248,216 B` | `70,541 B` | `55,207 B` / `9,744 B` | `0` |

### 4.2 Detailed Breakdown for `/cart` and `/inventory` Chunks

- **`storefront:/cart` (`665,497 B` raw / `203,192 B` gzip):**
  - Shared (`557,011 B` raw / `171,032 B` gzip): `3gtqhx_6dj5h3.js` (`229,311 B` / `71,608 B` gz), `0s5tbeignv8od.js` (`180,744 B` / `48,516 B` gz), `0cz1d0mv5g_q7.js` (`112,594 B` / `39,520 B` gz), `0der_8bu_zp06.js` (`24,388 B` / `7,483 B` gz), `turbopack-2u1d16houkiyo.js` (`9,974 B` / `3,905 B` gz).
  - Route-specific (`108,486 B` raw / `32,160 B` gzip): `3fdxk8v2v7wb1.js` (`56,638 B` / `17,082 B` gz), `0g2hzsxy28k7z.js` (`37,584 B` / `11,479 B` gz), `027yutlhgw4y-.js` (`14,264 B` / `3,599 B` gz).
- **`admin:/inventory` (`805,341 B` raw / `241,770 B` gzip):**
  - Shared (`557,125 B` raw / `171,229 B` gzip): `3gtqhx_6dj5h3.js` (`229,311 B` / `71,608 B` gz), `3cj79n8ppo0y_.js` (`164,487 B` / `45,255 B` gz), `0cz1d0mv5g_q7.js` (`112,594 B` / `39,520 B` gz), `212hkfea55xdo.js` (`27,355 B` / `7,247 B` gz), `017p-muhy2vp7.js` (`13,404 B` / `3,694 B` gz), `turbopack-2u1d16houkiyo.js` (`9,974 B` / `3,905 B` gz).
  - Route-specific (`248,216 B` raw / `70,541 B` gzip): `3ulidpz-fugsr.js` (`131,132 B` / `36,360 B` gz), `00bs2hw9o4s7e.js` (`56,414 B` / `15,617 B` gz), `2vw64o5o4d5yg.js` (`46,404 B` / `14,964 B` gz), `44x9k1_u2b63t.js` (`14,266 B` / `3,600 B` gz).
- **Full `.next/static` Scan:** `26` static JS files in `apps/storefront/.next/static` and `27` static JS files in `apps/admin/.next/static` contained `0` `.glb`/`.gltf`/`.wasm` files and `0` references to `node_modules/three`, `@react-three/fiber`, `@react-three/drei`, `GLTFLoader`, `DRACOLoader`, `MeshoptDecoder`, `OrbitControls`, or `WebGLRenderer`.
