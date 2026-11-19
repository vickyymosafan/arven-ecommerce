# ARVEN Phase 07 Visual & Layout QA Report

> **Harness Plan ID:** `22202ad0-0d75-430c-ad26-ba1895be7ec4`  
> **Task ID:** `87289777-234c-43b0-b897-4b30b527daa3`  
> **Checkpoint ID:** `layout`  
> **Independent Verifier:** `visual-qa-agent`  
> **Execution Timestamp (UTC):** `2026-11-18T18:29:20Z` – `2026-11-18T18:38:49Z`  
> **Live Builds Audited:**  
> - Storefront (`http://localhost:3000`): `BUILD_ID = nvuShbP1qGRRdLkauDvtM`  
> - Admin (`http://localhost:3001`): `BUILD_ID = LsU5Qdu5Bg-Ht0xSNk8kM`  
> - API (`http://localhost:4000`): Live (`PostgreSQL 18` + `Memurai/Redis`)  
> **Browser Engine:** Playwright Chromium `1248` (`D:\ms-playwright\chromium-1248\chrome-win64\chrome.exe`, headless, WebGL 2.0 via `--use-gl=angle --use-angle=swiftshader --enable-webgl --ignore-gpu-blocklist`)  
> **Viewports Audited:** `375x812`, `768x1024`, `1280x800`, `1440x900`  
> **Overall Verdict:** **`PASS`** (`0px` horizontal page overflow across every Storefront & Admin view/modal, `0` overlapping interactive controls, `0` broken `<dl>`/flex rows, `0` broken images, `100%` `aspect-[3/4]` = `0.750` stage integrity, `100%` `48px` flush `Add to Bag` + `Size Guide` alignment at `>= 640px`, and `0` stray 3D controls on 2D-only PDPs; `3` non-blocking visual polish observations noted in §7)

---

## 1. Executive Summary

Independent visual and DOM layout verification across **Storefront** (`atelier-boxy-wool-overshirt` 2D & 3D, `movement-minimalist-leather-sneaker` 3D, `form-structured-calfskin-crossbody` 2D-only, `artisan-leather-crossbody-bag` 404 check, `/shop`, `/cart` empty & filled) and **Admin** (`/catalog/products/fdd1c8aa-2047-4b13-9d19-b895d90e44c7` authenticated via live TOTP MFA as `owner.dev@arven.local` + `Preview 3D QA` modal + clean sign-out) confirms **PASS** for the Phase 07 `layout` checkpoint:

- **Surface & Design Contract Polarity ([`DESIGN.md`](../../../DESIGN.md)):** Storefront renders on Light Ivory (`rgb(248, 247, 243)` / `#F8F7F3`) with Charcoal primary ink (`rgb(23, 25, 27)` / `#17191B`), while `[data-testid="product-3d-viewer-island"]` renders cleanly inside its Dark Showcase frame (`background-color: rgb(23, 25, 27)` `#17191B`, `border-color: rgb(53, 56, 58)` `#35383A`, text `rgb(248, 247, 243)` `#F8F7F3`, active camera preset surface `rgb(53, 56, 58)` `#35383A`). Admin renders cleanly in Dark Governance polarity.
- **Stage `aspect-[3/4]` Integrity:** Every 2D gallery frame and every 3D `[role="region"]` + WebGL `<canvas>` across Storefront (`375`, `768`, `1280`, `1440`) and Admin `Preview 3D QA` modal measured an exact **`0.750`** aspect ratio (`3:4`), with `loadState = "ready"`, `contextLostCount = 0`, and `frameloop = "demand"`.
- **Zero Overlaps, Clipping, or Overflow:** Pairwise bounding-box intersection checks across Mode Toggle, Camera Presets, Step Controls, Material & Color Presets, `VariantSelector`, Quantity Stepper, and CTA action bar reported **`0` overlaps** and **`0` viewport-clipping elements**, with `overflowPx = 0` (`scrollWidth === innerWidth`) across all audited routes and modals.
- **Purchase CTA Alignment (`Add to Bag` + `Size Guide`):**
  - At `375x812`: cleanly stacked full-width (`343 × 48px` each, `12px` vertical gap).
  - At `768x1024`, `1280x800`, and `1440x900`: single-line flush alignment (`height = 48px` on both buttons, exact matching `y` coordinate, `Size Guide` `126.7 × 48px` with `white-space: nowrap`, `12px` horizontal gap).
