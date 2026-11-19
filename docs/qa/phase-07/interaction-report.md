# ARVEN Phase 07 Functional Interaction QA Report

> **Harness Plan ID:** `22202ad0-0d75-430c-ad26-ba1895be7ec4`  
> **Task ID:** `1b742c7b-3be8-46d9-87d2-d2d883eb1e31`  
> **Checkpoint ID:** `interaction`  
> **Independent Verifier:** `functional-qa-agent`  
> **Execution Window (UTC):** `2026-11-18T19:03:16.828Z` – `2026-11-18T19:03:40.608Z`  
> **Live Builds Verified:**  
> - Storefront (`http://localhost:3000`): `BUILD_ID = nvuShbP1qGRRdLkauDvtM`  
> - Admin (`http://localhost:3001`): `BUILD_ID = LsU5Qdu5Bg-Ht0xSNk8kM`  
> - API (`http://localhost:4000`): Live (`PostgreSQL 18` + `Memurai/Redis` + `@arven/worker`)  
> **Browser Engine:** Playwright Chromium `1248` (`D:\ms-playwright\chromium-1248\chrome-win64\chrome.exe`, headless, `1280x800`, WebGL 2.0 via `--use-gl=angle --use-angle=swiftshader --enable-webgl --ignore-gpu-blocklist`)  
> **Overall Verdict:** **`PASS`** *(Scenarios 1–4 + Runtime Hygiene + DB/Storage Cleanup verified end-to-end with `pageErrors = 0`, `http5xx = 0`, `0` CSP violations, `0` unexpected `403 CSRF_INVALID`, and `0` unexpected HTTP errors)*

---

## 1. Executive Summary & Scenario Matrix

All Phase 07 end-to-end Storefront 3D PDP, Cart Configuration, 2D-Only Boundary, and Admin 3D Asset Studio workflows passed against the live built servers, PostgreSQL 18, and Redis:

| Scenario | Scope Verified | Verdict | Key Verified Evidence |
|---|---|---|---|
| **Scenario 1** | Storefront PDP 2D <-> 3D & Camera Controls (`/products/atelier-boxy-wool-overshirt`) | **`PASS`** | `Foto 2D` active by default (`aria-pressed="true"`); `4/4` gallery images loaded (`0` broken); `"Lewati Tampilan 3D"` -> `#pdp-purchase-controls`; `Model 3D` fires `POST /api/v1/3d-assets/telemetry` (`viewer_opened`, `202`), mounts `<canvas>` (`568 × 757.3px`, `loadState: "ready"`, `frameloop: "demand"`); all `4` camera presets (`Depan`, `Belakang`, `Detail`, `Tiga Perempat`) update `aria-pressed`, `cameraPreset` diagnostics & telemetry (`202`), and live region; all `5` step controls update `aria-live="polite"`; keyboard (`ArrowLeft`, `ArrowRight`, `+`, `-`, `Home`) works without trapping `Tab` focus; `Foto 2D` cleanly unmounts `<canvas>`. |
| **Scenario 2** | Customization Presets -> Variant Sync -> Size Guide -> Add to Bag -> `/cart` Persistence | **`PASS`** | Selecting `Deep Stone` updates `[role="radio"]` `aria-checked="true"`, `activePresetCode: "deep-stone"`, Three.js slot `mat_fabric_primary -> #5E5C54`, `preset_selected` telemetry (`202`), SKU `ARV-OUT-001-L-STN`, variant `Color: Deep Stone`, and `Rp 899.000`. `Size Guide` modal opens (`4` rows) and closes via `Escape`. `POST /api/v1/cart/items` request & response carry `configuration: { colorPresetId, colorPresetCode, colorPresetLabel }`, persisted across `/cart` reload (`GET /api/v1/cart`), and item removed via UI `Remove`. |
| **Scenario 3** | 2D-Only Product Boundary (`/products/form-structured-calfskin-crossbody`) | **`PASS`** | Clean 2D gallery (`4/4` images loaded, `0` broken), `0` 3D mode buttons, `0` `[data-testid="product-3d-viewer-island"]`, `0` `<canvas>`, `0` skip links, `0` preset radiogroups. `Add to Bag` (`200`, no `configuration` payload) and UI `Remove` verified cleanly. |
| **Scenario 4** | Admin 3D Asset Studio (`owner.dev@arven.local` + live TOTP MFA, temp product `qa-p7-temp-jacket-1795028605751`) | **`PASS`** | Live TOTP MFA login (`step: 59834286 > 59834283`); `4(a)` `422 PUBLISH_GATE_UNMET` (`THREE_D_ASSET_READINESS` / `assets3d`); `4(b)` `presign (201) -> upload-staging (200) -> confirm (202)` -> `READY` + `Validation PASSED`; `4(c)` pink `#FF69B4` rejected by both frontend & backend (`400`), compliant `#5E5C54` preset created (`201`, `mat_fabric_primary`) & deleted (`204`); `4(d)` `Preview 3D QA` modal `<canvas>` `loadState: "ready"`, closes via `Escape`; `4(e)` `Publish 3D Version` (`200`, `isActiveVersion: true`) unlocks `PUBLISHED`; `4(f)` `GET /api/v1/admin/analytics/3d-engagement` (`200`) confirms telemetry & readiness increments + temp product soft-deleted (`204`); `4(g)` clean `Sign Out` (`POST /api/v1/auth/logout` `200`, `/login`, `/auth/me` -> `401`). |
| **Scenario 5** | Runtime Hygiene & Post-Cleanup Integrity | **`PASS`** | `pageErrors = 0`, `http5xx = 0`, `0` CSP errors, `0` unexpected `403 CSRF_INVALID`, `0` unexpected HTTP errors; post-cleanup DB & `.local/storage` restored to exact baseline (`11` products, `4` 3D-enabled, `6` active `READY` assets, `0` QA products/staging files/guest carts). |

