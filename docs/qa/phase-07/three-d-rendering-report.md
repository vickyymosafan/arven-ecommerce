# ARVEN Phase 07 3D Rendering & GPU Lifecycle QA Report

> **Harness Plan ID:** `22202ad0-0d75-430c-ad26-ba1895be7ec4`  
> **Task ID:** `78d3b8a5-fbd5-493a-921d-2941c130d8d5`  
> **Checkpoint ID:** `3d-rendering`  
> **Independent Verifier:** `threejs-qa-agent`  
> **Initial Audit Window (UTC):** `2026-11-18T19:51:16.166Z` – `2026-11-18T19:55:53Z` (`FAIL` — `DEFECT-P7-3D-01`, `DEFECT-P7-3D-02`)  
> **Repair Iteration 3 Re-Verification (UTC):** `2026-11-18T20:06:55.643Z` – `2026-11-18T20:07:47.030Z`  
> **Live Rebuilt Builds Verified (Repair Iteration 3):**  
> - Storefront (`http://localhost:3000`): `BUILD_ID = k-twutXkr2LC09Is9udJo` (`/_next/static/k-twutXkr2LC09Is9udJo/_buildManifest.js` -> `200`)  
> - Admin (`http://localhost:3001`): `BUILD_ID = gkQxnS4HNU7gxZmdxalPy` (`/_next/static/gkQxnS4HNU7gxZmdxalPy/_buildManifest.js` -> `200`)  
> - API (`http://localhost:4000`): Live (`three@0.187.0`, PostgreSQL 18 + Redis)  
> **Browser Engine:** Playwright Chromium `1248` (`D:\ms-playwright\chromium-1248\chrome-win64\chrome.exe`, Chromium `156.0.8078.4`, headless; WebGL 2.0 via `--use-gl=angle --use-angle=swiftshader --enable-webgl --ignore-gpu-blocklist`, plus isolated `--disable-webgl --disable-webgl2 --disable-3d-apis` launch for fallback E2E)  
> **Overall Checkpoint Verdict (Post-Repair Iteration 3):** **`PASS`** *(All 5 test suites pass after Repair Iteration 3: `DEFECT-P7-3D-01` and `DEFECT-P7-3D-02` are verified **`CLOSED`** across live WebGL screenshots and pixel telemetry, with `idleRafCallsIn700ms = 0`, `contextLostCount = 0`, `0` non-same-origin requests, `0` `pageerror`, and clean `--disable-webgl` checkout E2E + cart cleanup.)*

---

## 1. Executive Summary & Repair Closure

Independent live browser re-verification after **Repair Iteration 3** across all 4 seeded 3D products (`1280x800`), camera preset & material preset swap visual inspection, mobile `lite` tier (`375x812`), 10-cycle `ResourceTracker` GPU disposal + 10-swap preset leak check, and WebGL-disabled checkout flow confirms **`PASS`** for the **`3d-rendering`** checkpoint:

| Defect ID | Initial Finding (`BA0BbwlrTPzeDXz72cRIk`) | Repair Iteration 3 Verification (`k-twutXkr2LC09Is9udJo`) | Status |
|---|---|---|---|
| **DEFECT-P7-3D-01** | `<ContactShadows frames={1} />` baked Frame 1 while `loadedScene` was `null`, rendering `0` shadow pixels darker than `#17191B` on `poplin-shirt` and `sneaker` (`Y = 0`). | `<ContactShadows position={[0, -0.002, 0]} opacity={0.85} scale={2.2} blur={1.5} far={1.4} frames={Infinity} color="#000000" />` + `requestAnimationFrame(() => invalidate())` on `loadedScene` attach renders a soft grounded elliptical ContactShadow beneath every garment & sneaker (`22,734` darker-than-bg bottom-half shadow pixels on `poplin-shirt`, `7,652` directly beneath `sneaker`, `88,574` on `overshirt`, `68,383` on `crew-tee`, plus `31,600` on mobile `lite`), while `idleRafCallsIn700ms = 0` confirms zero continuous render loop under `frameloop="demand"`. | **CLOSED** |
| **DEFECT-P7-3D-02** | `mat.color.set(targetHex)` + redundant `mat.color.convertSRGBToLinear()` under `three@0.187.0` (`ColorManagement.enabled = true`) double-gamma-crushed `Deep Stone` `#5E5C54` to `rgb(10, 9, 7)` (`meanChannelDiff = 2.13/255` vs `Obsidian` `rgb(3, 3, 3)`). | Redundant `convertSRGBToLinear()` removed in `packages/three-engine/src/material-preset-controller.ts`. Visually inspected `Obsidian` (`#1D1E20`, torso `rgb(10, 10, 11)`, pockets `#35383A` clearly legible) vs `Deep Stone` (`#5E5C54`, torso `rgb(60, 57, 49)`, `meanRgb` `[54.70, 54.55, 51.96]`, `meanChannelDiff = 17.08/255`, `38.44%` pixel delta). `Ivory` (`#F8F7F3`) renders `rgb(195, 194, 190)` and `Cream` (`#E9E4DA`) renders `rgb(208, 204, 197)`. | **CLOSED** |