- **Clean Admin TOTP Login & Sign-Out:** Live TOTP verification succeeded on `owner.dev@arven.local` (`nowStep: 59834221 > previousDbStep: 59834180`), and clicking `Sign Out` redirected cleanly to `http://localhost:3001/login` with `/api/v1/auth/me` returning `401`.

---

## 2. Storefront PDP: `/products/atelier-boxy-wool-overshirt` (2D & 3D Views)

### 2.1 High-Level Matrix (`2D` & `3D` Modes)

| Viewport | Mode | Page Overflow | Stage Dimensions (`W × H`, Ratio) | Canvas Attrs | 3D Tier / State / `touch-action` | Broken `<img>` | Pairwise Control Overlaps |
|---|---|---|---|---|---|---|---|
| `375x812` | **2D** | `0px` (`375/375`) | `343 × 457.3px` (`0.750`) | `n/a` | `n/a` | `0 / 5` | `0` |
| `375x812` | **3D** | `0px` (`375/375`) | `339 × 452.0px` (`0.750`) | `339 × 452` | `lite` / `ready` / `pan-y` | `0 / 1` | `0` |
| `768x1024` | **2D** | `0px` (`768/768`) | `720 × 960.0px` (`0.750`) | `n/a` | `n/a` | `0 / 5` | `0` |
| `768x1024` | **3D** | `0px` (`768/768`) | `716 × 954.7px` (`0.750`) | `716 × 954` | `default` / `ready` / `none` | `0 / 1` | `0` |
| `1280x800` | **2D** | `0px` (`1280/1280`) | `572 × 762.7px` (`0.750`) | `n/a` | `n/a` | `0 / 5` | `0` |
| `1280x800` | **3D** | `0px` (`1280/1280`) | `568 × 757.3px` (`0.750`) | `568 × 757` | `default` / `ready` / `none` | `0 / 1` | `0` |
| `1440x900` | **2D** | `0px` (`1440/1440`) | `652 × 869.3px` (`0.750`) | `n/a` | `n/a` | `0 / 5` | `0` |
| `1440x900` | **3D** | `0px` (`1440/1440`) | `648 × 864.0px` (`0.750`) | `648 × 864` | `default` / `ready` / `none` | `0 / 1` | `0` |

### 2.2 Exact Bounding Rects (`3D` View Active)