---

## 2. Detailed Scenario Assertions & Network/DOM Evidence

### 2.1 Scenario 1 — Storefront PDP 2D <-> 3D & Camera Controls (`/products/atelier-boxy-wool-overshirt`)

1. **Initial 2D Studio State:**
   - `Foto 2D` button: `aria-pressed="true"`; `Model 3D` button: `aria-pressed="false"`.
   - `"Lewati Tampilan 3D"` skip link: `href="#pdp-purchase-controls"`, target `#pdp-purchase-controls` present.
   - Gallery images: `4 / 4` loaded (`brokenImages: 0`), `0` `<canvas>` elements mounted.
2. **Switch to `Model 3D`:**
   - Triggered `POST http://localhost:3000/api/v1/3d-assets/telemetry` (`202`):
     - Request: `{"eventType":"viewer_opened","productId":"fdd1c8aa-2047-4b13-9d19-b895d90e44c7","assetId":"ab90df35-de03-407b-9fd8-03b6fb2e95ba","version":1,"deviceTier":"default","presetCode":"obsidian"}`
     - Response: `{"success":true,"data":{"recorded":true,"eventType":"viewer_opened","recordedAtUtc":"2026-11-18T19:03:18.933Z"}}`
   - WebGL `<canvas>` rendered at `568 × 757.33px` inside `[data-testid="arven-3d-experience"]`.
   - `window.__ARVEN_3D_DIAGNOSTICS__`: `loadState = "ready"`, `frameloop = "demand"`, `activeTier = "default"`, `activePresetCode = "obsidian"`, `cameraPreset = "three_quarter"`, `geometries = 4`, `textures = 3`, `contextLostCount = 0`, `appliedSlots` (`mat_fabric_primary: #1D1E20`, `mat_fabric_secondary: #35383A`, `mat_hardware_accent: #C5A572`).
   - Mode toggle updated: `Model 3D` `aria-pressed="true"`, `Foto 2D` `aria-pressed="false"`.
3. **Camera Presets & Step Controls (`[data-testid="arven-3d-controls"]`):**