| Test Suite | Scope Verified | Verdict | Key Verified Evidence (Repair Iteration 3) |
|---|---|---|---|
| **Test 1** | Live 3D Rendering Across All 4 Seeded 3D Products (`1280x800`), Decoders & Route JS Isolation | **`PASS`** | All 4 products mount `568 x 757` (`aspect 0.750`) `<canvas>`, `loadState = "ready"`, `frameloop = "demand"`, `demandFrameloopIdleStable = true` + **`idleRafCallsIn700ms = 0`**, `activeTier = "default"`, `contextLostCount = 0`, `nonBgPct` `24.30%`–`56.41%`, `combinedStdDev` `59.70`–`87.24`, visible ContactShadows on all 4 models, `0` non-same-origin requests, `0` `pageerror`/`console.error`/`http4xx`/`http5xx`; `/decoders/draco/` & `/decoders/basis/` (`8/8` files) verified on disk & HTTP `200`; `/`, `/shop`, `/cart`, `/checkout` load `0` 3D scripts and `0` `<canvas>`. |
| **Test 2** | Material Preset Swap (`Obsidian` <-> `Deep Stone`) & Camera Pose Visual Proof (`atelier-boxy-wool-overshirt`, `1280x800`) | **`PASS`** | Camera poses (`Tiga Perempat`, `Depan`, `Belakang`, `Detail`) frame distinct angles (`10.53%`, `47.52%`, `55.37%` pixel delta vs `three_quarter`) with grounded ContactShadows; `Obsidian` (`#1D1E20`, `rgb(10, 10, 11)`) <-> `Deep Stone` (`#5E5C54`, `rgb(60, 57, 49)`) updates `appliedSlots.mat_fabric_primary`, produces `38.44%` changed pixels (`meanChannelDiff: 17.08`), and returns to exact SHA-256 `6707c78e2ba6fbfd` (`0%` diff) on return to `Obsidian`. |
| **Test 3** | Mobile Lite Tier Verification (`375x812`, `hasTouch: true`) | **`PASS`** | `activeTier = "lite"`, `loadState = "ready"`, `frameloop = "demand"`, `contextLostCount = 0`; `/api/v1/3d-assets/ab90df35-de03-407b-9fd8-03b6fb2e95ba/model-lite` returns `200`, desktop `/model` not requested; `touch-action: pan-y` -> `none` on `Aktifkan Putar 3D`; `Tier: Lite (Mobile)` displayed; grounded ContactShadow rendered (`31,600` bottom-half shadow pixels); `0` external requests, `0` `pageerror`. |
| **Test 4** | 10x Model/Mount Swap `ResourceTracker` Disposal & 10x Preset Swap Leak Check | **`PASS`** | With `frames={Infinity}`, all `10` consecutive SPA product/mount swaps (`overshirt` <-> `sneaker` <-> `crew-tee`, `Model 3D` <-> `Foto 2D`) report `mounted: geometries = 4, textures = 3` -> `teardown: geometries = 1, textures = 3, disposedResources = 6` (`> 0` on `10/10` cycles), `contextLostCount = 0`, `pageErrors = 0`; `10` live preset swaps stay completely flat (`geometries = 4, textures = 3, disposedResources = 0, contextLostCount = 0`). |
| **Test 5** | `--disable-webgl --disable-webgl2 --disable-3d-apis` End-to-End Fallback -> Add to Bag -> Cart -> Checkout | **`PASS`** | Isolated Chromium (`webgl2: false, webgl1: false`) renders `[data-testid="arven-3d-fallback"]` with loaded `poster`, `Muat Ulang Model 3D`, `Kembali ke Foto 2D`, `0` `<canvas>`; `Deep Stone` preset syncs SKU `ARV-OUT-001-L-STN`; `Add to Bag` (`200`), `/cart` persistence, `/checkout` summary (`Rp 899.000`), and cleanup `Remove` (`204`, `"Your Bag Is Empty"`) pass with `0` `pageerror`, `0` `console.error`, `0` `http5xx`. |