| Control Group | Control Label | `375x812` (`W×H @ x,y`) | `768x1024` (`W×H @ x,y`) | `1280x800` (`W×H @ x,y`) | `1440x900` (`W×H @ x,y`) |
|---|---|---|---|---|---|
| **Mode Toggle** | `Foto 2D` | `82.5×44 @ 16, 213` | `82.5×44 @ 24, 189` | `82.5×44 @ 48, 205` | `82.5×44 @ 48, 205` |
| **Mode Toggle** | `Model 3D` | `92.8×44 @ 106.5, 213` | `92.8×44 @ 114.5, 189` | `92.8×44 @ 138.5, 205` | `92.8×44 @ 138.5, 205` |
| **Camera Presets** | `Tiga Perempat` | `115.2×44 @ 30, 740` | `115.2×44 @ 42, 1218.7` | `115.2×44 @ 66, 1037.3` | `115.2×44 @ 66, 1144` |
| **Camera Presets** | `Depan` | `66.6×44 @ 153.2, 740` | `66.6×44 @ 165.2, 1218.7` | `66.6×44 @ 189.2, 1037.3` | `66.6×44 @ 189.2, 1144` |
| **Camera Presets** | `Belakang` | `83.7×44 @ 227.8, 740` | `83.7×44 @ 239.8, 1218.7` | `83.7×44 @ 263.8, 1037.3` | `83.7×44 @ 263.8, 1144` |
| **Camera Presets** | `Detail` | `62.4×44 @ 30, 792` | `62.4×44 @ 331.5, 1218.7` | `62.4×44 @ 355.5, 1037.3` | `62.4×44 @ 355.5, 1144` |
| **Step Controls** | `Putar Kiri 45°` | `99.5×44 @ 30, 872` | `99.5×44 @ 42, 1274.7` | `99.5×44 @ 66, 1093.3` | `99.5×44 @ 66, 1200` |
| **Step Controls** | `Putar Kanan 45°` | `117.2×44 @ 137.5, 872` | `117.2×44 @ 149.5, 1274.7` | `117.2×44 @ 173.5, 1093.3` | `117.2×44 @ 173.5, 1200` |
| **Step Controls** | `Perbesar` | `77.7×44 @ 262.7, 872` | `77.7×44 @ 274.7, 1274.7` | `77.7×44 @ 298.7, 1093.3` | `77.7×44 @ 298.7, 1200` |
| **Step Controls** | `Perkecil` | `71.9×44 @ 30, 924` | `71.9×44 @ 360.4, 1274.7` | `71.9×44 @ 384.4, 1093.3` | `71.9×44 @ 384.4, 1200` |
| **Step Controls** | `Reset Tampilan` | `112.1×44 @ 109.9, 924` | `112.1×44 @ 440.4, 1274.7` | `112.1×44 @ 464.4, 1093.3` | `112.1×44 @ 464.4, 1200` |
| **Mobile Touch Gate** | `Aktifkan Putar 3D` | `124.5×44 @ 30, 976` | *(not mounted >=768px)* | *(not mounted >=768px)* | *(not mounted >=768px)* |
| **Material Presets** | `Obsidian` | `110.6×44 @ 16, 1435` | `110.6×44 @ 24, 1678.4` | `110.6×44 @ 660, 465.8` | `110.6×44 @ 740, 465.8` |
| **Material Presets** | `Deep Stone` | `124.2×44 @ 136.6, 1435` | `124.2×44 @ 144.6, 1678.4` | `124.2×44 @ 780.6, 465.8` | `124.2×44 @ 860.6, 465.8` |
| **Variant Color** | `Obsidian` | `110.6×44 @ 16, 1531` | `110.6×44 @ 24, 1774.4` | `110.6×44 @ 660, 561.8` | `110.6×44 @ 740, 561.8` |
| **Variant Color** | `Deep Stone` | `124.2×44 @ 136.6, 1531` | `124.2×44 @ 144.6, 1774.4` | `124.2×44 @ 780.6, 561.8` | `124.2×44 @ 860.6, 561.8` |
| **Variant Size** | `L` / `M` / `XL` | `44×44` each (`x: 16, 70, 124`) | `44×44` each (`x: 24, 78, 132`) | `44×44` each (`x: 660, 714, 768`) | `44×44` each (`x: 740, 794, 848`) |
| **Qty Stepper** | `-` / `1` / `+` | `44×44` / `48×44` / `44×44` | `44×44` / `48×44` / `44×44` | `44×44` / `48×44` / `44×44` | `44×44` / `48×44` / `44×44` |
| **Purchase CTA** | `Add to Bag` | `343×48 @ 16, 1928` | `581.3×48 @ 24, 2171.4` | `433.3×48 @ 660, 958.8` | `513.3×48 @ 740, 958.8` |
| **Purchase CTA** | `Size Guide` | `343×48 @ 16, 1988` | `126.7×48 @ 617.3, 2171.4` | `126.7×48 @ 1105.3, 958.8` | `126.7×48 @ 1265.3, 958.8` |

- **Interactive 3D Sync Check (`1280x800`):** Clicking `Depan` -> `Putar Kiri 45°` -> `Deep Stone` updated `window.__ARVEN_3D_DIAGNOSTICS__` deterministically (`cameraPreset: "front"`, `activePresetCode: "deep-stone"`) with `overflowPx = 0`.
- **2D Gallery & Specs:** 3 gallery thumbnail buttons (`galleryThumbOverlaps: []`), 4 spec cards (`specsCardOverlaps: []`), and Related Garments card (`aspect-[3/4]`) rendered cleanly without distortion.

---

## 3. Storefront Footwear (`3D`) & 2D-Only Crossbody Checks

### 3.1 `/products/movement-minimalist-leather-sneaker` (`Model 3D` Active)

| Viewport | Overflow | Stage `W × H` (Ratio) | 3D State | Presets (`Cream` / `Charcoal`) | `Add to Bag` (`W × H @ y`) | `Size Guide` (`W × H @ y`) | Overlaps |
|---|---|---|---|---|---|---|---|
| `375x812` | `0px` | `339 × 452px` (`0.750`) | `ready` | `96.9×44` / `108.3×44` | `343×48 @ y=1965.5` | `343×48 @ y=2025.5` | `0` |
| `768x1024` | `0px` | `716 × 954.7px` (`0.750`) | `ready` | `96.9×44` / `108.3×44` | `581.3×48 @ y=2171.4` | `126.7×48 @ y=2171.4` | `0` |
| `1280x800` | `0px` | `568 × 757.3px` (`0.750`) | `ready` | `96.9×44` / `108.3×44` | `433.3×48 @ y=981.5` | `126.7×48 @ y=981.5` | `0` |
| `1440x900` | `0px` | `648 × 864px` (`0.750`) | `ready` | `96.9×44` / `108.3×44` | `513.3×48 @ y=958.8` | `126.7×48 @ y=958.8` | `0` |