| Control | Action | `aria-pressed` / State | Telemetry (`POST /api/v1/3d-assets/telemetry`) | `window.__ARVEN_3D_DIAGNOSTICS__.cameraPreset` | Live Region (`[aria-live="polite"]`) |
|---|---|---|---|---|---|
| `Depan` | Click | `Depan="true"`, others `"false"` | `202` (`camera_preset`: `front`) | `front` | `"Sudut kamera front diaktifkan."` |
| `Belakang` | Click | `Belakang="true"`, others `"false"` | `202` (`camera_preset`: `back`) | `back` | `"Sudut kamera back diaktifkan."` |
| `Detail` | Click | `Detail="true"`, others `"false"` | `202` (`camera_preset`: `detail`) | `detail` | `"Sudut kamera detail diaktifkan."` |
| `Tiga Perempat` | Click | `Tiga Perempat="true"`, others `"false"` | `202` (`camera_preset`: `three_quarter`) | `three_quarter` | `"Sudut kamera three quarter diaktifkan."` |
| `Putar Kiri 45°` | Click | Azimuth `-45°` | *(no redundant telemetry)* | `three_quarter` | `"Model diputar ke kiri 45 derajat."` |
| `Putar Kanan 45°` | Click | Azimuth `+45°` | *(no redundant telemetry)* | `three_quarter` | `"Model diputar ke kanan 45 derajat."` |
| `Perbesar` | Click | Zoom in | *(no redundant telemetry)* | `three_quarter` | `"Model 3D diperbesar."` |
| `Perkecil` | Click | Zoom out | *(no redundant telemetry)* | `three_quarter` | `"Model 3D diperkecil."` |
| `Reset Tampilan` | Click | Reset camera | *(no redundant telemetry)* | `three_quarter` | `"Tampilan kamera 3D direset ke posisi default."` |

4. **Keyboard Navigation on `[role="region"]` & Focus Exit:**
   - Focused `[data-testid="arven-3d-experience"] [role="region"]`; pressed `ArrowLeft`, `ArrowRight`, `+` (`"Model 3D diperbesar."`), `-` (`"Model 3D diperkecil."`), `Home` (`"Tampilan kamera 3D direset ke posisi default."`).
   - Pressing `Tab` moved `document.activeElement` cleanly out of `[role="region"]` onto `BUTTON` `"Tiga Perempat"` (`insideRegion: false`), confirming zero focus trapping.
5. **Return to `Foto 2D`:**
   - Clicking `Foto 2D` unmounted `[data-testid="product-3d-viewer-island"]` (`islandCount: 0`, `canvasCount: 0`), set `Foto 2D` `aria-pressed="true"`, and displayed `4 / 4` loaded 2D studio images (`brokenImages: 0`).

---

### 2.2 Scenario 2 — Preset Sync, Size Guide Modal, Add to Bag & Cart Configuration Persistence

1. **Preset -> Three.js Material -> Variant Synchronization:**
   - Re-opened `Model 3D` (`loadState: "ready"`) and selected `Deep Stone` in `[role="radiogroup"][aria-label="Material and color presets"]`:
     - Radio state: `Obsidian="false"`, `Deep Stone="true"`.
     - Telemetry: `POST /api/v1/3d-assets/telemetry` (`preset_selected`, `presetCode: "deep-stone"`) -> `202`.
     - `window.__ARVEN_3D_DIAGNOSTICS__`: `activePresetCode = "deep-stone"`, `appliedSlots` updated `mat_fabric_primary -> #5E5C54` (`mat_fabric_secondary: #35383A`, `mat_hardware_accent: #C5A572`).
     - Synchronized PDP controls: `Color: Deep Stone` (`Deep Stone` button `aria-pressed="true"`), `SKU: ARV-OUT-001-L-STN`, price `Rp 899.000`.
2. **`Size Guide` Modal:**
   - Clicking `Size Guide` opened `[role="dialog"]` (`"Outerwear Size & Measurement Guide"`, `4` measurement rows); pressing `Escape` dismissed the modal cleanly (`[role="dialog"]` detached).