---

## 2. Detailed Verification Evidence (Repair Iteration 3)

### 2.1 Test 1 — Live 3D Rendering Across All 4 Seeded 3D Products (`1280x800`)

#### 2.1.1 Product Diagnostics, Idle `demand` Verification & Pixel / ContactShadow Telemetry

| Product Slug | Asset ID (v1) | Canvas Attr / CSS (`W x H`) | `loadState` / `frameloop` | Idle `updatedAt` Stable / `idleRafCallsIn700ms` | Active Preset & `mat_fabric_primary` | Sampled Surface RGB | `nonBgPct` / `combinedStdDev` / `quantizedColors` | `darkerBottomHalfPixels` (Shadow Evidence) | `meta` / `model` / `poster` HTTP | Non-Same-Origin Reqs |
|---|---|---|---|---|---|---|---|---|---|---|
| `atelier-boxy-wool-overshirt` | `ab90df35-de03-407b-9fd8-03b6fb2e95ba` | `568x757` / `568x757.33` | `ready` / `demand` | `true` / **`0`** | `obsidian` (`#1D1E20`) | `rgb(10, 10, 11)` | `51.58%` / `59.70` / `118` | `88,574` (`darkest: rgb(5,5,6)`) | `200` / `200` / `200` | `0` |
| `essentials-heavyweight-crew-tee` | `fa5ee936-8b94-432c-b546-f1d738459925` | `568x757` / `568x757.33` | `ready` / `demand` | `true` / **`0`** | `charcoal` (`#17191B`) | `rgb(8, 8, 8)` | `44.59%` / `59.71` / `110` | `68,383` (`darkest: rgb(5,6,6)`) | `200` / `200` / `200` | `0` |
| `atelier-oversized-poplin-shirt` | `eb42a273-4304-43cc-8da0-3154884ba8b7` | `568x757` / `568x757.33` | `ready` / `demand` | `true` / **`0`** | `ivory` (`#F8F7F3`) | `rgb(195, 194, 190)` | `56.41%` / `87.24` / `127` | **`22,734`** *(prev: `0`; `darkest: rgb(5,5,6)`)* | `200` / `200` / `200` | `0` |
| `movement-minimalist-leather-sneaker` | `f92aa70d-ccc0-40b2-92a0-9001663db1a3` | `568x757` / `568x757.33` | `ready` / `demand` | `true` / **`0`** | `cream` (`#E9E4DA`) | `rgb(208, 204, 197)` | `24.30%` / `73.87` / `150` | **`7,652`** *(prev: `0`; `darkest: rgb(12,13,14)`)* | `200` / `200` / `200` | `0` |

- Across all 4 products: `activeTier = "default"`, `contextLostCount = 0`, `pageErrors = []`, `consoleErrors = []`, `http4xx = []`, `http5xx = []`, `nonSameOriginRequests = []`.
- `idleRafCallsIn700ms = 0` across all 4 products proves that setting `frames={Infinity}` on `<ContactShadows>` does **not** cause continuous frame polling under `frameloop="demand"`; Three.js/R3F remains completely idle until user interaction, camera preset change, or material preset swap invalidates a frame.
- **Note on Runtime Decoder Requests:** The 4 seeded `.glb` assets (`6,056 B`–`11,164 B`) are uncompressed glTF 2.0 binaries (`extensionsUsed: []`, `textures: 0`), so Chromium did not lazily fetch Draco/Basis WASM binaries on initial render; all 8 self-hosted decoder endpoints were independently verified below.