### 3.2 2D-Only Product Check (`/products/form-structured-calfskin-crossbody` & `/products/artisan-leather-crossbody-bag`)

- **Catalog Slug Discrepancy Verified:** The slug `/products/artisan-leather-crossbody-bag` does not exist in PostgreSQL (`GET /api/v1/products/artisan-leather-crossbody-bag` returns `404`), rendering the `"Product not found"` `EmptyState` across `375`, `768`, `1280`, and `1440` with `0px` overflow and `0` stray 3D controls.
- **Actual Seeded 2D-Only Crossbody (`/products/form-structured-calfskin-crossbody`, `has3dEnabled: false`):**

| Viewport | Overflow | 2D Stage (`W × H`, Ratio) | Mode Toggle / 3D Island / 3D Controls / Presets / Skip Link / `<canvas>` | `Add to Bag` + `Size Guide` Alignment |
|---|---|---|---|---|
| `375x812` | `0px` | `343 × 457.3px` (`0.750`) | `0 / 0 / 0 / 0 / 0 / 0` (`Studio 3D` text absent) | Stacked (`y=1657` & `y=1717`, `48px` tall each) |
| `768x1024` | `0px` | `720 × 960.0px` (`0.750`) | `0 / 0 / 0 / 0 / 0 / 0` (`Studio 3D` text absent) | Flush single-line (`581.3×48` & `126.7×48 @ y=2115.1`) |
| `1280x800` | `0px` | `572 × 762.7px` (`0.750`) | `0 / 0 / 0 / 0 / 0 / 0` (`Studio 3D` text absent) | Flush single-line (`433.3×48` & `126.7×48 @ y=885.5`) |
| `1440x900` | `0px` | `652 × 869.3px` (`0.750`) | `0 / 0 / 0 / 0 / 0 / 0` (`Studio 3D` text absent) | Flush single-line (`513.3×48` & `126.7×48 @ y=862.8`) |

---

## 4. Storefront `/shop` & `/cart` Sanity Check

| Route | Viewport | Overflow | Broken `<img>` | Grid / Line-Item Metrics |
|---|---|---|---|---|
| `/shop` | `375x812` | `0px` | `0` | `11` cards, `1` col (`343px` wide, `aspect-[3/4] = 0.750`), filter panel clean |
| `/shop` | `768x1024` | `0px` | `0` | `11` cards, `2` cols (`350px` wide, `aspect-[3/4] = 0.750`) |
| `/shop` | `1280x800` | `0px` | `0` | `11` cards, `4` cols (`281px` wide, `aspect-[3/4] = 0.750`) |
| `/shop` | `1440x900` | `0px` | `0` | `11` cards, `4` cols (`321px` wide, `aspect-[3/4] = 0.750`) |
| `/cart` *(Empty)* | `375`, `768`, `1280`, `1440` | `0px` (all 4) | `0` | Empty state centered inside Ivory canvas; primary + secondary CTAs aligned |
| `/cart` *(1 Item)* | `375x812` | `0px` | `0` | Thumbnail `80×118px`, min button height `44px`, summary stacked cleanly |
| `/cart` *(1 Item)* | `768`, `1280`, `1440` | `0px` (all 3) | `0` | Thumbnail `96×128px` (`3:4`), min button height `44px`, `7:5` summary sidebar at `1280`/`1440` |

*(Added test item was removed via `Remove` immediately after verifying `/cart`, restoring the empty guest bag.)*

---

## 5. Admin Product Detail & 3D Studio (`/catalog/products/fdd1c8aa-2047-4b13-9d19-b895d90e44c7`) + `Preview 3D QA` Modal

Authenticated via `/login` (`owner.dev@arven.local`) + live TOTP MFA (`/mfa/verify`, `nowStep: 59834221`, `previousDbStep: 59834180`), and signed out cleanly via `Sign Out` (`redirectedUrl: http://localhost:3001/login`, `/api/v1/auth/me` -> `401`).

### 5.1 Page Layout, Variants Table / `<dl>` Cards, Forms & 3D Studio Controls