3. **`Add to Bag` & `/cart` Persistence:**
   - Clicking `Add to Bag` sent `POST http://localhost:3000/api/v1/cart/items` (`200`):
     - Request JSON:
       ```json
       {
         "variantId": "f016ca29-be41-4417-8cbf-c300650ca5ed",
         "quantity": 1,
         "configuration": {
           "colorPresetId": "3f6d4bf7-9fea-4f03-94a0-ff1e32ca5aa4",
           "colorPresetCode": "deep-stone",
           "colorPresetLabel": "Deep Stone"
         }
       }
       ```
     - Response `data.items[0].configuration`: `{"colorPresetCode":"deep-stone","colorPresetId":"3f6d4bf7-9fea-4f03-94a0-ff1e32ca5aa4","colorPresetLabel":"Deep Stone"}`.
   - Navigated to `/cart` and executed a full `page.reload()`:
     - `GET /api/v1/cart` after reload returned the exact persisted `configuration` (`colorPresetId: "3f6d4bf7-9fea-4f03-94a0-ff1e32ca5aa4"`, `colorPresetCode: "deep-stone"`, `colorPresetLabel: "Deep Stone"`).
     - `/cart` DOM displayed `Guest Bag`, `Atelier Boxy Wool Overshirt`, `SKU: ARV-OUT-001-L-STN`, `#5E5C54` color swatch + `Deep Stone / Size L`, `Rp 899.000`. *(Note: `CartView` in `apps/storefront/src/components/cart/cart-view.tsx` surfaces the synced variant color `Deep Stone`, `colorHex`, and `Size L` in the DOM while retaining `item.configuration` in the `CartItemDto` API response & `cart_items` table.)*
   - Clicked `Remove` (`DELETE /api/v1/cart/items/:id`), returning `/cart` to `"Your Bag Is Empty"`.

---

### 2.3 Scenario 3 — 2D-Only Product Boundary (`/products/form-structured-calfskin-crossbody`)

- **UI Boundary Check:** `hasFoto2DBtn: false`, `hasModel3DBtn: false`, `islandCount: 0`, `experienceCount: 0`, `canvasCount: 0`, `skip3DCount: 0`, `presetGroupCount: 0`, and `4 / 4` 2D gallery images loaded (`brokenImages: 0`).
- **Purchase Flow:** `Add to Bag` sent `POST /api/v1/cart/items` (`200`, `{"variantId":"7f11755d-3fce-4d82-95f2-ca62cfc05b67","quantity":1}`, no `configuration`), navigated to `/cart`, verified item display, and removed cleanly via UI `Remove`.
- **Non-Blocking Observation (`OBS-07-03`):** `ProductDetailView` (`apps/storefront/src/components/catalog/product-detail-view.tsx`) issues `GET /api/v1/products/form-structured-calfskin-crossbody/3d-assets` even when `has3dEnabled === false`, producing 1 caught `404 RESOURCE_NOT_FOUND` response (`console.error` native browser 404 entry) while rendering zero 3D UI.

---

### 2.4 Scenario 4 — Admin Product Detail 3D Asset Studio (`http://localhost:3001`)

1. **Admin Login & Live TOTP MFA:**
   - Authenticated `owner.dev@arven.local` at `/login` (`Continue to MFA`) -> `/mfa/verify` with live TOTP (`step: 59834286 > previousLastStep: 59834283`, `Verify & Continue`) -> landed on `/` (`Operations Overview`).
2. **Temporary Product Provisioning (`/catalog/products`):**
   - Created `QA P7 Temp Jacket 1795028605751` (`slug: qa-p7-temp-jacket-1795028605751`, ID `3c06c6a2-8c9d-4e09-8091-43c415c2b720`, category `Outerwear`).
   - Added variant `QAP7-JKT-1795028605751` (`M / Obsidian / #17191B`, `Rp 1.290.000`, `650 g`, `5` stock) and attached primary studio SVG media.
3. **4(a) Publish Gate Enforcement (`422 PUBLISH_GATE_UNMET` / `THREE_D_ASSET_READINESS`):**
   - With all 4 core checks green, transitioned `DRAFT -> READY_TO_PUBLISH` (`has3dEnabled = false`), then checked `#edit-prod-3d-enabled` and saved: `PATCH /api/v1/admin/products/3c06c6a2-8c9d-4e09-8091-43c415c2b720` rejected with **`422 PUBLISH_GATE_UNMET`**.
   - Returned to `DRAFT`, checked `#edit-prod-3d-enabled`, saved (`1 Gate Issue(s)`), and verified UI Publish Gate panel rendered **`Validated 3D asset, poster & mobile lite profile` -> `UNMET`** (`assets3d: has3dEnabled is true, so an active READY Product3DAsset version must be published first`).
   - Clicking `Mark Ready to Publish` (`DRAFT -> READY_TO_PUBLISH`) and probing `targetStatus: "PUBLISHED"` both returned **`422 PUBLISH_GATE_UNMET`** with `details: [{ field: "assets3d", issue: "has3dEnabled is true, so an active READY Product3DAsset version must be published first" }]` and surfaced the `"Lifecycle transition blocked"` `StatusBanner`.