#### 2.1.2 Self-Hosted Decoders & Non-3D Route Isolation Verification

- **Disk Directories Verified:**
  - `apps/storefront/public/decoders/draco` (`exists: true`)
  - `apps/storefront/public/decoders/basis` (`exists: true`)
- **HTTP `200` Endpoint Checks (`http://localhost:3000`):**

| Decoder Path | HTTP Status | `Content-Type` | Payload Size (Bytes) |
|---|---|---|---|
| `/decoders/draco/draco_decoder.js` | `200` | `application/javascript; charset=UTF-8` | `719,410` |
| `/decoders/draco/draco_decoder.wasm` | `200` | `application/wasm` | `285,747` |
| `/decoders/draco/draco_wasm_wrapper.js` | `200` | `application/javascript; charset=UTF-8` | `58,763` |
| `/decoders/draco/gltf/draco_decoder.js` | `200` | `application/javascript; charset=UTF-8` | `512,465` |
| `/decoders/draco/gltf/draco_decoder.wasm` | `200` | `application/wasm` | `192,420` |
| `/decoders/draco/gltf/draco_wasm_wrapper.js` | `200` | `application/javascript; charset=UTF-8` | `58,456` |
| `/decoders/basis/basis_transcoder.js` | `200` | `application/javascript; charset=UTF-8` | `57,529` |
| `/decoders/basis/basis_transcoder.wasm` | `200` | `application/wasm` | `527,333` |

- **Non-3D Route JS Isolation (`/`, `/shop`, `/cart`, `/checkout`):** Each route returned `0` requests matching `three|react-three|drei|draco|basis|meshopt` and `0` `<canvas>` DOM elements (`isolated: true` on `4/4` routes).

#### 2.1.3 Visual Inspection Observations (Repair Iteration 3 Screenshots via `read_file`)

- **`atelier-boxy-wool-overshirt`:** Overshirt torso (`#1D1E20`), chest pockets (`#35383A`), collar (`#35383A`), and 5 metallic gold buttons (`#C5A572`) render with clear separation between fabric primary & secondary panels and a prominent, soft elliptical ContactShadow directly beneath the lower hem (`#050506` fading smoothly into `#17191B`). Zero clipping.
- **`essentials-heavyweight-crew-tee`:** Crew-tee torso, sleeves, collar trim, and hem accent tag (`#C5A572`) sit unclipped above a clear soft ContactShadow on the `#17191B` floor.
- **`atelier-oversized-poplin-shirt`:** Bright Ivory (`#F8F7F3`) torso (`rgb(195, 194, 190)` lit), warm stone pockets/collar (`#D8D3C8`), and dark buttons sit cleanly unclipped over a well-defined elliptical ContactShadow (`22,734` bottom-half shadow pixels).
- **`movement-minimalist-leather-sneaker`:** Multi-block Cream (`#E9E4DA`) sneaker (`rgb(208, 204, 197)` lit) with `#D8D3C8` sole and `#C5A572` lace eyelets sits cleanly unclipped with a natural soft ContactShadow (`7,652` bottom-half shadow pixels) grounded directly under the sole (`Y = -0.002`). Minor non-blocking horizontal shading transition remains at the sole-to-upper seam (`OBS-P7-3D-03`).

---

### 2.2 Test 2 — Camera Pose & Material Preset Swap Visual Proof (`atelier-boxy-wool-overshirt`)

#### 2.2.1 Camera Presets Matrix (`1280x800`, `Obsidian`)