| Viewport | Page Overflow | Variants View | Table Wrapper Overflow | Clipped `<th>`/`<td>` | Visible `<dl>` Rows / Broken `<dl>` Rows | `#edit-prod-3d-enabled` Label (`W×H`) | Create Preset Form Grid (`W×H` per input) | `Add Preset` Button (`W×H`) |
|---|---|---|---|---|---|---|---|---|
| `375x812` | `0px` | `<dl>` Cards (`tableVisible: false`) | `0px` | `0` | `20 / 0` | `293×52` (`y=2206.3`) | 1-col (`259×46`, `259×46`, `259×46`, `259×45`) | `98.3×44 @ 218.7, 7502.2` |
| `768x1024` | `0px` | `<table>` (`tableVisible: true`) | `0px` | `0` | `0 / 0` | `319×52` (`y=1412.5`) | 2-col (`302×46` each) | `98.3×44 @ 595.7, 4487.5` |
| `1280x800` | `0px` | `<table>` (`tableVisible: true`) | `0px` | `0` | `0 / 0` | `390.9×44` (`y=1236.5`) | 4-col (`199×46` each) | `98.3×44 @ 1091.7, 3386.2` |
| `1440x900` | `0px` | `<table>` (`tableVisible: true`) | `0px` | `0` | `0 / 0` | `390.9×44` (`y=1236.5`) | 4-col (`239×46` each) | `98.3×44 @ 1251.7, 3397.3` |

- **3D Version Card (`v0001`, `READY`, `ACTIVE VERSION`, `GLB`, `9,924 B`, `132 tri / 264 vtx`, `2 preset(s)`, `VALIDATION PASSED`):** Contained cleanly inside card borders across all 4 viewports (`w: 293px` on `375`, `654px` on `768`, `878px` on `1280`, `1038px` on `1440`), with `Selected Version` and `Preview 3D QA` action buttons unclipped (`>= 44px`).
- **Preset List Cards (`Obsidian`, `Deep Stone`):** Circular swatch indicator, code/hex monospace line, linked SKU badge (`ARV-OUT-001 (OBSIDIAN)`, `ARV-OUT-001-L-STN (DEEP STONE)`), and `Delete Preset` button (`>= 44px`) align cleanly on all 4 viewports.

### 5.2 `Preview 3D QA` Modal Framing

| Viewport | Page Overflow | Dialog Rect (`W×H @ x,y`) | Fits Viewport (`X / Y`) | Canvas (`W×H`, Ratio) | Load State | Controls Clipping Right | Internal Modal Scroll Behavior |
|---|---|---|---|---|---|---|---|
| `375x812` | `0px` | `375×730.8 @ 0, 81.2` | `true / true` | `331×441.3` (`0.750`) | `ready` | `0` | `scrollHeight: 852 / clientHeight: 594`; scrolling `scrollTop: 258` brings all controls cleanly inside dialog (`477.8..794.8`) |
| `768x1024` | `0px` | `736×921.6 @ 16, 51.2` | `true / true` | `684×912.0` (`0.750`) | `ready` | `0` | Internal `.overflow-y-auto` scrolls to reach bottom controls |
| `1280x800` | `0px` | `768×720.0 @ 256, 40` | `true / true` | `716×954.7` (`0.750`) | `ready` | `0` | `scrollHeight: 1186 / clientHeight: 606`; scrolling `scrollTop: 580` brings all controls cleanly inside dialog (`605.2..742.2`) |
| `1440x900` | `0px` | `768×810.0 @ 336, 45` | `true / true` | `716×954.7` (`0.750`) | `ready` | `0` | Internal `.overflow-y-auto` scrolls to reach bottom controls |

---

## 6. Screenshot Verification Notes