4. **4(b) `"Generate Studio GLB & Validate"` Quarantine-to-Public Pipeline:**
   - Executed:
     1. `POST /api/v1/admin/products/3c06c6a2-8c9d-4e09-8091-43c415c2b720/3d-assets/presign` -> **`201`**
     2. `PUT /api/v1/admin/3d-assets/140af5a4-354b-432a-9384-95fc0436ca00/upload-staging` -> **`200`**
     3. `POST /api/v1/admin/3d-assets/140af5a4-354b-432a-9384-95fc0436ca00/confirm` -> **`202`** (`status: "READY"`, `validationRuns[0].status: "PASSED"`)
   - UI rendered `v0001`, `READY`, `GLB`, `9,920 B`, `132 tri / 264 vtx`, `VALIDATION PASSED`, `Mesh and material slot checks passed.`
5. **4(c) Customization Preset Validation & CRUD:**
   - **Invalid Pink Hex (`#FF69B4`):**
     - Frontend form blocked submission immediately with `"Preset Validation Error"` (`"Swatch hex must be a valid 6-digit hex color (#RRGGBB). Pink and magenta colors are forbidden by the ARVEN design contract."`).
     - Direct backend probe `POST /api/v1/admin/3d-assets/140af5a4-354b-432a-9384-95fc0436ca00/presets` with `#FF69B4` rejected with **`400 VALIDATION_ERROR`** (`"Pink palette hex colors are forbidden by the ARVEN design contract"` on both `swatchHex` and `materialOverrides.mat_fabric_primary.baseColorHex`).
   - **Compliant Slate/Stone Preset (`#5E5C54`):**
     - Created `qa-slate-stone` (`QA Slate Stone`, `#5E5C54`, bound to `mat_fabric_primary` and linked to variant `QAP7-JKT-1795028605751`) -> **`201`**.
     - Deleted cleanly via `Delete Preset` (`DELETE` -> **`204`**), restoring `"No customization presets defined"`.
6. **4(d) `"Preview 3D QA"` Modal:**
   - Opened `[role="dialog"]` (`"3D QA Preview: v0001"`), mounted live `<canvas>` (`1` canvas inside `[role="dialog"]`, `assetId: "140af5a4-354b-432a-9384-95fc0436ca00"`, `loadState: "ready"`, `activePresetCode: "qa-slate-stone"`, `mat_fabric_primary: #5E5C54`, `contextLostCount: 0`, `0` errors), and closed cleanly via `Escape`.
7. **4(e) `"Publish 3D Version"` & Product Publication:**
   - `POST /api/v1/admin/3d-assets/140af5a4-354b-432a-9384-95fc0436ca00/publish` -> **`200`** (`isActiveVersion: true`), UI displayed `Active Version` and `Publish Gate Passed` (`5/5` green checks).
   - Transitioned `DRAFT -> READY_TO_PUBLISH -> PUBLISHED` cleanly via UI (`Archive Product` visible).
8. **4(f) 3D Engagement Analytics & Temp Product Cleanup:**