| Camera Button | `cameraPreset` | Canvas SHA-256 (16-char) | Non-Bg Fill % | `uniqueQuantizedColors` | Pixel Delta vs `Tiga Perempat` | Visual Observation (`read_file`) |
|---|---|---|---|---|---|---|
| `Tiga Perempat` | `three_quarter` | `6707c78e2ba6fbfd` | `51.72%` | `118` | Baseline | 3/4 oblique view; unclipped full silhouette, clear `#35383A` chest pockets against `#1D1E20` body, 5 buttons, grounded ContactShadow beneath hem. |
| `Depan` | `front` | `d32159c5abeac4eb` | `52.41%` | `115` | `10.53%` (`45,333` px, `meanDiff: 1.87`) | Straight-on `+Z` front view; symmetric sleeves, pockets, centered 5-button placket, horizontal ContactShadow cleanly centered below hem. |
| `Belakang` | `back` | `efba0293d816b5df` | `56.99%` | `102` | `47.52%` (`204,603` px, `meanDiff: 3.13`) | Straight-on `-Z` back view (front buttons & pockets occluded); distinct collar/torso/sleeve silhouette cleanly framed above ContactShadow. |
| `Detail` | `detail` | `179589d592be1808` | `87.68%` | `130` | `55.37%` (`238,410` px, `meanDiff: 8.17`) | Close-up zoom onto front chest placket, buttons, and readable `#35383A` pockets (`130` quantized shades; collar/sleeve ends intentionally cropped by zoom). |

#### 2.2.2 Material Preset Swap Matrix (`Tiga Perempat`, `Obsidian` <-> `Deep Stone`)

| Step | `activePresetCode` | `mat_fabric_primary` (`appliedSlots`) | `mat_fabric_secondary` / `mat_hardware_accent` | Canvas SHA-256 | Sampled Chest RGB `(215, 416)` | `meanRgb` | Pixel Delta vs `obsidian_initial` | Visual Verdict |
|---|---|---|---|---|---|---|---|---|
| `obsidian_initial` | `obsidian` | `#1D1E20` | `#35383A` / `#C5A572` | `6707c78e2ba6fbfd` | `rgb(10, 10, 11)` | `[35.83, 36.73, 37.41]` | Baseline | **`PASS`**: Deep obsidian body (`#1D1E20`) distinct from lighter `#35383A` pockets/collar, warm `#C5A572` buttons, grounded ContactShadow. |
| `deep_stone` | `deep-stone` | `#5E5C54` | `#35383A` / `#C5A572` | `ce97360ecf6e3475` | **`rgb(60, 57, 49)`** | **`[54.70, 54.55, 51.96]`** | **`38.44%`** (`165,510` px, **`meanDiff: 17.08`**) | **`PASS`**: Unmistakable warm Deep Stone (`#5E5C54`) torso & sleeves contrasted against `#35383A` dark graphite pockets/collar, `#C5A572` buttons, and preserved ContactShadow. |
| `obsidian_return` | `obsidian` | `#1D1E20` | `#35383A` / `#C5A572` | `6707c78e2ba6fbfd` | `rgb(10, 10, 11)` | `[35.83, 36.73, 37.41]` | **`0.00%`** (`0` px, `meanDiff: 0.00`) | **`PASS`**: Deterministic exact pixel return. |

---

### 2.3 Test 3 — Mobile Lite Tier Verification (`375x812`)

- **Viewport & Capability:** `375x812`, `hasTouch: true` -> `window.__ARVEN_3D_DIAGNOSTICS__.activeTier = "lite"`, `loadState = "ready"`, `frameloop = "demand"`, `contextLostCount = 0`.
- **Network Profile Enforcement:**
  - Requested & received `http://localhost:3000/api/v1/3d-assets/ab90df35-de03-407b-9fd8-03b6fb2e95ba/model-lite` -> **`200`**.
  - Desktop `/model` URL requested: **`false`** (`0` requests).
  - Non-same-origin requests: **`0`**.
- **Touch Scroll Isolation & Visual Inspection (`read_file` on `test3-mobile-lite-375x812-stage.png`):**
  - Canvas renders cleanly at `339 x 452` CSS px (`nonBgPct: 60.40%`, `combinedStdDev: 74.07`, `darkerBottomHalfPixels: 31,600` showing soft ContactShadow under hem).
  - `touch-action` on `[role="region"]` is `pan-y` initially; `Aktifkan Putar 3D` toggles it to `none` (`Kunci Gulir Halaman`), then restores `pan-y` when toggled back.
  - Controls display `Tier: Lite (Mobile)` with clean wrapped rows and `0` `pageerror`.

---

### 2.4 Test 4 — 10x Model/Mount Swap `ResourceTracker` GPU Disposal & Leak Check