All screenshots were saved to `C:\Users\vickymosafan\.gemini\antigravity\brain\7d8fffc9-54fc-4337-86aa-8694cfd9a077\scratch\screenshots\` and visually inspected directly via `read_file`:

- **Storefront Overshirt 2D & 3D (`sf-overshirt-2d-{375,768,1280,1440}.png`, `sf-overshirt-3d-{375,768,1280,1440}.png`, `sf-overshirt-3d-full-{375,768,1280,1440}.png`):** Light Ivory `#F8F7F3` background frames the `#17191B` Dark Showcase 3D stage cleanly without border bleed or overlap. At `1280` and `1440`, the 6:6 split places `Foto 2D`/`Model 3D` + 3D stage + camera/step strip on the left and typography, presets, variant selector, stepper, `Add to Bag` + `Size Guide`, and 2×2 spec cards on the right. Related Garments card sits cleanly below.
- **Storefront Sneaker 3D (`sf-sneaker-3d-{375,768,1280,1440}.png`):** Footwear 3D GLB renders centered inside the `3:4` dark stage (`Cream` / `Charcoal` presets, EU sizes `42/40/41/43`, flush `48px` CTA bar at `>= 640px`).
- **Storefront 2D-Only & 404 (`sf-crossbody-2d-{375,768,1280,1440}.png`, `sf-artisan-404-1280.png`):** `form-structured-calfskin-crossbody` displays 2D gallery + 3 thumbnails + color/size selectors + flush CTA bar with zero stray 3D controls; `artisan-leather-crossbody-bag` displays the clean `Product not found` EmptyState.
- **Storefront `/shop` & `/cart` (`sf-shop-{375,768,1280,1440}.png`, `sf-cart-empty-{375,1280}.png`, `sf-cart-filled-{375,768,1280,1440}.png`):** Grid columns (`1 / 2 / 4 / 4`), filter panel, empty bag state, and filled cart line item + summary sidebar match expected layout without regressions.
- **Admin Product Detail + 3D Studio + Modal (`admin-product-3d-{375,768,1280,1440}.png`, `admin-studio-section-{375,768,1280,1440}.png`, `admin-modal-3d-{375,768,1280,1440}.png`, `admin-modal-3d-scrolled-{375,1280}.png`):** Dark governance shell, Publish Gate cards, Metadata `#edit-prod-3d-enabled`, Variants `<dl>` cards at `375px` and table at `1280`/`1440`, 3D Version card, Preset cards, Create Preset 1/2/4-col form, and `Preview 3D QA` modal render cleanly without page overflow or overlapping controls.

---

## 7. Non-Blocking Visual & UX Polish Observations

1. **`OBS-07-01` — `Preview 3D QA` Modal Canvas Height vs `max-h-[90dvh]` (`apps/admin/src/components/catalog/admin-product-3d-panel.tsx`):**
   - At `768x1024`, `1280x800`, and `1440x900`, `Modal size="lg"` (`768px` wide) renders `DynamicAdminProductExperience` at full inner width (`716px`), producing a `716 × 954.7px` `aspect-[3/4]` canvas inside a `720px` (`1280x800`) or `810px` (`1440x900`) tall dialog. Consequently, `<AccessibleProductControls>` sits below the modal scroll fold (`controlsTop: 1185.2px > dialogBottom: 760px` at `1280x800`) until the user scrolls inside the modal's `.overflow-y-auto` body (`scrollTop: 580` verified functional in `admin-modal-3d-scrolled-1280.png`). Constraining the 3D wrapper inside the modal (e.g., `mx-auto max-w-[400px]`) would keep both the 3D garment and its camera controls visible simultaneously without internal scrolling.
2. **`OBS-07-02` — Admin `Variants & Audited Pricing` Table SKU Wrapping at `768x1024` (`apps/admin/src/components/catalog/admin-product-detail-view.tsx`):**
   - Because `DataTable` defaults to `tableBreakpoint="md"` (`768px`), the 5-column table squeezes into `652px` at `768px`, giving `SKU` `67.8px` total width (`28.8px` inner `<code>` width) so `ARV-OUT-001-M-OBS` wraps across `5` lines (`h: 95px`) and `Actions` buttons stack to `131.5px` row height. Setting `tableBreakpoint="lg"` (or adding `whitespace-nowrap` to SKU `<code>`) would prevent 5-line SKU wrapping at tablet portrait (`768px`).
3. **`OBS-07-03` — 2D-Only Crossbody Slug & Unconditional `/3d-assets` Prefetch (`apps/storefront/src/components/catalog/product-detail-view.tsx`):**
   - `/products/artisan-leather-crossbody-bag` returns `404` because the seeded 2D-only crossbody bag slug is `/products/form-structured-calfskin-crossbody`. Additionally, `ProductDetailView` calls `storefrontApi.getProduct3DAssets(slug)` even when `data.has3dEnabled === false`, producing an expected caught `404` console/network entry on 2D-only PDPs while keeping 3D UI hidden.

---

## 8. Final Checkpoint Verdict

- **`layout` Quality Checkpoint:** **`PASS`**