| Metric (`GET /api/v1/admin/analytics/3d-engagement`) | Pre-Run Redis / DB Baseline | After Scenarios 1–2 (`preTemp`) | During Temp Published (`duringTemp`) | Verified Delta |
|---|---|---|---|---|
| `viewerOpenedCount` | `75` | `78` | `78` | **`+3`** *(+1 Scenario 1; +2 Scenario 2)* |
| `presetSelectedCount` | `4` | `5` | `5` | **`+1`** *(Scenario 2 `deep-stone`)* |
| `cameraPresetCount` | `13` | `17` | `17` | **`+4`** *(`front`, `back`, `detail`, `three_quarter`)* |
| `fallbackTriggeredCount` / `loadErrorCount` / `contextLostCount` | `0 / 0 / 0` | `0 / 0 / 0` | `0 / 0 / 0` | `0` |
| `readyAssetsCount` | `6` | `6` | `7` | **`+1`** *(temp `v0001` ready & active)* |
| `productsWith3DCount` | `4` | `4` | `5` | **`+1`** *(temp jacket `has3dEnabled=true`)* |

   - *(Note: `Product3DViewerIsland` includes `activePresetId` in `handleTelemetry`'s callback dependencies, so switching presets in Scenario 2 causes `ProductExperience`'s mount `useEffect` to emit an additional `viewer_opened` event alongside `preset_selected`.)*
   - Soft-deleted temporary product via `Soft Delete -> Confirm Soft Delete` (`DELETE /api/v1/admin/products/3c06c6a2-8c9d-4e09-8091-43c415c2b720` -> `204`, redirected to `/catalog/products`).
9. **4(g) Admin Sign Out:**
   - Clicked sidebar `Sign Out` -> `POST /api/v1/auth/logout` (`200`), redirected to `http://localhost:3001/login`, and `GET /api/v1/auth/me` returned **`401`**.

---

## 3. Runtime Hygiene Audit

| Surface | `pageerror` | `http5xx` | CSP Violations | Unexpected `403 CSRF_INVALID` | Unexpected HTTP `>= 400` | Intentional / Expected HTTP `>= 400` Entries |
|---|---|---|---|---|---|---|
| **Storefront (`:3000`)** | `0` | `0` | `0` | `0` | **`0`** | `1` expected `404` (`GET /api/v1/products/form-structured-calfskin-crossbody/3d-assets` in Scenario 3 per `OBS-07-03`) |
| **Admin (`:3001`)** | `0` | `0` | `0` | `0` | **`0`** | `3` intentional `422 PUBLISH_GATE_UNMET` probes in Scenario 4(a); `1` intentional post-logout `401 /api/v1/auth/me` verification in Scenario 4(g) |

*(Note: Navigation prefetch `net::ERR_ABORTED` on Next.js `_rsc` link prefetches during immediate route changes are standard cancelled router prefetches, not application errors.)*

---

## 4. Ephemeral Fixture Cleanup & Post-Cleanup Verification

- **Database Cleanup Executed:** Deleted ephemeral test rows created by QA (`1` product `qa-p7-temp-jacket-1795028605751`, `1` 3D asset `140af5a4-354b-432a-9384-95fc0436ca00`, `1` validation run, `1` variant, `1` inventory level, `1` inventory movement, `1` media row, `1` product category link, `3` outbox events, and `1` ephemeral guest cart).
- **Local Object Storage Cleanup Executed:** Removed `d:\portfolio-project-2026\arven e-commerce\.local\storage\public\products\qa-p7-temp-jacket-1795028605751`; `.local/storage/staging/3d` confirmed empty (`none`).
- **Post-Cleanup Verification:**
  - `products` (`deleted_at IS NULL`): `11` total (`4` with `has_3d_enabled = true`) — exact pre-test baseline.
  - `product_3d_assets` (`READY` & `is_active_version = true`): `6` — exact pre-test baseline.
  - Seeded inventory intact (`ARV-ACC-001`: `14` on hand / `0` reserved; `ARV-OUT-001`: `12` / `0`; `ARV-OUT-001-L-STN`: `7` / `0`).
  - Public routes `/products/atelier-boxy-wool-overshirt` (`200`), `/products/form-structured-calfskin-crossbody` (`200`), and `/api/v1/products/atelier-boxy-wool-overshirt/3d-assets` (`200`) verified live post-cleanup.
- **Scratch Evidence Artifacts (Outside Repo):**
  - Execution script & JSON results: `C:\Users\vickymosafan\.gemini\antigravity\brain\b531e235-5a07-4835-a81e-237ba686ab36\scratch\run-phase07-interaction-qa.mjs`, `qa-results.json`, `verify-post-cleanup.mjs`
  - Visual screenshots (`01`–`10`): `C:\Users\vickymosafan\.gemini\antigravity\brain\b531e235-5a07-4835-a81e-237ba686ab36\scratch\screenshots\`

---

## 5. Final Checkpoint Verdict

- **`interaction` Quality Checkpoint:** **`PASS`**