Executed in a **single persistent browser tab** navigating via Next.js SPA `<Link>` clicks through `/shop` across `10` consecutive mount/unmount cycles (`Model 3D` -> wait `ready` -> click `Depan` to trigger committed render metrics -> `Foto 2D` -> wait `fallback`):

| Cycle | Product Slug | Mounted (`ready`, post-render) `geo` / `tex` / `disposed` | Teardown (`fallback`) `geo` / `tex` / `disposed` | `contextLostCount` | `usedJSHeapMB` (Mounted / Teardown) |
|---|---|---|---|---|---|
| `1` | `atelier-boxy-wool-overshirt` | `4` / `3` / `0` | `1` / `3` / **`6`** | `0` | `21.87` / `22.37` |
| `2` | `movement-minimalist-leather-sneaker` | `4` / `3` / `0` | `1` / `3` / **`6`** | `0` | `23.57` / `23.93` |
| `3` | `essentials-heavyweight-crew-tee` | `4` / `3` / `0` | `1` / `3` / **`6`** | `0` | `30.90` / `31.28` |
| `4` | `atelier-boxy-wool-overshirt` | `4` / `3` / `0` | `1` / `3` / **`6`** | `0` | `25.42` / `25.82` |
| `5` | `movement-minimalist-leather-sneaker` | `4` / `3` / `0` | `1` / `3` / **`6`** | `0` | `23.04` / `23.44` |
| `6` | `essentials-heavyweight-crew-tee` | `4` / `3` / `0` | `1` / `3` / **`6`** | `0` | `39.83` / `40.21` |
| `7` | `atelier-boxy-wool-overshirt` | `4` / `3` / `0` | `1` / `3` / **`6`** | `0` | `32.11` / `32.53` |
| `8` | `movement-minimalist-leather-sneaker` | `4` / `3` / `0` | `1` / `3` / **`6`** | `0` | `48.95` / `49.30` |
| `9` | `essentials-heavyweight-crew-tee` | `4` / `3` / `0` | `1` / `3` / **`6`** | `0` | `47.17` / `47.54` |
| `10` | `atelier-boxy-wool-overshirt` | `4` / `3` / `0` | `1` / `3` / **`6`** | `0` | `64.00` / `64.37` |

- On every teardown (`10/10`), `ResourceTracker.disposeAll()` disposes all `3` GLB geometries and `3` GLB materials (`disposedResources = 6 > 0`), dropping `gl.info.memory.geometries` cleanly from `4 -> 1` (the `1` geometry / `3` textures remaining at `ProductSceneContent` effect cleanup belong to Drei `<ContactShadows>`, disposed immediately afterward as the `<Canvas>` subtree unmounts, never accumulating across cycles).
- **10x Consecutive Preset Swap Stability (`Obsidian` <-> `Deep Stone` with `frames={Infinity}`):** Across swaps `1..10`, `geometries` stayed flat at `4`, `textures` stayed flat at `3`, `disposedResources = 0`, and `contextLostCount = 0`.
- **Console / Runtime Hygiene:** `pageErrors = 0`, `contextLostCount = 0`. Non-fatal Three.js deprecation warning `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.` logged `11` times across `<Canvas>` mounts (`OBS-P7-3D-01`).

---

### 2.5 Test 5 — `--disable-webgl --disable-webgl2 --disable-3d-apis` End-to-End Fallback -> Cart -> Checkout Flow

