# ARVEN Phase 07 Accessibility QA Report (`WCAG 2.2 AA`)

> **Harness Plan ID:** `22202ad0-0d75-430c-ad26-ba1895be7ec4`  
> **Task ID:** `3fa51971-a330-4dc5-ae17-18daa3c768e3`  
> **Checkpoint ID:** `accessibility`  
> **Independent Verifier:** `accessibility-qa-agent`  
> **Initial Audit Window (UTC):** `2026-11-18T20:19:20.411Z` – `2026-11-18T20:26:43Z` (`FAIL` — `DEFECT-P7-A11Y-01`, `DEFECT-P7-A11Y-02`, plus `OBS-P7-A11Y-01`..`04`)  
> **Repair Iteration 4 Re-Verification Window (UTC):** `2026-11-18T20:40:19.052Z` – `2026-11-18T20:42:18Z`  
> **Rebuilt Live Builds Verified (Repair Iteration 4):**  
> - Storefront (`http://localhost:3000`): `BUILD_ID = T3kRHW2DSXnWAih3fLlDc`  
> - Admin (`http://localhost:3001`): `BUILD_ID = bPZ-VK30xA9SdrP5WT1Zd`  
> - API (`http://localhost:4000`): Live (`PostgreSQL 18` + `Redis`)  
> **Tools & Versions:** Playwright `1.65.1` (`D:\ms-playwright\chromium-1248\chrome-win64\chrome.exe`, headless Chromium with WebGL2 SwiftShader ANGLE and separate `--disable-webgl --disable-webgl2 --disable-3d-apis` fallback instance) + `@axe-core/playwright` `4.14.0` (`axe-core` `4.14.0`, tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`)  
> **Overall Verdict:** **`PASS`** *(Repair Iteration 4 resolved both blocking WCAG 2.2 SC 2.4.7 defects and all 4 advisories; `13 / 13` `@axe-core/playwright` scans returned `0` violations, and all manual keyboard, 4-edge focus visibility, `640x400` 200% zoom, `375x812` mobile, reduced motion, WebGL fallback, and Admin TOTP MFA + clean sign-out checks passed.)*

---

## 1. Executive Summary & Repair Closure Matrix

Independent re-verification against the rebuilt Storefront (`T3kRHW2DSXnWAih3fLlDc`) and Admin (`bPZ-VK30xA9SdrP5WT1Zd`) servers confirms closure of all Phase 07 accessibility defects and advisories:

| Defect / Advisory ID | Initial Audit Finding (`k-twutXkr2LC09Is9udJo` / `gkQxnS4HNU7gxZmdxalPy`) | Repair Iteration 4 Re-Verification (`T3kRHW2DSXnWAih3fLlDc` / `bPZ-VK30xA9SdrP5WT1Zd`) | Status |
|---|---|---|---|
| **`DEFECT-P7-A11Y-01`** | Unlayered `:focus-visible { outline-offset: 2px; }` in `packages/ui/src/styles/tokens.css` overrode `focus-visible:outline-offset-[-2px]` on `[role="region"]` in `ProductExperience.tsx`, clipping the `#82B0DC` focus ring on top/left/right inside `overflow-hidden`. | `:focus-visible` wrapped inside `@layer base` in `packages/ui/src/styles/tokens.css#L227-L238`; `[role="region"]` in `ProductExperience.tsx#L733` computes `outlineOffset: "-2px"` and `::after` `border: 2px solid #82B0DC` (`z-20`, `7.72:1` on `#17191B`). Pixel edge check verified **all 4 edges unclipped** on Storefront (`568x758`: `top: 1148`, `bottom: 1144`, `left: 1526`, `right: 1526` `#82B0DC` pixels) and Admin `Preview 3D QA` Modal (`716x956`: `top: 1440`, `bottom: 1440`, `left: 1920`, `right: 1920` `#82B0DC` pixels). | **CLOSED** |
| **`DEFECT-P7-A11Y-02`** | `ProductCard` media `<a>` in `packages/ui/src/components/product-card.tsx#L76-L81` used `outline-offset: 2px` inside `overflow-hidden`, clipping `#1F4E79` on all 4 sides. | `ProductCard` media `<a>` computes `outlineOffset: "-2px"` + `::after` `border: 2px solid #1F4E79` (`6.84:1` on `#E9E4DA`). Pixel edge check (`01-product-card-media-focused.png`, `279x372`) verified **all 4 edges unclipped** (`top: 566`, `bottom: 570`, `left: 754`, `right: 754` `#1F4E79` pixels). | **CLOSED** |
| **`OBS-P7-A11Y-01`** | `[role="radiogroup"]` Material & Color Presets did not support Arrow-key navigation (`ArrowRight` kept focus on `Obsidian`). | `ArrowRight` moves focus + `aria-checked="true"` to `Deep Stone` (`SKU: ARV-OUT-001-L-STN`, `mat_fabric_primary: #5E5C54`); `ArrowLeft` restores `Obsidian` (`SKU: ARV-OUT-001`, `#1D1E20`); `End`/`Home` also switch focus + preset cleanly (`product-detail-view.tsx#L572-L595`). | **CLOSED** |
| **`OBS-P7-A11Y-02`** | `@axe-core/playwright` flagged `aria-prohibited-attr` (`incomplete`) on `<span aria-live="polite" aria-label="Selected quantity 1">`. | Added `role="status"` on quantity readout `<span>` (`product-detail-view.tsx#L670-L675`); `aria-prohibited-attr` dropped to **`0`** across every `@axe-core/playwright` scan. | **CLOSED** |
| **`OBS-P7-A11Y-03`** | `ArrowLeft` / `ArrowRight` on `[role="region"]` rotated the 3D canvas without updating `[aria-live="polite"]`. | `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown` now announce `"Model diputar ke kiri."`, `"Model diputar ke kanan."`, `"Model dimiringkan ke atas."`, `"Model dimiringkan ke bawah."` alongside `+`/`-`/`Home` (`ProductExperience.tsx#L580-L605`). | **CLOSED** |
| **`OBS-P7-A11Y-04`** | Light PDP Mode Toggle & Preset radio buttons transitioned `outline-color` over `150ms` via `transition-colors`. | Switched to `transition-[background-color,border-color,color]`; `Model 3D` toggle and `Obsidian` radio now render `#1F4E79` (`8.08:1`) immediately at **`t=0ms`** and **`t=220ms`**. | **CLOSED** |

---

## 2. Automated `@axe-core/playwright` WCAG 2.2 AA Scan Summary (Post-Repair)

Tags executed: `['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']` across **13** live route, state, viewport, and browser configurations:

| # | Application, Route & State | Viewport / Condition | Passes | Incomplete | Violations | Failing Rule IDs |
|---:|---|---|---:|---:|---:|---|
| 1 | Storefront `/products/atelier-boxy-wool-overshirt` — **2D Mode** | `1280x800` | `24` | `1` | **`0`** | `-` |
| 2 | Storefront `/products/atelier-boxy-wool-overshirt` — **3D Mode (`Model 3D`)** | `1280x800` (WebGL2) | `24` | `2` | **`0`** | `-` |
| 3 | Storefront `/products/atelier-boxy-wool-overshirt` — **3D Mode + Size Guide Modal Open** | `1280x800` (WebGL2) | `26` | `2` | **`0`** | `-` |
| 4 | Storefront `/products/atelier-boxy-wool-overshirt` — **WebGL-Disabled 2D Fallback** | `1280x800` (`--disable-webgl`) | `24` | `2` | **`0`** | `-` |
| 5 | Storefront `/products/atelier-boxy-wool-overshirt` — **3D Mode (`200%` Zoom Equivalent)** | `640x400` (WebGL2) | `24` | `2` | **`0`** | `-` |
| 6 | Storefront `/products/atelier-boxy-wool-overshirt` — **3D Mode Mobile** | `375x812` (WebGL2) | `24` | `2` | **`0`** | `-` |
| 7 | Storefront `/products/atelier-boxy-wool-overshirt` — **3D Mode + Reduced Motion** | `1280x800` (`reducedMotion: 'reduce'`) | `24` | `2` | **`0`** | `-` |
| 8 | Storefront `/products/movement-minimalist-leather-sneaker` — **3D Mode** | `1280x800` (WebGL2) | `22` | `2` | **`0`** | `-` |
| 9 | Storefront `/products/form-structured-calfskin-crossbody` — **2D-Only** | `1280x800` | `24` | `1` | **`0`** | `-` |
| 10 | Admin `/catalog/products/fdd1c8aa-2047-4b13-9d19-b895d90e44c7` — **Metadata + `AdminProduct3DPanel` (Dark)** | `1280x800` (TOTP MFA) | `29` | `0` | **`0`** | `-` |
| 11 | Admin `/catalog/products/fdd1c8aa-2047-4b13-9d19-b895d90e44c7` — **`Preview 3D QA` Modal Open (Dark)** | `1280x800` (WebGL2) | `30` | `1` | **`0`** | `-` |
| 12 | Admin `/catalog/products/fdd1c8aa-2047-4b13-9d19-b895d90e44c7` — **Metadata + `AdminProduct3DPanel` (Light)** | `1280x800` (TOTP MFA) | `29` | `0` | **`0`** | `-` |
| 13 | Admin `/catalog/products/fdd1c8aa-2047-4b13-9d19-b895d90e44c7` — **`Preview 3D QA` Modal Open (Light)** | `1280x800` (WebGL2) | `30` | `1` | **`0`** | `-` |

### Manual Review of Remaining `axe-core` `incomplete` Nodes
- **`color-contrast` (2–3 nodes on 3D stages):** HUD badges (`3D STUDIO · v0001` `#C5A572` on `#17191B/90` = `7.55:1` / `Obsidian` `#F8F7F3` on `#17191B/90` = `16.44:1`) sit over `<canvas>` (`imgNode` indeterminate to `axe-core`, verified `>= 7.55:1` against `#17191B/90` scrim).
- **`label-content-name-mismatch` (2 nodes on PDPs):** Quantity stepper buttons `-` (`aria-label="Decrease quantity"`) and `+` (`aria-label="Increase quantity"`); symbolic arithmetic signs flagged as indeterminate (`N/A` speech-input text mismatch).
- **`aria-prohibited-attr`:** **`0`** across all `13` scans after adding `role="status"` (`OBS-P7-A11Y-02`).

---

## 3. Semantic Structure, Headings, Labels & Tap Targets

| View Audited (`1280x800`) | Landmarks (`header`/`nav`/`main#main-content`/`footer`) | `h1` Count & Heading Hierarchy | Missing Image `alt` | Unnamed Buttons | Unlabeled Inputs | `< 44px` Interactive Controls (Excluding `sr-only` Skip Links) |
|---|---|---|---|---|---|---|
| Storefront Overshirt PDP (2D Mode) | `1` / `2` / `1` (`#main-content`) / `1` | `1` `h1`; `h1 -> h2 x5 -> h3` (`0` skips) | `0 / 5` | `0 / 17` | `0 / 0` | `4` inline header/footer links (`Home` `43x44`, `Shop` `38.5x44`, `About` `43.2x44`, `Bag` `31.1x44` — all `>= 24x24px` & `44px` tall) |
| Storefront Overshirt PDP (3D Mode) | `1` / `2` / `1` (`#main-content`) / `1` | `1` `h1`; `h1 -> h2 x5 -> h3` (`0` skips) | `0 / 1` | `0 / 23` | `0 / 0` | Same `4` inline links; **all 9 `AccessibleProductControls` buttons `>= 44px` height & `>= 66.6px` width** |
| Storefront Sneaker PDP (3D Mode) | `1` / `2` / `1` (`#main-content`) / `1` | `1` `h1`; `h1 -> h2 x4` (`0` skips) | `0 / 0` | `0 / 24` | `0 / 0` | Same `4` inline links; all 3D controls `>= 44px` |
| Storefront Crossbody PDP (2D-Only) | `1` / `2` / `1` (`#main-content`) / `1` | `1` `h1`; `h1 -> h2 x5 -> h3` (`0` skips) | `0 / 5` | `0 / 12` | `0 / 0` | `0` 3D buttons, `0` `<canvas>`, `0` skip-3D links, `0` preset radiogroups |
| Admin Overshirt Detail (`fdd1c8aa-...`) | `1` / `1` / `1` (`#main-content`) / `0` | `1` `h1`; `h1 -> h2 x5 -> h3` (`0` skips) | `0 / 3` | `0 / 26` | `0 / 21` | `0` non-`sr-only` controls under `44x44px` |

---

## 4. Keyboard Accessibility & Non-Trapping Navigation Transcript

### 4.1 `"Lewati Tampilan 3D"` Skip Link (`/products/atelier-boxy-wool-overshirt`)
- Tabbing from document start (`Tab` x16 through shell skip link, header nav, theme toggle, and breadcrumbs) focuses `<a href="#pdp-purchase-controls">Lewati Tampilan 3D</a>`, rendering visibly at `(12, 12, 162.8 x 44px)` with `#1F4E79` `2px` solid outline on `#F8F7F3` (**`8.08:1`**).
- Pressing `Enter` lands `document.activeElement` on `<section id="pdp-purchase-controls" tabindex="-1">` (`isExactPurchaseControls: true`), bypassing `Foto 2D`/`Model 3D`, `[role="region"]` canvas, and all 9 camera controls.

### 4.2 Mode Toggle, `[role="region"]` Canvas Wrapper & Non-Trapping `Tab` Exit
1. **Mode Toggle (`aria-pressed`):** `Foto 2D` `"true"` / `Model 3D` `"false"` -> `Enter` on `Model 3D` flips to `Foto 2D` `"false"` / `Model 3D` `"true"` and mounts `[data-testid="arven-3d-experience"]` (`loadState: "ready"`, `frameloop: "demand"`).
2. **`[role="region"]` Keyboard Commands & Live Region (`OBS-P7-A11Y-03` Verified):**

| Key Pressed inside `[role="region"]` | Focus Stays on `[role="region"]` | `[aria-live="polite"]` Announcement |
|---|---|---|
| `ArrowLeft` | `true` | `"Model diputar ke kiri."` |
| `ArrowRight` | `true` | `"Model diputar ke kanan."` |
| `ArrowUp` | `true` | `"Model dimiringkan ke atas."` |
| `ArrowDown` | `true` | `"Model dimiringkan ke bawah."` |
| `+` | `true` | `"Model 3D diperbesar."` |
| `-` | `true` | `"Model 3D diperkecil."` |
| `Home` | `true` | `"Tampilan kamera 3D direset ke posisi default."` |

3. **Zero Keyboard Trap (`Tab` Exit):**
   - Pressing `Tab` once from `[role="region"]` exits directly to `<button>Tiga Perempat</button>` (`insideRegion: false`), walks through all `9` `[data-testid="arven-3d-controls"]` buttons, and exits cleanly into `#pdp-purchase-controls`.

### 4.3 Camera Presets & Step Clicks `aria-live="polite"` Transcript
| Control Activated | `aria-pressed` | `[aria-live="polite"]` Announcement |
|---|---|---|
| `Depan` | `"true"` | `"Sudut kamera front diaktifkan."` |
| `Belakang` | `"true"` | `"Sudut kamera back diaktifkan."` |
| `Detail` | `"true"` | `"Sudut kamera detail diaktifkan."` |
| `Tiga Perempat` | `"true"` | `"Sudut kamera three quarter diaktifkan."` |
| `Putar Kiri 45 Derajat` | `null` | `"Model diputar ke kiri 45 derajat."` |
| `Putar Kanan 45 Derajat` | `null` | `"Model diputar ke kanan 45 derajat."` |
| `Perbesar Model 3D` | `null` | `"Model 3D diperbesar."` |
| `Perkecil Model 3D` | `null` | `"Model 3D diperkecil."` |
| `Reset Tampilan Kamera 3D` | `null` | `"Tampilan kamera 3D direset ke posisi default."` |

### 4.4 `[role="radiogroup"]` Material & Color Presets (`OBS-P7-A11Y-01` Verified)
| Action on `[role="radiogroup"]` | Focused `[role="radio"]` | `aria-checked` States (`Obsidian` / `Deep Stone`) | Synchronized SKU & 3D Slot `mat_fabric_primary` |
|---|---|---|---|
| Initial | `Obsidian` | `"true"` / `"false"` | `ARV-OUT-001` (`obsidian`, `#1D1E20`) |
| `ArrowRight` | **`Deep Stone`** | **`"false"` / `"true"`** | `ARV-OUT-001-L-STN` (`deep-stone`, `#5E5C54`) |
| `ArrowLeft` | **`Obsidian`** | **`"true"` / `"false"`** | `ARV-OUT-001` (`obsidian`, `#1D1E20`) |
| `End` | **`Deep Stone`** | **`"false"` / `"true"`** | `ARV-OUT-001-L-STN` (`deep-stone`, `#5E5C54`) |
| `Home` | **`Obsidian`** | **`"true"` / `"false"`** | `ARV-OUT-001` (`obsidian`, `#1D1E20`) |

### 4.5 Modal `Escape` Dismissal, Focus Trapping & Focus Restoration
- **Storefront `Size Guide` Modal:** `Enter` opens `[role="dialog"][aria-modal="true"]`, `Tab` traps inside dialog, `Escape` dismisses dialog and restores focus to **`Size Guide`** button (`sizeModalRestored: true`).
- **Admin `Preview 3D QA` Modal:** `Enter` opens `[role="dialog"][aria-modal="true"]`, `Tab` traverses `[role="region"]` cleanly into `"Tiga Perempat"` (`insideRegion: false`, `insideDialog: true`), `Escape` dismisses dialog and restores focus to **`Preview 3D QA`** button (`adminModalRestored: true`).

---

## 5. `:focus-visible` Contrast, 4-Edge Clipping Proof, `200%` Zoom & Reduced Motion

### 5.1 `:focus-visible` Contrast & 4-Edge Unclipped Verification (`>= 3.0:1`)

| Surface & Control | Computed `outline` (`t=0ms` & `t=220ms`) | `::after` Overlay Border | Background | Contrast Ratio | 4-Edge Pixel Check | Result |
|---|---|---|---|---|---|---|
| **Dark 3D Stage (Storefront):** `[role="region"]` canvas wrapper | `2px solid #82B0DC`, offset `-2px` | `2px solid #82B0DC` | `#17191B` | **`7.72:1`** | `top: 1148`, `bottom: 1144`, `left: 1526`, `right: 1526` (`allFour: true`) | **`PASS`** |
| **Dark 3D Stage (Admin Modal):** `[role="region"]` canvas wrapper | `2px solid #82B0DC`, offset `-2px` | `2px solid #82B0DC` | `#17191B` | **`7.72:1`** | `top: 1440`, `bottom: 1440`, `left: 1920`, `right: 1920` (`allFour: true`) | **`PASS`** |
| **Dark 3D Stage:** `Tiga Perempat` camera button | `2px solid #82B0DC`, offset `2px` | N/A | `#17191B` (`#35383A` fill) | **`7.72:1`** (`5.17:1` vs fill) | Unclipped | **`PASS`** |
| **Light PDP:** `ProductCard` media `<a>` | `2px solid #1F4E79`, offset `-2px` | `2px solid #1F4E79` | `#E9E4DA` | **`6.84:1`** | `top: 566`, `bottom: 570`, `left: 754`, `right: 754` (`allFourEdgesPresent: true`) | **`PASS`** |
| **Light PDP:** `"Lewati Tampilan 3D"` skip link | `2px solid #1F4E79`, offset `2px` | N/A | `#F8F7F3` | **`8.08:1`** | Unclipped | **`PASS`** |
| **Light PDP:** `Model 3D` Mode Toggle (`t=0ms` & `t=220ms`) | `2px solid #1F4E79`, offset `2px` | N/A | `#F8F7F3` | **`8.08:1`** (at `0ms`) | Unclipped | **`PASS`** |
| **Light PDP:** `Obsidian` Preset Radio (`t=0ms` & `t=220ms`) | `2px solid #1F4E79`, offset `2px` | N/A | `#F8F7F3` | **`8.08:1`** (at `0ms`) | Unclipped | **`PASS`** |

### 5.2 Zoom `200%` (`640x400`), Mobile (`375x812`), Reduced Motion & WebGL Fallback
- **`640x400` (`200%` desktop zoom equivalent) on Overshirt PDP `Model 3D`:** `scrollWidth = 640`, `overflowPx = 0px`, `0` `@axe-core/playwright` violations.
- **`375x812` Mobile on Overshirt PDP `Model 3D`:** `overflowPx = 0px`, mobile touch gate toggles `aria-pressed="false"` -> `"true"`, `0` `@axe-core/playwright` violations.
- **Reduced Motion (`emulateMedia({ reducedMotion: 'reduce' })`):** `matches === true`, renders `'Gerak Dikurangi'`, `window.__ARVEN_3D_DIAGNOSTICS__.reducedMotion === true`, `0` `@axe-core/playwright` violations.
- **WebGL-Disabled 2D Fallback (`--disable-webgl --disable-webgl2 --disable-3d-apis`):** Renders `[data-testid="arven-3d-fallback"]`, `"Kembali ke Foto 2D"` restores `Foto 2D` `aria-pressed="true"`, `0` `@axe-core/playwright` violations.

---

## 6. Admin Authentication Cleanup & Runtime Hygiene

- **Admin TOTP MFA Lifecycle:** Authenticated once as `owner.dev@arven.local` via `/login` -> `/mfa/verify` (live TOTP step `59834481`), audited `/catalog/products/fdd1c8aa-2047-4b13-9d19-b895d90e44c7` in Dark & Light themes + `Preview 3D QA` Modal, and signed out via `Sign Out` -> redirected to `http://localhost:3001/login`, verified `GET /api/v1/auth/me` returned **`401`**.
- **Runtime Hygiene:**
  - Storefront (`:3000`): `0` `pageerror`s, `0` `http5xx`, `1` expected caught `404` on `GET /api/v1/products/form-structured-calfskin-crossbody/3d-assets`.
  - Admin (`:3001`): `0` `pageerror`s, `0` `http5xx`, `1` expected `401` on post-logout `/api/v1/auth/me` verification.
  - WebGL Fallback browser: `0` `pageerror`s, `0` `http5xx`, `0` `http4xx`.
- **Scratch Artifacts (Outside Repository):**
  - `C:\Users\vickymosafan\.gemini\antigravity\brain\f49f969e-d8c4-4c9e-acf7-5a15ebc4bc4a\scratch\run-accessibility-reverify.mjs`
  - `C:\Users\vickymosafan\.gemini\antigravity\brain\f49f969e-d8c4-4c9e-acf7-5a15ebc4bc4a\scratch\verify-4edges-unclipped.mjs`
  - `C:\Users\vickymosafan\.gemini\antigravity\brain\f49f969e-d8c4-4c9e-acf7-5a15ebc4bc4a\scratch\accessibility-reverify-results.json`
  - `C:\Users\vickymosafan\.gemini\antigravity\brain\f49f969e-d8c4-4c9e-acf7-5a15ebc4bc4a\scratch\screenshots-reverify\` (`01`–`07`)

---

## 7. Final Checkpoint Verdict

- **`accessibility` Quality Checkpoint:** **`PASS`** *(Repair Iteration 4 verified live on `T3kRHW2DSXnWAih3fLlDc` / `bPZ-VK30xA9SdrP5WT1Zd`; `DEFECT-P7-A11Y-01`, `DEFECT-P7-A11Y-02`, and `OBS-P7-A11Y-01`..`04` closed; `13/13` `@axe-core/playwright` scans passed with `0` violations.)*