| Step | Verified Behavior & Evidence | Result |
|---|---|---|
| **WebGL Disabled Probe** | Isolated Chromium with `--disable-webgl --disable-webgl2 --disable-3d-apis`: `canvas.getContext('webgl2') === null`, `webgl1 === null`. | **`PASS`** |
| **Fallback Stage UI** | Clicking `Model 3D` on `/products/atelier-boxy-wool-overshirt` mounts `[data-testid="arven-3d-fallback"]` with `0` `<canvas>`, loaded `poster` (`complete && naturalWidth > 0`), visible `Muat Ulang Model 3D` and `Kembali ke Foto 2D` buttons, and `Mode 2D Studio Aktif` banner. Clicking `Muat Ulang Model 3D` stays gracefully in fallback without throwing. | **`PASS`** |
| **Preset Sync & Add to Bag** | Selecting `Deep Stone` switches variant SKU to `ARV-OUT-001-L-STN` (`Rp 899.000`). Clicking `Add to Bag` returns `POST /api/v1/cart/items -> 200` with `configuration: { colorPresetCode: "deep-stone", colorPresetId: "3f6d4bf7-9fea-4f03-94a0-ff1e32ca5aa4", colorPresetLabel: "Deep Stone" }`. | **`PASS`** |
| **`/cart` & `/checkout`** | `/cart` displays `Atelier Boxy Wool Overshirt`, `SKU: ARV-OUT-001-L-STN`, `Deep Stone / Size L`, `Rp 899.000`. Clicking `Proceed to Checkout` loads `/checkout` cleanly with `Atelier Boxy Wool Overshirt` and `Rp 899.000` in Order Summary. | **`PASS`** |
| **Hygiene & Cleanup** | `0` `pageerror`, `0` `console.error`, `0` `http5xx`. Removed test cart item via `/cart` `Remove` (`DELETE /api/v1/cart/items/:id -> 204`), restoring `"Your Bag Is Empty"`. | **`PASS`** |

---

## 3. Non-Blocking Observations

1. **`OBS-P7-3D-01` (`THREE.Clock` Deprecation Warnings):** `three@0.187.0` logs `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.` once per `<Canvas>` mount from R3F internal clock initialization (`11` warnings observed during Test 4). Functional behavior is unaffected.
2. **`OBS-P7-3D-02` (Fallback Overlay Overlap on Poster SVG Lower Caption):** Visual inspection of `test5-fallback-element.png` shows the bottom overlay panel (`bg-[#17191B]/95`) sits over the lower decorative title/spec text embedded in the generated `poster` SVG, while the overlay text itself (`#F8F7F3` / `#B2B0A6`) remains readable at high contrast.
3. **`OBS-P7-3D-03` (Sneaker Sole Seam Shimmer):** In `test1-movement-minimalist-leather-sneaker-stage.png`, a faint horizontal shading transition/z-fighting line appears where the lower upper block meets the top of `sole_base` (`Y = 0.055..0.070`).

---

## 4. Scratch Evidence Paths (Outside Repository)

- Repair Iteration 3 Automation & JSON Telemetry:
  - `C:\Users\vickymosafan\.gemini\antigravity\brain\cdf1eba0-5e12-4bb4-9c29-71dc391a2e6c\scratch\run-three-d-qa-iter3.mjs`
  - `C:\Users\vickymosafan\.gemini\antigravity\brain\cdf1eba0-5e12-4bb4-9c29-71dc391a2e6c\scratch\three-d-qa-results-iter3.json`
- Repair Iteration 3 Visual & Canvas PNG Captures (`read_file` Inspected):
  - `C:\Users\vickymosafan\.gemini\antigravity\brain\cdf1eba0-5e12-4bb4-9c29-71dc391a2e6c\scratch\screenshots-iter3\test1-*-stage.png` & `*-canvas.png`
  - `C:\Users\vickymosafan\.gemini\antigravity\brain\cdf1eba0-5e12-4bb4-9c29-71dc391a2e6c\scratch\screenshots-iter3\test2-cam-*-stage.png` & `test2-preset-*-stage.png`
  - `C:\Users\vickymosafan\.gemini\antigravity\brain\cdf1eba0-5e12-4bb4-9c29-71dc391a2e6c\scratch\screenshots-iter3\test3-mobile-lite-375x812-stage.png`
  - `C:\Users\vickymosafan\.gemini\antigravity\brain\cdf1eba0-5e12-4bb4-9c29-71dc391a2e6c\scratch\screenshots-iter3\test5-fallback-element.png`
- Initial Pre-Repair Baseline (`BA0BbwlrTPzeDXz72cRIk`):
  - `C:\Users\vickymosafan\.gemini\antigravity\brain\cdf1eba0-5e12-4bb4-9c29-71dc391a2e6c\scratch\three-d-qa-results.json` & `screenshots\`

---

## 5. Final Checkpoint Verdict

- **`3d-rendering` Quality Checkpoint:** **`PASS`**
